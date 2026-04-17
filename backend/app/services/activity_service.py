"""Activity CRUD service with auto-TSS calculation.

TSS is computed on creation based on sport type and athlete profile thresholds:
- cycling: power-based (Coggan TSS) using NP or average_power as fallback
- running: pace-based (rTSS) using distance/duration-derived speed
- gym: HR-based (hrTSS via Banister TRIMP)

If the athlete profile lacks the required thresholds, TSS is left as None.
"""
from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.schemas.activity import ActivityCreate
from app.services.training_load import (
    calculate_cycling_tss,
    calculate_hr_tss,
    calculate_running_tss,
)

logger = logging.getLogger(__name__)


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
        if not data.distance_meters or not profile.running_threshold_pace_ms:
            logger.debug(
                "Skipping running TSS: distance=%s threshold_pace=%s",
                data.distance_meters,
                profile.running_threshold_pace_ms,
            )
            return None
        # Compute speed in m/s from distance and duration
        speed_ms = data.distance_meters / duration
        try:
            return calculate_running_tss(duration, speed_ms, profile.running_threshold_pace_ms)
        except ValueError as exc:
            logger.warning("Running TSS calculation failed: %s", exc)
            return None

    elif data.sport == "gym":
        # Prefer LTHR from cycling; fall back to running LTHR
        lthr = profile.lthr_cycling or profile.lthr_running
        if not all([data.average_hr, lthr, profile.resting_heart_rate, profile.max_heart_rate]):
            logger.debug(
                "Skipping gym hrTSS: average_hr=%s lthr=%s resting_hr=%s max_hr=%s",
                data.average_hr,
                lthr,
                profile.resting_heart_rate,
                profile.max_heart_rate,
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
            logger.warning("Gym hrTSS calculation failed: %s", exc)
            return None

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
    await db.commit()
    await db.refresh(activity)
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
