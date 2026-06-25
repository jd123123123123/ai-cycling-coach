"""Same-workout progression endpoints.

  · GET /workouts        — repeated workouts (count >= 2), most-repeated first
  · GET /workouts/{key}  — one workout's per-rep metrics + trends

RLS-protected via get_db_for_user.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.workout_progression import WorkoutGroupDetail, WorkoutGroupSummary
from app.services.workout_comparison import get_workout_group, list_workout_groups

router = APIRouter(prefix="/workouts", tags=["workouts"])


@router.get("", response_model=list[WorkoutGroupSummary])
async def list_workouts(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> list[WorkoutGroupSummary]:
    return await list_workout_groups(db, _user.id)


@router.get("/{key:path}", response_model=WorkoutGroupDetail)
async def get_workout(
    key: str,
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> WorkoutGroupDetail:
    detail = await get_workout_group(db, _user.id, key)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
    return detail

