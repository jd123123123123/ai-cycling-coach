from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.athlete_profile import AthleteProfile
from app.schemas.athlete import AthleteProfileUpdate, TrainingGoals


async def get_or_create_profile(db: AsyncSession, user_id: int) -> AthleteProfile:
    """Get the athlete profile for user_id, creating an empty one if it doesn't exist."""
    result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()

    if profile is None:
        profile = AthleteProfile(
            user_id=user_id,
            secondary_sports=[],
            goals={},
            ftp_history=[],
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    return profile


# Profile fields that feed TSS computation — changing any of them can turn a
# previously-uncomputable activity into a computable one (or vice versa), so
# we backfill NULL-tss rows afterwards.
_TSS_THRESHOLD_FIELDS = (
    "ftp_watts",
    "lthr_cycling",
    "lthr_running",
    "running_threshold_pace_ms",
    "max_heart_rate",
    "resting_heart_rate",
    "date_of_birth",
)


async def update_profile(
    db: AsyncSession,
    user_id: int,
    data: AthleteProfileUpdate,
) -> AthleteProfile:
    """Update athlete profile fields. Creates the profile if it doesn't exist.

    When FTP changes, appends the new value to ftp_history with a timestamp.
    When any TSS-relevant threshold changes, backfills TSS for activities that
    could not be computed before (recompute_missing_tss) — best-effort.
    """
    profile = await get_or_create_profile(db, user_id)

    update_data = data.model_dump(exclude_unset=True)

    # Track FTP history when FTP changes
    if "ftp_watts" in update_data and update_data["ftp_watts"] is not None:
        new_ftp = update_data["ftp_watts"]
        if profile.ftp_watts != new_ftp:
            current_history = profile.ftp_history or []
            updated_history = current_history + [
                {
                    "ftp_watts": new_ftp,
                    "measured_at": datetime.now(timezone.utc).isoformat(),
                }
            ]
            profile.ftp_history = updated_history

    thresholds_changed = any(
        field in update_data and getattr(profile, field, None) != update_data[field]
        for field in _TSS_THRESHOLD_FIELDS
    )

    for field, value in update_data.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)

    if thresholds_changed:
        # New thresholds may unlock TSS for previously-NULL activities (e.g.
        # an HR-only run that had no LTHR anchor). Never break the profile
        # update over the backfill.
        try:
            from app.services.activity_service import recompute_missing_tss

            await recompute_missing_tss(db, user_id)
        except Exception:  # noqa: BLE001 — best-effort backfill
            import logging

            logging.getLogger(__name__).exception(
                "recompute_missing_tss failed after profile update (user_id=%s)",
                user_id,
            )

    return profile


async def update_goals(
    db: AsyncSession,
    user_id: int,
    goals: TrainingGoals,
) -> AthleteProfile:
    """Update training goals on the athlete profile."""
    profile = await get_or_create_profile(db, user_id)

    goals_data = goals.model_dump(exclude_none=True)

    # Build the goals dict — map flat schema fields to nested structure.
    # COPY into a new dict: mutating profile.goals in place and reassigning the
    # same object doesn't mark the JSON column dirty (SQLAlchemy tracks by
    # identity), so new keys like push_intensity would silently never persist.
    current_goals = dict(profile.goals or {})

    if "target_ftp" in goals_data:
        current_goals["target_ftp"] = goals_data["target_ftp"]

    if "weekly_hours" in goals_data:
        current_goals["weekly_hours"] = goals_data["weekly_hours"]

    if "push_intensity" in goals_data:
        current_goals["push_intensity"] = goals_data["push_intensity"]

    if "target_event_name" in goals_data or "target_event_date" in goals_data:
        target_event = current_goals.get("target_event", {})
        if "target_event_name" in goals_data:
            target_event["name"] = goals_data["target_event_name"]
        if "target_event_date" in goals_data:
            target_event["date"] = goals_data["target_event_date"]
            # Keep the FIRST-CLASS column in sync — it is authoritative
            # (2a3ecb1); writing only the JSONB copy is how the two diverged
            # (live-observed: JSONB 2026-07-05 vs column 2026-12-05).
            try:
                from datetime import date as _date

                profile.target_event_date = _date.fromisoformat(
                    str(goals_data["target_event_date"])[:10]
                )
            except (ValueError, TypeError):
                pass
        current_goals["target_event"] = target_event

    profile.goals = current_goals
    await db.commit()
    await db.refresh(profile)
    return profile
