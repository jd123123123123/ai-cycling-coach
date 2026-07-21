"""Workout endpoints.

  · POST /workouts/today/modify       — adapt TODAY's planned session (the
    "Anpassen" sheet on Today/Train). Same audited pipeline as the chat tool.
  · POST /workouts/today/modify/undo  — revert the last modification (60-min
    server-enforced window, same as chat undo).
  · GET /workouts        — repeated workouts (count >= 2), most-repeated first
  · GET /workouts/{key}  — one workout's per-rep metrics + trends

RLS-protected via get_db_for_user.
"""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.athlete_profile import AthleteProfile
from app.models.user import User
from app.schemas.workout_progression import WorkoutGroupDetail, WorkoutGroupSummary
from app.services.workout_comparison import get_workout_group, list_workout_groups

router = APIRouter(prefix="/workouts", tags=["workouts"])


# ─── Adapt today's session (Einheit des Tages) ──────────────────────────────
# The direct REST twin of the chat `modify_planned_workout` tool: NO chat
# detour, but the EXACT same pipeline (rails context → apply_modification →
# PlannedWorkout write with blocks_source='user_modified' → CoachBrief audit
# row → plan_adaptations feed row → week-cache invalidation). The shared
# function lives in coach_tools.modify_planned_workout_for_user — never
# copy-pasted here.

class TodayModifyRequest(BaseModel):
    modification_type: Literal["shorten", "lengthen", "easier", "harder", "indoor"]
    # shorten/lengthen require a duration; the schema mirrors the tool's
    # advertised [10, 360] clamp.
    duration_min: int | None = Field(default=None, ge=10, le=360)


@router.post("/today/modify")
async def modify_today_workout(
    payload: TodayModifyRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Apply a one-tap modification to TODAY's planned workout ("Anpassen"
    sheet on the session card). Returns the tool-result dict — including
    `rails_downgraded` + a human `reason` — for honest client narration."""
    from app.services.athlete_time import set_athlete_tz_from_profile, today_local
    from app.services.coach_tools import modify_planned_workout_for_user

    # Athlete-local "today" — never the server's UTC date (audit P0-2).
    profile_res = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    set_athlete_tz_from_profile(profile_res.scalar_one_or_none())
    target = today_local()

    params: dict = {}
    if payload.duration_min is not None:
        params["duration_min"] = payload.duration_min

    result = await modify_planned_workout_for_user(
        user_id=current_user.id,
        target=target,
        modification_type=payload.modification_type,
        params=params,
        db=db,
    )

    # Today's prescription can live only in the brief (mesocycle rows may not
    # cover the current week yet). Materialize a plan row from the brief and
    # retry once — the swap must work on exactly what the card shows. Same
    # fallback the one-tap alternate endpoint uses.
    if result.get("found") is False:
        from app.api.coach import _materialize_today_plan_from_brief

        if await _materialize_today_plan_from_brief(db, current_user.id):
            result = await modify_planned_workout_for_user(
                user_id=current_user.id,
                target=target,
                modification_type=payload.modification_type,
                params=params,
                db=db,
            )
    return result


@router.post("/today/modify/undo")
async def undo_today_modify(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Undo the most recent workout modification ("Rückgängig") — the same
    60-minute server-enforced window and append-only audit as chat undo."""
    from app.services.coach_tools import undo_last_modification_for_user

    return await undo_last_modification_for_user(user_id=current_user.id, db=db)


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

