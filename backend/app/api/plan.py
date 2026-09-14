"""Plan API — plan-engine v2 surfaces.

GET /plan/adaptations — the athlete-visible adaptation feed (Today slim card
+ Plan timeline). Returns newest-first rows with bilingual messages; the
client picks message_de/message_en by locale. RLS-protected via
``get_db_for_user``.

POST /plan/build — build/rebuild the plan from the profile (onboarding CTA
"Build my plan" and internal re-triggers). Idempotent per athlete-local day.

GET /plan/change/interview + POST /plan/change/apply — the plan-change
interview: credits what was done (live CTL anchor + sacred user rows),
asks only what the profile can't already answer.
"""
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.athlete_profile import AthleteProfile
from app.models.user import User
from app.schemas.athlete import (
    AthleteProfileUpdate,
    DaysAvailable,
    ExperienceLevel,
    MotivationStyle,
    VarietyDial,
)
from app.services.plan_adaptation_log import recent_adaptations
from app.services.plan_interview import (
    apply_answers,
    build_interview_questions,
    interview_state,
    rebuild_plan,
)

router = APIRouter(prefix="/plan", tags=["plan"])


class PlanAdaptationRead(BaseModel):
    id: int
    created_at: str
    target_date: str
    source: str
    signal: str
    rule: str
    before: dict | None = None
    after: dict | None = None
    evidence: dict | None = None
    message_de: str
    message_en: str


class AdaptationFeed(BaseModel):
    adaptations: list[PlanAdaptationRead]


@router.get("/adaptations", response_model=AdaptationFeed, summary="Athlete-visible plan-adaptation feed")
async def get_adaptations(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    days: Annotated[int, Query(ge=1, le=60)] = 14,
    limit: Annotated[int, Query(ge=1, le=100)] = 40,
) -> AdaptationFeed:
    rows = await recent_adaptations(db, user.id, days=days, limit=limit)
    return AdaptationFeed(
        adaptations=[
            PlanAdaptationRead(
                id=r.id,
                created_at=r.created_at.isoformat(),
                target_date=r.target_date.isoformat(),
                source=r.source,
                signal=r.signal,
                rule=r.rule,
                before=r.before,
                after=r.after,
                evidence=r.evidence,
                message_de=r.message_de,
                message_en=r.message_en,
            )
            for r in rows
        ]
    )


# ──────────────────────────────────────────────────────────────────────────
#  POST /plan/build
# ──────────────────────────────────────────────────────────────────────────

class PlanBuildRequest(BaseModel):
    source: Literal["onboarding", "plan_change"] = "onboarding"


class PlanBuildResponse(BaseModel):
    rebuilt: bool
    plan_start_date: str
    week: list[dict]
    phase: str | None = None
    weekly_tss_targets: list[int] | None = None
    preserved_sessions: int | None = None
    ctl_anchor: float | None = None
    # Hours reconciliation (review finding 4): what the delivered week actually
    # costs vs what the athlete declared, plus the bilingual anchor explanation
    # when the CTL floor starts the plan below the stated hours.
    planned_hours: float | None = None
    declared_hours: float | None = None
    hours_note: dict | None = None
    # No-event fitness-builder progression horizon (review finding 5).
    progression: dict | None = None


async def _load_profile(db: AsyncSession, user_id: int) -> AthleteProfile:
    res = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = res.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=409, detail="Complete your profile setup first")
    return profile


class CurrentPlanResponse(BaseModel):
    plan_start_date: str | None = None
    plan_end_date: str | None = None
    phase: str | None = None
    weekly_tss_targets: list[int] | None = None
    planned_hours: float | None = None
    goal_name: str | None = None
    goal_date: str | None = None
    goal_start: str | None = None
    block_end_date: str | None = None
    has_event: bool = False
    focuses: list[Literal["endurance", "threshold", "vo2"]] = Field(default_factory=list)
    status: Literal["empty", "active", "ended"] = "empty"


