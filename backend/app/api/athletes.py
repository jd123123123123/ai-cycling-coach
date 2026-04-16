from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.athlete import AthleteProfileRead, AthleteProfileUpdate
from app.services.athlete_service import get_or_create_profile, update_profile

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
