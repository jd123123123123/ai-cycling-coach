"""Planned workouts API endpoints.

All endpoints are RLS-protected via get_db_for_user which sets the PostgreSQL
session variable app.current_user_id, enabling RLS policies on the planned_workouts
table to filter rows by the authenticated user.

PATCH /{id} is the drag-drop endpoint — typically receives {"date": "YYYY-MM-DD"} only.
"""
from datetime import date as date_type
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.planned_workout import (
    PlannedWorkoutCreate,
    PlannedWorkoutListResponse,
    PlannedWorkoutRead,
    PlannedWorkoutUpdate,
)
from app.services import planned_workout_service

router = APIRouter(prefix="/planned-workouts", tags=["planned-workouts"])


@router.post(
    "",
    response_model=PlannedWorkoutRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new planned workout",
)
async def create_planned_workout(
    data: PlannedWorkoutCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> PlannedWorkoutRead:
    """Create a new planned workout for the authenticated user."""
    pw = await planned_workout_service.create_planned_workout(
        db=db, user_id=current_user.id, data=data
    )
    await db.commit()
    return PlannedWorkoutRead.model_validate(pw)


@router.get(
    "",
    response_model=PlannedWorkoutListResponse,
    summary="List planned workouts in a date range",
)
async def list_planned_workouts(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    start_date: Annotated[date_type, Query(description="Range start (inclusive), yyyy-mm-dd")],
    end_date: Annotated[date_type, Query(description="Range end (inclusive), yyyy-mm-dd")],
) -> PlannedWorkoutListResponse:
    """Return planned workouts for the authenticated user within the given date range.

    Both start_date and end_date are required. Range may not exceed 366 days.
    """
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must be <= end_date",
        )
    if (end_date - start_date).days > 366:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Date range may not exceed 366 days",
        )
    planned = await planned_workout_service.list_planned_workouts(
        db=db,
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
    )
    return PlannedWorkoutListResponse(
        planned_workouts=[PlannedWorkoutRead.model_validate(pw) for pw in planned],
        count=len(planned),
    )


@router.patch(
    "/{planned_workout_id}",
    response_model=PlannedWorkoutRead,
    summary="Update a planned workout (drag-drop hits this with {date} only)",
)
async def update_planned_workout(
    planned_workout_id: int,
    data: PlannedWorkoutUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> PlannedWorkoutRead:
    """Partially update a planned workout. Drag-drop sends {\"date\": \"YYYY-MM-DD\"}."""
    pw = await planned_workout_service.get_planned_workout(
        db=db, user_id=current_user.id, pw_id=planned_workout_id
    )
    if pw is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Planned workout not found",
        )
    pw = await planned_workout_service.update_planned_workout(db=db, pw=pw, data=data)
    await db.commit()
    return PlannedWorkoutRead.model_validate(pw)


@router.delete(
    "/{planned_workout_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a planned workout",
)
async def delete_planned_workout(
    planned_workout_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> None:
    """Delete a planned workout. Returns 204 No Content on success."""
    pw = await planned_workout_service.get_planned_workout(
        db=db, user_id=current_user.id, pw_id=planned_workout_id
    )
    if pw is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Planned workout not found",
        )
    await planned_workout_service.delete_planned_workout(db=db, pw=pw)
    await db.commit()
