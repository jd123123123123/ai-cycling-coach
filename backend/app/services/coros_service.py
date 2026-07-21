"""COROS sync service — maps COROS activities into the app's activities.

Mirrors wahoo_service. Responsibilities:
  1. Keep a user's COROS access token fresh (auto-refresh via refresh_token).
  2. Fetch activities and map each into an ``ActivityCreate`` with
     ``source="coros"`` and a stable ``external_id=f"coros-{activity_id}"``.
  3. Persist via ``activity_service.create_activity`` (auto-TSS incl. hrTSS),
     deduping on external_id. One bad activity never fails the batch.

WHAT COROS PROVIDES (and which cards it lights up)
--------------------------------------------------
COROS is a SUMMARY-ONLY source: the Open API returns per-activity summaries
(and a per-activity detail with laps/zones) but NOT per-second time-series
streams. So map_activity fills every summary column the analysis cards read:

  COROS field          → Activity column        → cards it populates
  -------------------    --------------------      ------------------------------
  duration_seconds     → duration_seconds        ride duration / all load cards
  distance_meters      → distance_meters         ride summary, speed
  avg_power            → average_power           avg-power, IF fallback
  normalized_power     → normalized_power        NP, Intensity Factor (NP/FTP),
                                                  Efficiency Factor (NP/avgHR)
  avg_hr / max_hr      → average_hr / max_hr     HR summary, EF, hrTSS
  calories (÷1000)     → calories                energy / fuelling summary
  sport_type (200/2)   → sport="cycling"         everything (gates cycling TSS)
  training_load        → external_tss fallback   TSS/CTL/ATL/TSB when no FTP
  (NP + athlete FTP)   → tss (Coggan, computed)  TSS/PMC/CTL — see create_activity
  elevation_gain,      → raw_data (preserved;    no dedicated column yet —
  cadence, zones, laps    honest, not dropped)     documented model gaps

WHAT COROS CANNOT POWER (honest "—")
------------------------------------
No per-second streams means NO ActivityStream row is ever created for a COROS
ride, so these stream-derived surfaces stay empty by design:
  • Mean-max power curve / Power Profile curve (mmp_curve)
  • Aerobic decoupling (Pw:HR drift) and CP/W′ from a single ride
  • Power-over-time / HR-over-time graphs
We NEVER fabricate a stream to fill them. Strava / Apple Health carry the
per-second data that lights those cards up.

The mapping + token-refresh logic is unit-tested with a mocked httpx client;
no real COROS network/credentials are required.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.coros_credential import CorosCredential
from app.schemas.activity import ActivityCreate
from app.services import coros_client
from app.services.activity_service import create_activity

logger = logging.getLogger(__name__)

# Refresh the access token slightly before it actually expires to avoid racing
# a 401 mid-sync.
_TOKEN_REFRESH_SKEW = timedelta(seconds=60)

# ── COROS sportType → sport ──────────────────────────────────────────────────
# COROS enumerates activity types with a numeric ``sportType`` (and mode/subMode
# variants). We collapse them into the three sports this app models
# (cycling / running / gym). Values not in the map fall through to the family
# heuristic in _sport_from_type, ultimately defaulting to cycling.
# Codes per the researched COROS sportType table. Documented cycling codes are
# 200 (Road Bike) and 2 (Indoor Cycling); the 20x block covers the bike family.
_SPORT_TYPE_SPORT: dict[int, str] = {
    2: "cycling",     # Indoor Cycling (documented)
    100: "running",   # Run
    101: "running",   # Indoor Run
    102: "running",   # Trail Run
    103: "running",   # Track Run
    104: "running",   # Hike / Walk family
    200: "cycling",   # Road Bike (documented)
    201: "cycling",   # Indoor Bike
    202: "cycling",   # Gravel / MTB family
    900: "gym",       # Gym / Strength
    901: "gym",       # Gym Cardio
}


def _sport_from_type(type_id: Any) -> str:
    """Map a COROS sportType to cycling/running/gym.

    Defaults to ``cycling`` (this is a cycling coach and COROS is bike-heavy in
    this context) so an activity is never silently dropped.
    """
    try:
        tid = int(type_id)
    except (TypeError, ValueError):
        return "cycling"
    if tid in _SPORT_TYPE_SPORT:
        return _SPORT_TYPE_SPORT[tid]
    # Rough family fallback for codes we don't explicitly list.
    if 100 <= tid < 200:
        return "running"
    if 200 <= tid < 300:
        return "cycling"
    if 900 <= tid < 1000:
        return "gym"
    return "cycling"


def _num(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _first(raw: dict[str, Any], *keys: str) -> Any:
    """Return the first present (non-None, non-empty-string) value among keys.

    Accepts BOTH the researched snake_case field names (activity_id,
    start_time, avg_power, …) and the camelCase aliases COROS has also used
    (labelId, startTime, avgPower, …) so a payload in either convention maps.
    """
    for k in keys:
        v = raw.get(k)
        if v is not None and v != "":
            return v
    return None


# COROS reports energy in calories (cal), where 1 kcal = 1000 cal, so a
# ~720 kcal ride arrives as ~720000. We divide by 1000 to store dietary kcal.
# Guard: values already in kcal (small legacy/aliased payloads, or an activity
# that genuinely burned <_KCAL_RAW_THRESHOLD "units") are passed through
# unchanged — no real single activity burns 20,000+ kcal, so a value above the
# threshold is unambiguously raw calories.
_KCAL_RAW_THRESHOLD = 20_000.0


def _kcal(v: Any) -> int | None:
    """Normalise a COROS calorie value to dietary kcal (int), honestly."""
    raw = _num(v)
    if raw is None:
        return None
    kcal = raw / 1000.0 if raw >= _KCAL_RAW_THRESHOLD else raw
    return int(round(kcal)) if kcal > 0 else None


def _parse_dt(v: Any) -> datetime | None:
    """Parse a COROS start time — epoch seconds (int) or ISO string."""
    if v is None or v == "":
        return None
    # Epoch seconds (COROS ``startTime``/``startTimestamp`` are unix seconds).
    if isinstance(v, (int, float)) or (isinstance(v, str) and v.strip().isdigit()):
        try:
            secs = int(v)
            # Guard against millisecond timestamps.
            if secs > 10_000_000_000:
                secs //= 1000
            return datetime.fromtimestamp(secs, tz=timezone.utc)
        except (ValueError, OverflowError, OSError):
            return None
    try:
        dt = datetime.fromisoformat(str(v).strip().replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def map_activity(raw: dict[str, Any]) -> ActivityCreate | None:
    """Map a COROS activity dict → ActivityCreate, or None when unmappable.

    Comprehensively maps every summary field COROS provides into the app's
    Activity columns (see the module docstring for the full field table), so
    the ride-summary, avg/NP power, HR, IF/TSS/EF and energy cards all
    populate. Accepts both the researched snake_case field names and the
    camelCase aliases COROS has used.

    Requires an activity id, a start time and a positive duration — otherwise
    returns None (skipped).

    COROS is summary-only: no per-second streams are present, so no
    stream-derived fields (mmp_curve, decoupling, power/HR-over-time) are set
    here and NONE are fabricated — those stay honestly empty for COROS rides.
    Fields COROS provides that have no dedicated Activity column yet
    (elevation_gain, cadence, HR/power zones, laps) are preserved under
    ``raw_data`` rather than dropped.
    """
    if not isinstance(raw, dict):
        return None
    activity_id = _first(raw, "activity_id", "labelId", "id", "activityId")
    if activity_id is None:
        return None

    start = _parse_dt(
        _first(raw, "start_time", "startTime", "startTimestamp", "startTimeUtc", "date")
    )
    duration = _num(
        _first(raw, "duration_seconds", "totalTime", "duration", "workoutTime")
    )
    if start is None or not duration or duration <= 0:
        return None

    sport = _sport_from_type(_first(raw, "sport_type", "sportType", "mode"))

    distance = _num(_first(raw, "distance_meters", "distance", "totalDistance"))
    avg_power = _num(_first(raw, "avg_power", "avgPower", "averagePower"))
    norm_power = _num(_first(raw, "normalized_power", "normalizedPower", "np"))
    avg_hr = _num(_first(raw, "avg_hr", "avgHeartRate", "averageHeartRate"))
    max_hr = _num(_first(raw, "max_hr", "maxHeartRate", "maxHr"))
    kcal = _kcal(_first(raw, "calories", "calorie"))
    # COROS's own training load (its Training Load metric). Used only as a TSS
    # fallback when NP + athlete FTP can't yield a Coggan TSS (see below).
    training_load = _num(_first(raw, "training_load", "trainingLoad"))

    # Preserve the fields COROS provides that have no first-class column yet, so
    # nothing is silently dropped (honest, and available for later enrichment).
    raw_data: dict[str, Any] = {"coros_activity_id": activity_id}
    for src_key, dst_key in (
        ("elevation_gain", "elevation_gain"),
        ("elevationGain", "elevation_gain"),
        ("total_ascent", "elevation_gain"),
        ("cadence", "cadence"),
        ("avg_cadence", "cadence"),
        ("avgCadence", "cadence"),
        ("hr_zones", "hr_zones"),
        ("hrZones", "hr_zones"),
        ("power_zones", "power_zones"),
        ("powerZones", "power_zones"),
        ("laps", "laps"),
        ("lapList", "laps"),
        ("sport_name", "sport_name"),
        ("sportName", "sport_name"),
    ):
        val = raw.get(src_key)
        if val is not None and val != "" and dst_key not in raw_data:
            raw_data[dst_key] = val
    if training_load is not None:
        raw_data["coros_training_load"] = training_load

    return ActivityCreate(
        sport=sport,  # type: ignore[arg-type]
        started_at=start,
        duration_seconds=int(duration),
        distance_meters=distance,
        average_power=avg_power,
        normalized_power=norm_power,
        average_hr=int(round(avg_hr)) if avg_hr else None,
        max_hr=int(round(max_hr)) if max_hr else None,
        calories=kcal,
        # COROS Training Load as a TSS fallback ONLY when the sport-based
        # computation (NP × FTP Coggan TSS) can't run; the computed TSS wins.
        external_tss=training_load,
        raw_data=raw_data,
        title=_first(raw, "name", "sport_name", "sportName") or "COROS activity",
        source="coros",
        external_id=f"coros-{activity_id}",
    )


async def _load_profile(db: AsyncSession, user_id: int) -> AthleteProfile:
    """Load the athlete profile (needed by create_activity for TSS), or a stub."""
    result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        logger.warning(
            "No AthleteProfile for user_id=%s — COROS activities get TSS=None", user_id
        )
        profile = AthleteProfile(user_id=user_id)
    return profile


def apply_tokens(credential: CorosCredential, tokens: dict[str, Any]) -> None:
    """Write an OAuth token payload onto a credential (in-memory; caller flushes)."""
    credential.access_token = tokens["access_token"]
    # COROS returns a fresh refresh_token on refresh; keep the old one if absent.
    if tokens.get("refresh_token"):
        credential.refresh_token = tokens["refresh_token"]
    open_id = tokens.get("openId") or tokens.get("open_id")
    if open_id:
        credential.coros_user_id = str(open_id)
    if tokens.get("scope"):
        credential.scope = str(tokens["scope"])
    expires_in = tokens.get("expires_in")
    if expires_in is not None:
        try:
            credential.token_expires_at = datetime.now(timezone.utc) + timedelta(
                seconds=int(expires_in)
            )
        except (TypeError, ValueError):
            pass


async def ensure_fresh_token(
    db: AsyncSession,
    credential: CorosCredential,
    client: httpx.AsyncClient | None = None,
) -> str:
    """Return a valid access token, refreshing it in-place when expired."""
    now = datetime.now(timezone.utc)
    expires_at = credential.token_expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at is None or expires_at - _TOKEN_REFRESH_SKEW <= now:
        logger.info("Refreshing COROS access token for user_id=%s", credential.user_id)
        tokens = await coros_client.refresh_access_token(
            credential.refresh_token, client=client
        )
        apply_tokens(credential, tokens)
        await db.flush()
    return credential.access_token


async def _persist_activity(
    db: AsyncSession,
    user_id: int,
    profile: AthleteProfile,
    raw: dict[str, Any],
) -> bool:
    """Map + dedup + create one activity. Returns True if a new one was made.

    Never raises — one bad activity must not fail the batch.
    """
    try:
        mapped = map_activity(raw)
        if mapped is None:
            return False
        existing = await db.execute(
            select(Activity).where(
                Activity.user_id == user_id,
                Activity.external_id == mapped.external_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            return False
        await create_activity(db, user_id, mapped, profile)
        return True
    except Exception as exc:  # noqa: BLE001 — isolate one bad activity
        logger.warning(
            "Skipped a COROS activity for user_id=%s (id=%s): %s",
            user_id,
            raw.get("labelId") if isinstance(raw, dict) else None,
            exc,
        )
        return False


def _date_window(days: int) -> tuple[str, str]:
    """Return (startDate, endDate) as ``yyyyMMdd`` for the last ``days`` days."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return start.strftime("%Y%m%d"), end.strftime("%Y%m%d")


async def sync_user(
    db: AsyncSession,
    user_id: int,
    client: httpx.AsyncClient | None = None,
    days: int = 90,
) -> dict[str, Any]:
    """Pull the user's COROS activities and import new ones.

    Returns ``{"workouts_imported": N}``. Raises CorosAuthError only when the
    account isn't connected or the refresh token is dead.
    """
    result = await db.execute(
        select(CorosCredential).where(CorosCredential.user_id == user_id)
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        raise coros_client.CorosAuthError("No COROS account connected")

    access_token = await ensure_fresh_token(db, credential, client=client)
    profile = await _load_profile(db, user_id)

    start_date, end_date = _date_window(days)
    activities = await coros_client.fetch_activities(
        access_token,
        open_id=credential.coros_user_id,
        start_date=start_date,
        end_date=end_date,
        client=client,
    )

    imported = 0
    for raw in activities:
        if await _persist_activity(db, user_id, profile, raw):
            imported += 1

    credential.last_sync_at = datetime.now(timezone.utc)
    await db.commit()
    logger.info("COROS sync for user_id=%s imported %d activities", user_id, imported)
    return {"workouts_imported": imported}
