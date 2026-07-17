"""Strength API — routines, prefill, and logged sessions.

Athletes build named routines (their splits), log sessions with actual weights,
and the next session prefills the previous weights. Logging a session also
creates a gym Activity through the normal activity-creation path so the workout
appears in History and gets hrTSS.
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.strength import (
    RoutineExercise,
    StrengthRoutine,
    StrengthSession,
    StrengthSetLog,
)
from app.models.user import User
from app.schemas.activity import ActivityCreate
from app.schemas.strength import (
    ExerciseRead,
    PrefillExercise,
    PrefillResponse,
    PrefillSet,
    RoutineCreate,
    RoutineRead,
    RoutineRef,
    RoutineUpdate,
    SessionCreate,
    SessionRead,
    SetRead,
    TopSet,
)
from app.services import activity_service
from app.services.athlete_service import get_or_create_profile

router = APIRouter(prefix="/strength", tags=["strength"])


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


async def _get_owned_routine(
    db: AsyncSession, user_id: int, routine_id: int
) -> StrengthRoutine:
    """Load a routine that belongs to the caller, or 404."""
    routine = (
        await db.execute(
            select(StrengthRoutine).where(
                StrengthRoutine.id == routine_id,
                StrengthRoutine.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if routine is None:
        raise HTTPException(status_code=404, detail="routine not found")
    return routine


async def _routine_to_read(db: AsyncSession, routine: StrengthRoutine) -> RoutineRead:
    exercises = (
        await db.execute(
            select(RoutineExercise)
            .where(RoutineExercise.routine_id == routine.id)
            .order_by(RoutineExercise.position.asc())
        )
    ).scalars().all()
    return RoutineRead(
        id=routine.id,
        name=routine.name,
        notes=routine.notes,
        position=routine.position,
        archived=routine.archived,
        exercises=[ExerciseRead.model_validate(e) for e in exercises],
    )


# ──────────────────────────────────────────────────────────────────────
# Routines
# ──────────────────────────────────────────────────────────────────────


@router.get("/routines", response_model=list[RoutineRead])
async def list_routines(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> list[RoutineRead]:
    """The caller's non-archived routines, ordered by position, each with its
    ordered exercises."""
    routines = (
        await db.execute(
            select(StrengthRoutine)
            .where(
                StrengthRoutine.user_id == current_user.id,
                StrengthRoutine.archived.is_(False),
            )
            .order_by(StrengthRoutine.position.asc(), StrengthRoutine.id.asc())
        )
    ).scalars().all()
    return [await _routine_to_read(db, r) for r in routines]


@router.post(
    "/routines", response_model=RoutineRead, status_code=status.HTTP_201_CREATED
)
async def create_routine(
    payload: RoutineCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> RoutineRead:
    """Create a routine with its exercises."""
    # Append to the end: next position after the caller's current max.
    existing = (
        await db.execute(
            select(StrengthRoutine.position).where(
                StrengthRoutine.user_id == current_user.id
            )
        )
    ).scalars().all()
    next_pos = (max(existing) + 1) if existing else 0

    routine = StrengthRoutine(
        user_id=current_user.id,
        name=payload.name.strip(),
        notes=payload.notes,
        position=next_pos,
    )
    db.add(routine)
    await db.flush()  # need routine.id for exercises

    for i, ex in enumerate(payload.exercises):
        db.add(
            RoutineExercise(
                routine_id=routine.id,
                name=ex.name.strip(),
                target_sets=ex.target_sets,
                target_reps=ex.target_reps,
                position=i,
            )
        )
    await db.commit()
    await db.refresh(routine)
    return await _routine_to_read(db, routine)


@router.put("/routines/{routine_id}", response_model=RoutineRead)
async def update_routine(
    routine_id: int,
    payload: RoutineUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> RoutineRead:
    """Update routine fields. If `exercises` is provided, replace them wholesale."""
    routine = await _get_owned_routine(db, current_user.id, routine_id)

    if payload.name is not None:
        routine.name = payload.name.strip()
    if payload.notes is not None:
        routine.notes = payload.notes

    if payload.exercises is not None:
        # Replace exercises: delete existing, insert the new ordered set.
        existing = (
            await db.execute(
                select(RoutineExercise).where(
                    RoutineExercise.routine_id == routine.id
                )
            )
        ).scalars().all()
        for e in existing:
            await db.delete(e)
        await db.flush()
        for i, ex in enumerate(payload.exercises):
            db.add(
                RoutineExercise(
                    routine_id=routine.id,
                    name=ex.name.strip(),
                    target_sets=ex.target_sets,
                    target_reps=ex.target_reps,
                    position=i,
                )
            )

    await db.commit()
    await db.refresh(routine)
    return await _routine_to_read(db, routine)


@router.delete("/routines/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_routine(
    routine_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> None:
    """Soft-archive a routine (archived=true)."""
    routine = await _get_owned_routine(db, current_user.id, routine_id)
    routine.archived = True
    await db.commit()


@router.get("/routines/{routine_id}/prefill", response_model=PrefillResponse)
async def routine_prefill(
    routine_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> PrefillResponse:
    """Return each exercise with the sets from the caller's MOST RECENT session
    for this routine, matched by exercise_name (empty when none logged yet)."""
    routine = await _get_owned_routine(db, current_user.id, routine_id)
    exercises = (
        await db.execute(
            select(RoutineExercise)
            .where(RoutineExercise.routine_id == routine.id)
            .order_by(RoutineExercise.position.asc())
        )
    ).scalars().all()

    # Most recent session for this routine (owned by caller).
    last_session = (
        await db.execute(
            select(StrengthSession)
            .where(
                StrengthSession.user_id == current_user.id,
                StrengthSession.routine_id == routine.id,
            )
            .order_by(StrengthSession.performed_at.desc(), StrengthSession.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    sets_by_exercise: dict[str, list[PrefillSet]] = {}
    if last_session is not None:
        logs = (
            await db.execute(
                select(StrengthSetLog)
                .where(StrengthSetLog.session_id == last_session.id)
                .order_by(StrengthSetLog.set_index.asc())
            )
        ).scalars().all()
        for log in logs:
            sets_by_exercise.setdefault(log.exercise_name, []).append(
                PrefillSet(weight_kg=log.weight_kg, reps=log.reps, rpe=log.rpe)
            )

    return PrefillResponse(
        routine=RoutineRef(id=routine.id, name=routine.name),
        exercises=[
            PrefillExercise(
                name=e.name,
                target_sets=e.target_sets,
                target_reps=e.target_reps,
                last_sets=sets_by_exercise.get(e.name, []),
            )
            for e in exercises
        ],
    )


# ──────────────────────────────────────────────────────────────────────
# Sessions
# ──────────────────────────────────────────────────────────────────────


def _session_to_read(
    session: StrengthSession, logs: list[StrengthSetLog], routine_name: str | None
) -> SessionRead:
    total_volume = sum((s.weight_kg or 0) * (s.reps or 0) for s in logs)
    top: TopSet | None = None
    if logs:
        heaviest = max(logs, key=lambda s: (s.weight_kg or 0, s.reps or 0))
        top = TopSet(
            exercise_name=heaviest.exercise_name,
            weight_kg=heaviest.weight_kg,
            reps=heaviest.reps,
        )
    return SessionRead(
        id=session.id,
        routine_id=session.routine_id,
        routine_name=routine_name,
        performed_at=session.performed_at,
        notes=session.notes,
        total_volume_kg=round(total_volume, 2),
        top_set=top,
        sets=[SetRead.model_validate(s) for s in logs],
    )


@router.post(
    "/sessions", response_model=SessionRead, status_code=status.HTTP_201_CREATED
)
async def create_session(
    payload: SessionCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> SessionRead:
    """Log a strength session with its set logs. Also creates a gym Activity
    (source="strength_log") through the normal activity-creation path so the
    workout shows in History and gets hrTSS."""
    routine: StrengthRoutine | None = None
    if payload.routine_id is not None:
        routine = await _get_owned_routine(db, current_user.id, payload.routine_id)

    performed_at = payload.performed_at or datetime.now(timezone.utc)

    session = StrengthSession(
        user_id=current_user.id,
        routine_id=routine.id if routine else None,
        performed_at=performed_at,
        notes=payload.notes,
    )
    db.add(session)
    await db.flush()  # need session.id for set logs

    logs: list[StrengthSetLog] = []
    for s in payload.sets:
        log = StrengthSetLog(
            session_id=session.id,
            exercise_name=s.exercise_name.strip(),
            set_index=s.set_index,
            weight_kg=s.weight_kg,
            reps=s.reps,
            rpe=s.rpe,
        )
        db.add(log)
        logs.append(log)

    # Mirror the session as a gym Activity so it lands in History + gets hrTSS.
    total_sets = len(payload.sets)
    profile = await get_or_create_profile(db, current_user.id)
    activity_data = ActivityCreate(
        sport="gym",
        started_at=performed_at,
        duration_seconds=max(1, total_sets) * 180,
        title=(routine.name if routine else None) or "Krafttraining",
        source="strength_log",
    )
    await activity_service.create_activity(
        db=db, user_id=current_user.id, data=activity_data, profile=profile,
    )

    await db.commit()
    await db.refresh(session)

    return _session_to_read(session, logs, routine.name if routine else None)


@router.get("/sessions", response_model=list[SessionRead])
async def list_sessions(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    routine_id: Annotated[int | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[SessionRead]:
    """The caller's recent strength sessions, most recent first."""
    query = select(StrengthSession).where(
        StrengthSession.user_id == current_user.id
    )
    if routine_id is not None:
        query = query.where(StrengthSession.routine_id == routine_id)
    query = query.order_by(
        StrengthSession.performed_at.desc(), StrengthSession.id.desc()
    ).limit(limit)

    sessions = (await db.execute(query)).scalars().all()
    if not sessions:
        return []

    # Load routine names in one pass.
    routine_ids = {s.routine_id for s in sessions if s.routine_id is not None}
    names: dict[int, str] = {}
    if routine_ids:
        rows = (
            await db.execute(
                select(StrengthRoutine.id, StrengthRoutine.name).where(
                    StrengthRoutine.id.in_(routine_ids)
                )
            )
        ).all()
        names = {rid: rname for rid, rname in rows}

    out: list[SessionRead] = []
    for session in sessions:
        logs = (
            await db.execute(
                select(StrengthSetLog)
                .where(StrengthSetLog.session_id == session.id)
                .order_by(StrengthSetLog.set_index.asc())
            )
        ).scalars().all()
        routine_name = names.get(session.routine_id) if session.routine_id else None
        out.append(_session_to_read(session, list(logs), routine_name))
    return out
