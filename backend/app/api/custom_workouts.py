"""Custom-workout builder endpoints — the athlete's own structured sessions.

  · POST   /custom-workouts               — create
  · GET    /custom-workouts               — list (newest first)
  · GET    /custom-workouts/{id}          — one
  · PUT    /custom-workouts/{id}          — update
  · DELETE /custom-workouts/{id}          — delete
  · POST   /custom-workouts/{id}/schedule — materialise as a PlannedWorkout
             (blocks_source='user_plan' — PROTECTED from the adaptation engine)
  · GET    /custom-workouts/{id}/export.zwo — real Zwift Workout XML download

TSS + duration are recomputed server-side from the blocks on every write — the
number the athlete sees always survives recomputation from the structure.
RLS-protected via get_db_for_user (Postgres row-level security on user_id).
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.athlete_profile import AthleteProfile
from app.models.custom_workout import CustomWorkout
from app.models.planned_workout import PlannedWorkout
from app.models.user import User
from app.schemas.custom_workout import (
    CustomWorkoutRead,
    CustomWorkoutWrite,
    ScheduleRequest,
    ScheduleResponse,
)
from app.services.custom_workout_blocks import (
    compute_tss_and_duration,
    resolve_block,
    resolved_block_to_dict,
    workout_to_zwo,
)

router = APIRouter(prefix="/custom-workouts", tags=["custom-workouts"])


def _to_read(w: CustomWorkout) -> CustomWorkoutRead:
    return CustomWorkoutRead(
        id=w.id,
        name=w.name,
        description=w.description,
        sport=w.sport,
        blocks=list(w.blocks or []),
        estimated_tss=w.estimated_tss,
        estimated_duration_s=w.estimated_duration_s,
        created_at=w.created_at,
        updated_at=w.updated_at,
    )


async def _load_owned(db: AsyncSession, user_id: int, workout_id: int) -> CustomWorkout:
    res = await db.execute(
        select(CustomWorkout).where(
            CustomWorkout.id == workout_id, CustomWorkout.user_id == user_id
        )
    )
    w = res.scalar_one_or_none()
    if w is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
    return w


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CustomWorkoutRead)
async def create_custom_workout(
    payload: CustomWorkoutWrite,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> CustomWorkoutRead:
    tss, duration = compute_tss_and_duration(payload.blocks)
    w = CustomWorkout(
        user_id=current_user.id,
        name=payload.name,
        description=payload.description,
        sport=payload.sport,
        blocks=[b.model_dump(exclude_none=True) for b in payload.blocks],
        estimated_tss=tss,
        estimated_duration_s=duration,
    )
    db.add(w)
    await db.commit()
    await db.refresh(w)
    return _to_read(w)


@router.get("", response_model=list[CustomWorkoutRead])
async def list_custom_workouts(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> list[CustomWorkoutRead]:
    res = await db.execute(
        select(CustomWorkout)
        .where(CustomWorkout.user_id == current_user.id)
        .order_by(CustomWorkout.updated_at.desc())
    )
    return [_to_read(w) for w in res.scalars().all()]


@router.get("/{workout_id}", response_model=CustomWorkoutRead)
async def get_custom_workout(
    workout_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> CustomWorkoutRead:
    return _to_read(await _load_owned(db, current_user.id, workout_id))


@router.put("/{workout_id}", response_model=CustomWorkoutRead)
async def update_custom_workout(
    workout_id: int,
    payload: CustomWorkoutWrite,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> CustomWorkoutRead:
    w = await _load_owned(db, current_user.id, workout_id)
    tss, duration = compute_tss_and_duration(payload.blocks)
    w.name = payload.name
    w.description = payload.description
    w.sport = payload.sport
    w.blocks = [b.model_dump(exclude_none=True) for b in payload.blocks]
    w.estimated_tss = tss
    w.estimated_duration_s = duration
    await db.commit()
    await db.refresh(w)
    return _to_read(w)


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_workout(
    workout_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> Response:
    w = await _load_owned(db, current_user.id, workout_id)
    await db.delete(w)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _athlete_ftp(db: AsyncSession, user_id: int) -> int:
    res = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = res.scalar_one_or_none()
    ftp = getattr(profile, "ftp_watts", None) if profile else None
    if not ftp or ftp <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No FTP on profile — set your FTP before scheduling a workout.",
        )
    return int(ftp)


@router.post("/{workout_id}/schedule", response_model=ScheduleResponse)
async def schedule_custom_workout(
    workout_id: int,
    payload: ScheduleRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> ScheduleResponse:
    """Materialise a saved custom workout as a PlannedWorkout on `date`.

    Watts are resolved from the athlete's CURRENT FTP at schedule time, and the
    row is written with blocks_source='user_plan' — a PROTECTED_SOURCES value
    the hourly adaptation engine never auto-mutates. Any existing planned rows
    on that date are replaced (one prescription per day)."""
    from app.schemas.custom_workout import CustomBlock  # re-validate stored JSON

    w = await _load_owned(db, current_user.id, workout_id)
    ftp = await _athlete_ftp(db, current_user.id)
    blocks = [CustomBlock.model_validate(b) for b in (w.blocks or [])]
    resolved = [resolve_block(b, ftp) for b in blocks]
    interval_structure = {"intervals": [resolved_block_to_dict(r) for r in resolved]}

    # Replace only a PRIOR user-scheduled custom workout on that date, so
    # re-scheduling doesn't stack duplicates — but never nuke the athlete's
    # AI-prescribed / imported plan rows (the app already picks one per day).
    existing = await db.execute(
        select(PlannedWorkout).where(
            PlannedWorkout.user_id == current_user.id,
            PlannedWorkout.date == payload.date,
            PlannedWorkout.blocks_source == "user_plan",
        )
    )
    for old in existing.scalars().all():
        await db.delete(old)

    pw = PlannedWorkout(
        user_id=current_user.id,
        date=payload.date,
        sport=w.sport,
        title=w.name[:200],
        duration_seconds_target=w.estimated_duration_s or None,
        description=(w.description or "Eigenes Workout")[:2000],
        interval_structure=interval_structure,
        blocks_source="user_plan",  # PROTECTED — see plan_adaptation_engine.PROTECTED_SOURCES
    )
    db.add(pw)
    await db.commit()
    await db.refresh(pw)
    return ScheduleResponse(
        planned_workout_id=pw.id,
        date=pw.date,
        blocks_source=pw.blocks_source,
        estimated_tss=w.estimated_tss,
    )


@router.get("/{workout_id}/export.zwo")
async def export_custom_workout_zwo(
    workout_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> Response:
    """Download the workout as a real Zwift Workout (.zwo) file. Power values
    are fractions of FTP — Zwift applies the rider's own FTP on import."""
    from app.schemas.custom_workout import CustomBlock

    w = await _load_owned(db, current_user.id, workout_id)
    blocks = [CustomBlock.model_validate(b) for b in (w.blocks or [])]
    xml = workout_to_zwo(w.name, w.description, blocks)
    safe = "".join(c if c.isalnum() else "_" for c in w.name)[:40] or "workout"
    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{safe}.zwo"'},
    )
