"""COROS sync service — maps COROS activities into the app's activities.

Mirrors wahoo_service. Responsibilities:
  1. Keep a user's COROS access token fresh (auto-refresh via refresh_token).
  2. Fetch activities and map each into an ``ActivityCreate`` (sport, duration,
     distance, power, HR, calories) with ``source="coros"`` and a stable
     ``external_id=f"coros-{activity_id}"``.
  3. Persist via ``activity_service.create_activity`` (auto-TSS incl. hrTSS),
     deduping on external_id. One bad activity never fails the batch.

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
# TODO(coros-docs): confirm the exact sportType code table against partner docs.
_SPORT_TYPE_SPORT: dict[int, str] = {
    100: "running",   # Run
    101: "running",   # Indoor Run
    102: "running",   # Trail Run
    103: "running",   # Track Run
    104: "running",   # Hike / Walk family
    200: "cycling",   # Bike
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

    Requires an activity id, a start time and a positive duration — otherwise
    returns None (skipped). Field names follow the best-known COROS Open API
    shape; TODO(coros-docs): confirm against partner docs.
    """
    if not isinstance(raw, dict):
        return None
    activity_id = raw.get("labelId") or raw.get("id") or raw.get("activityId")
    if activity_id is None:
        return None

    start = _parse_dt(
        raw.get("startTime")
        or raw.get("startTimestamp")
        or raw.get("startTimeUtc")
        or raw.get("date")
    )
    duration = _num(
        raw.get("totalTime")
        or raw.get("duration")
        or raw.get("workoutTime")
    )
    if start is None or not duration or duration <= 0:
        return None

    sport = _sport_from_type(raw.get("sportType") or raw.get("mode"))

    distance = _num(raw.get("distance") or raw.get("totalDistance"))
    power = _num(raw.get("avgPower") or raw.get("averagePower"))
    avg_hr = _num(raw.get("avgHeartRate") or raw.get("averageHeartRate"))
    kcal = _num(raw.get("calorie") or raw.get("calories"))

    return ActivityCreate(
        sport=sport,  # type: ignore[arg-type]
        started_at=start,
        duration_seconds=int(duration),
        distance_meters=distance,
        average_power=power,
        average_hr=int(round(avg_hr)) if avg_hr else None,
        calories=int(round(kcal)) if kcal else None,
        title=raw.get("name") or "COROS activity",
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
