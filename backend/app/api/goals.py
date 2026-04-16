from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.athlete import AthleteProfileRead, TrainingGoals
from app.services.athlete_service import get_or_create_profile, update_goals

router = APIRouter(prefix="/athletes", tags=["goals"])


@router.get("/me/goals", response_model=dict)
async def get_my_goals(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> dict:
    """Get the current user's training goals."""
    profile = await get_or_create_profile(db, current_user.id)
    return profile.goals or {}


@router.put("/me/goals", response_model=AthleteProfileRead)
async def update_my_goals(
    goals: TrainingGoals,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> AthleteProfileRead:
    """Update the current user's training goals."""
    profile = await update_goals(db, current_user.id, goals)
    return profile
