"""Wahoo sync service — maps Wahoo workouts into the app's activities.

Responsibilities:
  1. Keep a user's Wahoo access token fresh (auto-refresh via refresh_token).
  2. Fetch workouts and map each into an ``ActivityCreate`` (sport, duration,
     distance, power, HR, calories) with ``source="wahoo"`` and a stable
     ``external_id=f"wahoo-{workout_id}"``.
  3. Persist via ``activity_service.create_activity`` (auto-TSS incl. hrTSS),
     deduping on external_id. One bad workout never fails the batch.

The mapping + token-refresh logic is unit-tested with a mocked httpx client;
no real Wahoo network/credentials are required.
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
from app.models.wahoo_credential import WahooCredential
from app.schemas.activity import ActivityCreate
from app.services import wahoo_client
from app.services.activity_service import create_activity

logger = logging.getLogger(__name__)

# Refresh the access token slightly before it actually expires to avoid racing
# a 401 mid-sync.
_TOKEN_REFRESH_SKEW = timedelta(seconds=60)

# ── workout_type_id → sport ──────────────────────────────────────────────────
# Wahoo's workout_type_id enumerates specific activity types. We collapse them
# into the three sports this app models (cycling / running / gym). Values not in
# the map fall through to _sport_from_type_id's family heuristic.
_WORKOUT_TYPE_SPORT: dict[int, str] = {
    0: "cycling",   # BIKING
    1: "running",   # RUNNING
    2: "gym",       # FE (fitness equipment / general)
    3: "running",   # RUNNING_TRACK
    4: "running",   # RUNNING_TRAIL
    5: "running",   # RUNNING_TREADMILL
    6: "running",   # WALKING
    7: "running",   # WALKING_SPEED
    8: "running",   # WALKING_NORDIC
    9: "running",   # HIKING
    11: "cycling",  # BIKING_CYCLECROSS
    12: "cycling",  # BIKING_INDOOR
    13: "cycling",  # BIKING_MOUNTAIN
    14: "cycling",  # BIKING_RECUMBENT
    15: "cycling",  # BIKING_ROAD
    16: "cycling",  # BIKING_TRACK
    19: "gym",      # FE_TREADMILL
    20: "gym",      # FE_ELLIPTICAL
    21: "cycling",  # FE_BIKE (indoor trainer)
    22: "gym",      # FE_ROWER
    23: "gym",      # FE_CLIMBER
    61: "gym",      # STRENGTH_TRAINING (Wahoo strength family)
}


def _sport_from_type_id(type_id: Any) -> str:
    """Map a Wahoo workout_type_id to cycling/running/gym.

    Falls back to the family heuristic for unknown ids and, ultimately, to
    ``cycling`` (Wahoo devices are predominantly bike computers, and this is a
    cycling coach) so a workout is never silently dropped.
    """
    try:
        tid = int(type_id)
    except (TypeError, ValueError):
        return "cycling"
    if tid in _WORKOUT_TYPE_SPORT:
        return _WORKOUT_TYPE_SPORT[tid]
    # Rough family fallback for ids we don't explicitly list.
    if 1 <= tid <= 10:
        return "running"
    if 18 <= tid <= 23:
        return "gym"
    return "cycling"


def _num(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _parse_dt(s: Any) -> datetime | None:
    if not s:
        return None
    txt = str(s).strip()
    try:
        dt = datetime.fromisoformat(txt.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def map_workout(raw: dict[str, Any]) -> ActivityCreate | None:
    """Map a Wahoo workout dict → ActivityCreate, or None when unmappable.

    Reads metrics from ``workout_summary`` (duration_accum, distance_accum,
    power_avg, heart_rate_avg, calories_accum, ascent_accum) and the sport from
    ``workout_type_id``. Requires a workout id, a start time and a positive
    duration — otherwise returns None (skipped).
    """
    if not isinstance(raw, dict):
        return None
    workout_id = raw.get("id")
    if workout_id is None:
        return None

    summary = raw.get("workout_summary") or {}
    start = _parse_dt(raw.get("starts") or raw.get("starts_at") or raw.get("start"))
    duration = _num(summary.get("duration_accum") or raw.get("duration"))
    if start is None or not duration or duration <= 0:
        return None

    sport = _sport_from_type_id(raw.get("workout_type_id"))

    distance = _num(summary.get("distance_accum"))
    power = _num(summary.get("power_avg"))
    avg_hr = _num(summary.get("heart_rate_avg"))
    kcal = _num(summary.get("calories_accum"))

    return ActivityCreate(
        sport=sport,  # type: ignore[arg-type]
        started_at=start,
        duration_seconds=int(duration),
        distance_meters=distance,
        average_power=power,
        average_hr=int(round(avg_hr)) if avg_hr else None,
        calories=int(round(kcal)) if kcal else None,
        title=raw.get("name") or "Wahoo workout",
        source="wahoo",
        external_id=f"wahoo-{workout_id}",
    )


async def _load_profile(db: AsyncSession, user_id: int) -> AthleteProfile:
    """Load the athlete profile (needed by create_activity for TSS), or a stub."""
    result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        logger.warning(
            "No AthleteProfile for user_id=%s — Wahoo activities get TSS=None", user_id
        )
        profile = AthleteProfile(user_id=user_id)
    return profile


async def ensure_fresh_token(
    db: AsyncSession,
    credential: WahooCredential,
    client: httpx.AsyncClient | None = None,
) -> str:
    """Return a valid access token, refreshing it in-place when expired.

    Persists the new tokens/expiry on the credential when a refresh happens.
    """
    now = datetime.now(timezone.utc)
    expires_at = credential.token_expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at is None or expires_at - _TOKEN_REFRESH_SKEW <= now:
        logger.info("Refreshing Wahoo access token for user_id=%s", credential.user_id)
        tokens = await wahoo_client.refresh_access_token(
            credential.refresh_token, client=client
        )
        apply_tokens(credential, tokens)
        await db.flush()
    return credential.access_token


def apply_tokens(credential: WahooCredential, tokens: dict[str, Any]) -> None:
    """Write an OAuth token payload onto a credential (in-memory; caller flushes)."""
    credential.access_token = tokens["access_token"]
    # Wahoo returns a fresh refresh_token on refresh; keep the old one if absent.
    if tokens.get("refresh_token"):
        credential.refresh_token = tokens["refresh_token"]
    expires_in = tokens.get("expires_in")
    if expires_in is not None:
        credential.token_expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=int(expires_in)
        )


async def _persist_workout(
    db: AsyncSession,
    user_id: int,
    profile: AthleteProfile,
    raw: dict[str, Any],
) -> bool:
    """Map + dedup + create one workout. Returns True if a new activity was made.

    Never raises — one bad workout must not fail the batch.
    """
    try:
        mapped = map_workout(raw)
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
    except Exception as exc:  # noqa: BLE001 — isolate one bad workout
        logger.warning(
            "Skipped a Wahoo workout for user_id=%s (id=%s): %s",
            user_id,
            raw.get("id") if isinstance(raw, dict) else None,
            exc,
        )
        return False


async def ingest_workout(
    db: AsyncSession,
    user_id: int,
    raw: dict[str, Any],
) -> int:
    """Ingest a single pushed workout (webhook path). Returns 0 or 1 imported."""
    profile = await _load_profile(db, user_id)
    created = await _persist_workout(db, user_id, profile, raw)
    await db.commit()
    return 1 if created else 0


async def sync_user(
    db: AsyncSession,
    user_id: int,
    client: httpx.AsyncClient | None = None,
    max_pages: int = 10,
) -> dict[str, Any]:
    """Pull the user's Wahoo workouts and import new ones.

    Returns ``{"workouts_imported": N}``. Raises WahooAuthError only when the
    account isn't connected or the refresh token is dead.
    """
    result = await db.execute(
        select(WahooCredential).where(WahooCredential.user_id == user_id)
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        raise wahoo_client.WahooAuthError("No Wahoo account connected")

    access_token = await ensure_fresh_token(db, credential, client=client)
    profile = await _load_profile(db, user_id)

    imported = 0
    for page in range(1, max_pages + 1):
        workouts = await wahoo_client.fetch_workouts(
            access_token, page=page, client=client
        )
        if not workouts:
            break
        for raw in workouts:
            if await _persist_workout(db, user_id, profile, raw):
                imported += 1

    credential.last_sync_at = datetime.now(timezone.utc)
    await db.commit()
    logger.info("Wahoo sync for user_id=%s imported %d workouts", user_id, imported)
    return {"workouts_imported": imported}
