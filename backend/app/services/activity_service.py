"""Activity CRUD service with auto-TSS calculation.

TSS is computed on creation based on sport type and athlete profile thresholds:
- cycling: power-based (Coggan TSS) using NP or average_power as fallback
- running: pace-based (rTSS) using distance/duration-derived speed
- gym: HR-based (hrTSS via Banister TRIMP)

If the athlete profile lacks the required thresholds, TSS is left as None.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, time

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.coach_brief import CoachBrief
from app.schemas.activity import ActivityCreate
from app.services.training_load import (
    calculate_cycling_tss,
    calculate_hr_tss,
    calculate_running_tss,
)

logger = logging.getLogger(__name__)

# 0.90 × HRmax is a standard, widely-used estimate of lactate-threshold HR
# (LTHR) when no measured threshold is available. This is the ONLY approximation
# permitted in TSS computation — every other input uses real, measured values.
_LTHR_HRMAX_FRACTION = 0.90


def _resolve_lthr(profile: AthleteProfile, prefer_running: bool = False) -> float | None:
    """Return a usable LTHR for hrTSS.

    Prefers a measured threshold (lthr_running/lthr_cycling). When both are null
    but max_heart_rate is set, falls back to the standard 0.90×HRmax estimate.
    Returns None when neither a measured LTHR nor an HRmax is available.
    """
    if prefer_running:
        measured = profile.lthr_running or profile.lthr_cycling
    else:
        measured = profile.lthr_cycling or profile.lthr_running
    if measured:
        return float(measured)
    if profile.max_heart_rate:
        # Standard LTHR estimate: 0.90 × HRmax.
        return round(_LTHR_HRMAX_FRACTION * profile.max_heart_rate)
    return None


def _compute_hr_tss(
    duration: int | float,
    data: ActivityCreate,
    profile: AthleteProfile,
    lthr: float | None,
    context: str,
) -> float | None:
    """Compute hrTSS from HR data, or None when HR data is genuinely absent.

    Guards against division-by-zero (HRmax must exceed HRrest).
    """
    if not all([data.average_hr, lthr, profile.resting_heart_rate, profile.max_heart_rate]):
        logger.debug(
            "Skipping %s hrTSS: average_hr=%s lthr=%s resting_hr=%s max_hr=%s",
            context,
            data.average_hr,
            lthr,
            profile.resting_heart_rate,
            profile.max_heart_rate,
        )
        return None
    if profile.max_heart_rate <= profile.resting_heart_rate:
        logger.warning(
            "Skipping %s hrTSS: max_hr (%s) <= resting_hr (%s)",
            context,
            profile.max_heart_rate,
            profile.resting_heart_rate,
        )
        return None
    try:
        # TODO: add sex field to AthleteProfile — defaulting to "male" for now
        return calculate_hr_tss(
            duration_seconds=duration,
            average_hr=float(data.average_hr),
            lthr=float(lthr),
            hr_rest=float(profile.resting_heart_rate),
            hr_max=float(profile.max_heart_rate),
            sex="male",
        )
    except (ValueError, ZeroDivisionError) as exc:
        logger.warning("%s hrTSS calculation failed: %s", context, exc)
        return None


def _compute_tss(data: ActivityCreate, profile: AthleteProfile) -> float | None:
    """Compute TSS from activity data and athlete profile thresholds.

    Returns None if the required thresholds are not set on the profile.
    """
    duration = data.duration_seconds
    if not duration or duration <= 0:
        return None

    if data.sport == "cycling":
        # Prefer normalized_power; fall back to average_power as NP estimate
        np_value = data.normalized_power or data.average_power
        if np_value is None:
            logger.debug("Skipping cycling TSS: no power data provided")
            return None
        if not profile.ftp_watts:
            logger.debug("Skipping cycling TSS: no FTP set on athlete profile")
            return None
        try:
            return calculate_cycling_tss(duration, np_value, profile.ftp_watts)
        except ValueError as exc:
            logger.warning("Cycling TSS calculation failed: %s", exc)
            return None

    elif data.sport == "running":
        # Preferred: pace-based rTSS when a real running threshold pace is set.
        if profile.running_threshold_pace_ms and data.distance_meters:
            # Compute speed in m/s from distance and duration
            speed_ms = data.distance_meters / duration
            try:
                return calculate_running_tss(duration, speed_ms, profile.running_threshold_pace_ms)
            except ValueError as exc:
                logger.warning("Running TSS calculation failed: %s", exc)
                return None
        # Fallback: HR-based TSS when threshold pace is missing but HR data exists.
        # Prefer a measured running LTHR; estimate 0.90×HRmax only when unset.
        lthr = _resolve_lthr(profile, prefer_running=True)
        return _compute_hr_tss(duration, data, profile, lthr, context="running")

    elif data.sport == "gym":
        # Prefer a measured LTHR (cycling, then running); estimate 0.90×HRmax
        # only when both measured thresholds are null.
        lthr = _resolve_lthr(profile, prefer_running=False)
        return _compute_hr_tss(duration, data, profile, lthr, context="gym")

    return None


async def create_activity(
    db: AsyncSession,
    user_id: int,
    data: ActivityCreate,
    profile: AthleteProfile,
) -> Activity:
    """Create an activity with auto-computed TSS.

    TSS is calculated from sport type + athlete profile thresholds. If the
    required thresholds are missing on the profile, tss is stored as None.
    """
    tss = _compute_tss(data, profile)

    activity = Activity(
        user_id=user_id,
        sport=data.sport,
        started_at=data.started_at,
        duration_seconds=data.duration_seconds,
        distance_meters=data.distance_meters,
        average_power=data.average_power,
        normalized_power=data.normalized_power,
        average_hr=data.average_hr,
        max_hr=data.max_hr,
        calories=data.calories,
        title=data.title,
        source=data.source,
        external_id=data.external_id,
        tss=tss,
    )

    db.add(activity)
    await db.flush()
    await db.refresh(activity)

    # Invalidate any coach brief generated on the same day as this activity so
    # the next /coach/brief read regenerates with the new ride in evidence.
    # Defensive: failure must not break activity creation.
    try:
        activity_day = activity.started_at.date()
        day_start_utc = datetime.combine(activity_day, time.min, tzinfo=UTC)
        await db.execute(
            delete(CoachBrief).where(
                CoachBrief.user_id == user_id,
                CoachBrief.generated_at >= day_start_utc,
            )
        )
    except Exception as exc:
        logger.warning(
            "Failed to invalidate coach_briefs for user_id=%s after activity create (non-fatal): %s",
            user_id,
            exc,
        )

    return activity


async def list_activities(
    db: AsyncSession,
    user_id: int,
    sport: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 50,
) -> list[Activity]:
    """List activities for a user with optional filters.

    Results are ordered by started_at DESC (most recent first).
    """
    query = select(Activity).where(Activity.user_id == user_id)

    if sport is not None:
        query = query.where(Activity.sport == sport)
    if start_date is not None:
        query = query.where(Activity.started_at >= start_date)
    if end_date is not None:
        query = query.where(Activity.started_at <= end_date)

    query = query.order_by(Activity.started_at.desc()).limit(limit)

    result = await db.execute(query)
    return list(result.scalars().all())


async def recompute_missing_tss(db: AsyncSession, user_id: int) -> int:
    """Backfill TSS for the user's activities that currently have tss IS NULL.

    Loads the athlete profile once, then recomputes TSS for every NULL-tss
    activity by reconstructing the same input _compute_tss expects from the
    stored Activity fields. Only updates rows where a value could be computed
    (e.g. HR data now yields hrTSS via the LTHR fallback). Returns the count
    of rows updated.
    """
    profile = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = profile.scalar_one_or_none()
    if profile is None:
        logger.info("recompute_missing_tss: no athlete profile for user_id=%s", user_id)
        return 0

    result = await db.execute(
        select(Activity).where(
            Activity.user_id == user_id,
            Activity.tss.is_(None),
        )
    )
    activities = list(result.scalars().all())

    updated = 0
    for activity in activities:
        # ActivityCreate enforces duration_seconds > 0; skip malformed rows
        # (they could never yield a TSS anyway).
        if not activity.duration_seconds or activity.duration_seconds <= 0:
            continue
        # Reconstruct the ActivityCreate-shaped input _compute_tss expects.
        data = ActivityCreate(
            sport=activity.sport,
            started_at=activity.started_at,
            duration_seconds=activity.duration_seconds,
            distance_meters=activity.distance_meters,
            average_power=activity.average_power,
            normalized_power=activity.normalized_power,
            average_hr=activity.average_hr,
            max_hr=activity.max_hr,
        )
        tss = _compute_tss(data, profile)
        if tss is not None:
            activity.tss = tss
            updated += 1

    if updated:
        await db.commit()

    logger.info(
        "recompute_missing_tss: user_id=%s scanned=%d updated=%d",
        user_id,
        len(activities),
        updated,
    )
    return updated


async def get_activity(
    db: AsyncSession,
    user_id: int,
    activity_id: int,
) -> Activity | None:
    """Retrieve a single activity by ID, scoped to the requesting user."""
    result = await db.execute(
        select(Activity).where(
            Activity.id == activity_id,
            Activity.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def delete_activity(
    db: AsyncSession,
    user_id: int,
    activity_id: int,
) -> bool:
    """Delete a single activity owned by ``user_id``.

    Returns True when a row was deleted, False when no matching activity exists
    for this user (missing or owned by someone else). The caller commits.
    """
    activity = await get_activity(db, user_id=user_id, activity_id=activity_id)
    if activity is None:
        return False
    await db.delete(activity)
    await db.flush()
    return True
