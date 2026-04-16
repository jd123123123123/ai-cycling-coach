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


async def update_profile(
    db: AsyncSession,
    user_id: int,
    data: AthleteProfileUpdate,
) -> AthleteProfile:
    """Update athlete profile fields. Creates the profile if it doesn't exist.

    When FTP changes, appends the new value to ftp_history with a timestamp.
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

    for field, value in update_data.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


async def update_goals(
    db: AsyncSession,
    user_id: int,
    goals: TrainingGoals,
) -> AthleteProfile:
    """Update training goals on the athlete profile."""
    profile = await get_or_create_profile(db, user_id)

    goals_data = goals.model_dump(exclude_none=True)

    # Build the goals dict — map flat schema fields to nested structure
    current_goals = profile.goals or {}

    if "target_ftp" in goals_data:
        current_goals["target_ftp"] = goals_data["target_ftp"]

    if "weekly_hours" in goals_data:
        current_goals["weekly_hours"] = goals_data["weekly_hours"]

    if "target_event_name" in goals_data or "target_event_date" in goals_data:
        target_event = current_goals.get("target_event", {})
        if "target_event_name" in goals_data:
            target_event["name"] = goals_data["target_event_name"]
        if "target_event_date" in goals_data:
            target_event["date"] = goals_data["target_event_date"]
        current_goals["target_event"] = target_event

    profile.goals = current_goals
    await db.commit()
    await db.refresh(profile)
    return profile
