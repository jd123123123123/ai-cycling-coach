from datetime import date as date_type
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.athlete import AthleteProfileRead, AthleteProfileUpdate
from app.services.athlete_service import get_or_create_profile, update_profile
from app.services.streak import build_streak

router = APIRouter(prefix="/athletes", tags=["athletes"])


@router.get("/me", response_model=AthleteProfileRead)
async def get_my_profile(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> AthleteProfileRead:
    """Get the current user's athlete profile. Creates an empty profile if none exists."""
    profile = await get_or_create_profile(db, current_user.id)
    return profile


@router.put("/me", response_model=AthleteProfileRead)
async def update_my_profile(
    data: AthleteProfileUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> AthleteProfileRead:
    """Update the current user's athlete profile fields (partial update)."""
    profile = await update_profile(db, current_user.id, data)
    return profile


# ─── Athlete status — forgiving-streak + plan input ─────────────────────────
# "sick" / "injured" / "break" pause the streak (never break it) and push the
# adaptive directive to rest, which in turn mutes competitive surfaces via the
# coach-safety interlock. "healthy" clears the status.

AthleteState = Literal["healthy", "sick", "injured", "break"]


class AthleteStatusUpdate(BaseModel):
    state: AthleteState


class AthleteStatusRead(BaseModel):
    state: AthleteState
    since: date_type | None = None


@router.put("/me/status", response_model=AthleteStatusRead)
async def set_my_status(
    payload: AthleteStatusUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> AthleteStatusRead:
    """Set the athlete's life status. Stored in the profile's goals JSONB
    (additive — no migration); `healthy` removes it."""
    profile = await get_or_create_profile(db, current_user.id)
    goals = dict(profile.goals or {})
    if payload.state == "healthy":
        goals.pop("athlete_status", None)
        result = AthleteStatusRead(state="healthy", since=None)
    else:
        existing = goals.get("athlete_status") or {}
        # Keep the original `since` when re-affirming the same state.
        since = (
            existing.get("since")
            if existing.get("state") == payload.state and existing.get("since")
            else date_type.today().isoformat()
        )
        goals["athlete_status"] = {"state": payload.state, "since": since}
        result = AthleteStatusRead(state=payload.state, since=date_type.fromisoformat(since))
    profile.goals = goals
    flag_modified(profile, "goals")
    await db.commit()
    return result


@router.get("/me/streak")
async def my_streak(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> dict:
    """Plan-aware forgiving streak: trained days and planned rest days extend
    it, sick/injured/break days pause it, only a skipped planned session (or an
    unplanned gap) breaks it. Includes per-day states for the current week."""
    return await build_streak(db, current_user.id)