@router.get("/current", response_model=CurrentPlanResponse)
async def current_plan(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> CurrentPlanResponse:
    """Read the saved plan. Opening this page must never generate a plan."""
    from app.models.mesocycle_plan import MesocyclePlan
    from app.services.athlete_time import set_athlete_tz_from_profile, today_local

    profile = await _load_profile(db, user.id)
    set_athlete_tz_from_profile(profile)
    from app.services.mesocycle_generator import _custom_focuses
    goals = profile.goals if isinstance(profile.goals, dict) else {}
    custom = goals.get("custom_goal")
    recommendation = goals.get("custom_goal_recommendation")
    recommendation = recommendation if isinstance(recommendation, dict) else {}
    focuses = _custom_focuses(custom) if isinstance(custom, dict) else []
    # Persisted input, not an incidental automatically generated mesocycle,
    # establishes the rider's explicit no-date plan choice.
    has_focus_plan = bool(focuses) and custom.get("target_date") is None
    goal_meta = dict(
        goal_name=goals.get("target_event_name") or recommendation.get("focus_label"),
        goal_date=profile.target_event_date.isoformat() if profile.target_event_date else None,
        goal_start=goals.get("custom_goal_started"),
        block_end_date=goals.get("custom_goal_block_end_date") or recommendation.get("block_end_date"),
        has_event=profile.target_event_date is not None,
        focuses=focuses,
    )
    # A mesocycle is a block, not the entire ongoing fitness plan. A passed
    # event refers to its own block, not maintenance auto-generated afterwards.
    ended = bool(profile.target_event_date and profile.target_event_date < today_local())
    until = profile.target_event_date if ended else today_local()
    result = await db.execute(select(MesocyclePlan).where(
        MesocyclePlan.user_id == user.id,
        MesocyclePlan.plan_start_date <= until,
    ).order_by(MesocyclePlan.plan_start_date.desc()).limit(1))
    plan = result.scalar_one_or_none()
    if plan is None:
        # Rebuilds historically removed old mesocycle rows. The saved event
        # remains real evidence of an ended goal, but its start is unknown.
        if ended:
            return CurrentPlanResponse(status="ended", plan_end_date=profile.target_event_date.isoformat(),
                **goal_meta)
        if has_focus_plan:
            return CurrentPlanResponse(status="active", planned_hours=profile.weekly_hours_available,
                **goal_meta)
        return CurrentPlanResponse()
    return CurrentPlanResponse(
        plan_start_date=plan.plan_start_date.isoformat(),
        plan_end_date=(min(plan.plan_end_date, profile.target_event_date) if ended else plan.plan_end_date).isoformat(),
        phase=plan.phase, weekly_tss_targets=plan.weekly_tss_targets,
        **goal_meta,
        planned_hours=profile.weekly_hours_available,
        status="ended" if ended else "active",
    )


@router.post("/build", response_model=PlanBuildResponse, summary="Build/rebuild the plan from the profile")
async def build_plan(
    payload: PlanBuildRequest,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> PlanBuildResponse:
    """Builds the plan from the current profile via the generator's public
    entry point. Idempotent per athlete-local day: a second call the same
    day returns the existing plan without rebuilding or re-logging.
    """
    profile = await _load_profile(db, user.id)
    if (profile.primary_sport or "cycling") == "cycling" and (profile.ftp_watts or 0) < 100:
        raise HTTPException(
            status_code=409,
            detail="Set your FTP (or connect Garmin/Strava) before building a plan",
        )
    try:
        summary = await rebuild_plan(
            db,
            user.id,
            profile,
            source=payload.source,
            signal="plan_build",
            idempotent_per_day=True,
        )
    except ValueError as exc:  # generator guards (FTP, profile)
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if summary.get("rebuilt"):
        # The personalized-week cache still holds the OLD plan's overlay —
        # without this the Train tab serves the stale week for up to 6h.
        from app.api.weeks import invalidate_personalized_week_cache

        invalidate_personalized_week_cache(user.id)
    return PlanBuildResponse(**summary)


# ──────────────────────────────────────────────────────────────────────────
#  Plan-change interview
# ──────────────────────────────────────────────────────────────────────────

class InterviewQuestionRead(BaseModel):
    id: str
    type: Literal["choice", "text"]
    prompt_de: str
    prompt_en: str
    options: list[str] | None = None


class InterviewRead(BaseModel):
    current: dict
    questions: list[InterviewQuestionRead]


@router.get("/change/interview", response_model=InterviewRead, summary="Plan-change interview: credit + delta questions")
async def get_change_interview(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> InterviewRead:
    """What was done under the current plan (credited, never scolded) plus
    the delta-driven questions — only what the profile can't already answer.
    """
    profile = await _load_profile(db, user.id)
    current = await interview_state(db, user.id, profile)
    questions = build_interview_questions(profile)
    return InterviewRead(
        current=current,
        questions=[InterviewQuestionRead(**q.as_dict()) for q in questions],
    )


class InterviewAnswers(BaseModel):
    """Typed answer payload — every field optional; ids match the questions."""

    felt_wrong: Literal["too_hard", "too_boring", "too_rigid", "life_changed"] | None = None
    goal_changed: Literal["same", "new_event", "no_event"] | None = None
    goal_new: Literal["race", "fondo", "audax", "maintenance"] | None = None
    target_event_date: date | None = None
    target_event_type: Literal["race", "fondo", "audax", "maintenance"] | None = None
    target_priority: Literal["A", "B", "C"] | None = None
    weekly_hours: float | None = None
    days_available: DaysAvailable | None = None
    hard_day_blackouts: list[str] | None = None
    experience_level: ExperienceLevel | None = None
    motivation_style: MotivationStyle | None = None
    variety_dial: VarietyDial | None = None


class PlanChangeApplyRequest(BaseModel):
    answers: InterviewAnswers


class PlanChangeApplyResponse(PlanBuildResponse):
    profile_updates: dict
    carried: dict


@router.post("/change/apply", response_model=PlanChangeApplyResponse, summary="Apply plan-change answers and regenerate")
async def apply_change(
    payload: PlanChangeApplyRequest,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> PlanChangeApplyResponse:
    """Updates the profile from the answers, regenerates via the same public
    entry point as /plan/build, and credits completed work: the ramp anchors
    to live CTL (done sessions live inside CTL) and athlete-owned rows
    survive. Writes a plan_adaptations row (source='plan_change').
    """
    profile = await _load_profile(db, user.id)

    # 1. Snapshot what was done BEFORE the rebuild — the credit ledger.
    carried = await interview_state(db, user.id, profile)

    # 2. Map answers → profile updates (pure) and persist them.
    answers = payload.answers.model_dump(exclude_unset=True, exclude_none=True)
    applied = apply_answers(profile, answers)
    if applied.updates:
        from app.services.athlete_service import update_profile

        # Validate through the same schema the profile PATCH uses.
        update = AthleteProfileUpdate(**applied.updates)
        profile = await update_profile(db, user.id, update)

    # 3. Rebuild through the shared path (source='plan_change').
    try:
        summary = await rebuild_plan(
            db,
            user.id,
            profile,
            source="plan_change",
            signal="plan_change" if not applied.signals else applied.signals[0],
            carried={
                "sessions_done": carried.get("sessions_done"),
                "compliance_pct": carried.get("compliance_pct"),
                "ctl_delta_since_start": carried.get("ctl_delta_since_start"),
                "profile_updates": sorted(applied.updates.keys()),
            },
            idempotent_per_day=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    # BLOCKER fix: the DB now holds the new week but the server-side
    # personalized-week cache still serves the old one — invalidate it so the
    # very next GET /weeks/current reflects the applied change.
    from app.api.weeks import invalidate_personalized_week_cache

    invalidate_personalized_week_cache(user.id)

    return PlanChangeApplyResponse(
        **summary,
        profile_updates=applied.updates,
        carried=carried,
    )
