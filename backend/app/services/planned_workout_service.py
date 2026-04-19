"""Planned workout CRUD service.

All queries include a belt-and-suspenders user_id check alongside RLS to ensure
users can only access their own planned workouts.

Caller controls the transaction — service functions call db.flush() (not db.commit())
so the caller can commit when ready.
"""
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.planned_workout import PlannedWorkout
from app.schemas.planned_workout import PlannedWorkoutCreate, PlannedWorkoutUpdate


async def create_planned_workout(
    db: AsyncSession,
    user_id: int,
    data: PlannedWorkoutCreate,
) -> PlannedWorkout:
    """Insert a new PlannedWorkout and flush. Caller commits."""
    pw = PlannedWorkout(
        user_id=user_id,
        date=data.date,
        sport=data.sport,
        title=data.title,
        duration_seconds_target=data.duration_seconds_target,
        description=data.description,
        interval_structure=data.interval_structure,
    )
    db.add(pw)
    await db.flush()
    await db.refresh(pw)
    return pw


async def list_planned_workouts(
    db: AsyncSession,
    user_id: int,
    start_date: date,
    end_date: date,
) -> list[PlannedWorkout]:
    """List all planned workouts for a user within a date range (inclusive), ordered by date ASC."""
    result = await db.execute(
        select(PlannedWorkout)
        .where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date >= start_date,
            PlannedWorkout.date <= end_date,
        )
        .order_by(PlannedWorkout.date.asc())
    )
    return list(result.scalars().all())


async def get_planned_workout(
    db: AsyncSession,
    user_id: int,
    pw_id: int,
) -> PlannedWorkout | None:
    """Get a single planned workout by ID, scoped to the given user."""
    result = await db.execute(
        select(PlannedWorkout).where(
            PlannedWorkout.id == pw_id,
            PlannedWorkout.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def update_planned_workout(
    db: AsyncSession,
    pw: PlannedWorkout,
    data: PlannedWorkoutUpdate,
) -> PlannedWorkout:
    """Apply non-None fields from data to pw and flush. Caller commits."""
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None or field in update_data:
            setattr(pw, field, value)
    await db.flush()
    await db.refresh(pw)
    return pw


async def delete_planned_workout(
    db: AsyncSession,
    pw: PlannedWorkout,
) -> None:
    """Delete a planned workout and flush. Caller commits."""
    await db.delete(pw)
    await db.flush()
