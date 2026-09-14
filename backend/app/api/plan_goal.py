"""Authenticated, typed custom event planning; preview never writes."""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_current_active_user, get_db_for_user
from app.models.athlete_profile import AthleteProfile
from app.models.user import User
from app.schemas.plan_goal import CustomGoalInput, CustomGoalPreview
from app.services.plan_goal import preview_goal, apply_goal_to_profile
from app.services.athlete_time import set_athlete_tz_from_profile, today_local
from app.services.plan_interview import rebuild_plan

router = APIRouter(prefix="/plan/goal", tags=["plan"])

class CustomGoalApplied(CustomGoalPreview):
    rebuilt: bool
    plan: dict

async def _profile(db, user_id, lock=False):
    query = select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    if lock:
        query = query.with_for_update()
    profile = (await db.execute(query)).scalar_one_or_none()
    if profile is None:
        raise HTTPException(409, "Complete your profile setup first")
    set_athlete_tz_from_profile(profile)
    return profile

def _preview(payload):
    try:
        return preview_goal(payload, today_local())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

@router.post("/preview", response_model=CustomGoalPreview)
async def preview(payload: CustomGoalInput,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)]):
    await _profile(db, user.id)
    return _preview(payload)

@router.post("/apply", response_model=CustomGoalApplied)
async def apply(payload: CustomGoalInput,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)]):
    profile = await _profile(db, user.id, lock=True)
    result = _preview(payload)
    if (profile.primary_sport or "cycling") != "cycling" or (profile.ftp_watts or 0) < 100:
        raise HTTPException(409, "Set your cycling FTP before building a cycling plan")
    try:
        apply_goal_to_profile(profile, result, today_local())
        await db.flush()
        summary = await rebuild_plan(db, user.id, profile, source="plan_change",
            signal="custom_goal", atomic=True)
        await db.commit()
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(409, str(exc)) from exc
    except Exception:
        await db.rollback()
        raise
    from app.api.weeks import invalidate_personalized_week_cache
    invalidate_personalized_week_cache(user.id)
    return CustomGoalApplied(**result.model_dump(), rebuilt=bool(summary.get("rebuilt")), plan=summary)
