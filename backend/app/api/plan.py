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
    PLAN_CANCELLED_KEY,
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


# ──────────────────────────────────────────────────────────────────────────
#  Der Fahrer darf aufhoeren
# ──────────────────────────────────────────────────────────────────────────
#
# `status` steht nirgends in der Datenbank -- er wird gerechnet, und zwar bis
# eben ausschliesslich so: `ended = target_event_date < heute`. Ein Plan konnte
# also NUR dadurch enden, dass sein Renntag vergeht. Den Gedanken "ich hoere
# hier auf" gab es im Datenmodell nicht, und damit auch keinen Weg, ihn
# auszudruecken.
#
# KEINE MIGRATION. `profile.goals` ist laengst eine JSON-Spalte und traegt
# `custom_goal`, `custom_goal_started`, `custom_goal_block_end_date`. Ein
# `plan_cancelled_at` daneben folgt demselben Muster -- und zwei Alembic-Koepfe
# haben diese Produktion schon einmal beim Booten getoetet.
#
# ABBRECHEN HEISST BEENDEN, NICHT LOESCHEN. Der Plan springt in `ended` und
# damit in den Abschluss-Screen, den es laengst gibt: Adhaerenz-Ring, Soll-Ist,
# Gesamtzahlen, "Was baust du als Naechstes?". Loeschen wuerfe diesen Screen weg
# und naehme der Fahrtenhistorie ihren Zusammenhang.
def _plan_stop(planned_end: date, event_over_on: date | None, cancelled: date | None) -> date:
    """Der frueheste Tag, an dem dieser Block wirklich vorbei war."""
    stops = [planned_end] + [d for d in (event_over_on, cancelled) if d is not None]
    return min(stops)


def _cancelled_on(goals: dict) -> date | None:
    """Das Datum, an dem der Fahrer diesen Plan beendet hat, oder ``None``.

    Streng geparst: ein unlesbarer Wert ist KEIN Abbruch. Lieber einen Plan
    weiterlaufen lassen als ihn wegen eines kaputten Strings zu beenden.
    """
    raw = goals.get(PLAN_CANCELLED_KEY)
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


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
    event_over = bool(profile.target_event_date and profile.target_event_date < today_local())
    # Ein Abbruch wird beim Neubau geloescht (siehe `rebuild_plan`), ein hier
    # gefundener Wert gehoert also immer zum AKTUELLEN Plan.
    cancelled = _cancelled_on(goals)
    ended = event_over or cancelled is not None
    until = profile.target_event_date if event_over else (cancelled or today_local())
    result = await db.execute(select(MesocyclePlan).where(
        MesocyclePlan.user_id == user.id,
        MesocyclePlan.plan_start_date <= until,
    ).order_by(MesocyclePlan.plan_start_date.desc()).limit(1))
    plan = result.scalar_one_or_none()
    if plan is None:
        # Rebuilds historically removed old mesocycle rows. The saved event
        # remains real evidence of an ended goal, but its start is unknown.
        if ended:
            stop = profile.target_event_date if event_over else cancelled
            return CurrentPlanResponse(status="ended",
                plan_end_date=stop.isoformat() if stop else None, **goal_meta)
        if has_focus_plan:
            return CurrentPlanResponse(status="active", planned_hours=profile.weekly_hours_available,
                **goal_meta)
        return CurrentPlanResponse()
    return CurrentPlanResponse(
        plan_start_date=plan.plan_start_date.isoformat(),
        # Ein beendeter Plan endet an dem Tag, an dem er beendet wurde -- nicht
        # an dem, an dem er geendet haette.
        plan_end_date=_plan_stop(plan.plan_end_date, profile.target_event_date if event_over else None, cancelled).isoformat(),
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


class PlanCancelResponse(BaseModel):
    status: Literal["ended"]
    cancelled_on: str


@router.post("/cancel", response_model=PlanCancelResponse,
             summary="Den laufenden Plan beenden (nicht loeschen)")
async def cancel_plan(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> PlanCancelResponse:
    """Beendet den laufenden Block zum heutigen Athletentag.

    LOESCHT NICHTS. Der Plan springt in `ended` und damit in den
    Abschluss-Screen, den es laengst gibt. Fahrten, Adaptationen und die
    Auswertung bleiben; was faellt, sind kuenftige geplante Einheiten -- und
    die fallen erst beim naechsten Neubau, nicht hier.

    Zweimal abbrechen ist kein Fehler: der zweite Aufruf gibt denselben Tag
    zurueck, statt das Ende nach hinten zu schieben. Sonst haette ein
    Doppelklick die Auswertung eines beendeten Plans verlaengert.
    """
    from app.services.athlete_time import set_athlete_tz_from_profile, today_local

    profile = await _load_profile(db, user.id)
    set_athlete_tz_from_profile(profile)
    goals = dict(profile.goals) if isinstance(profile.goals, dict) else {}
    already = _cancelled_on(goals)
    if already is not None:
        return PlanCancelResponse(status="ended", cancelled_on=already.isoformat())

    from app.services.plan_history import finish_journey
    await finish_journey(db, user.id, profile, 'cancelled')
    # ensure_journey may add its stable identity; preserve it in the profile.
    goals = dict(profile.goals or {})
    today = today_local()
    goals[PLAN_CANCELLED_KEY] = today.isoformat()
    # Neues dict, nicht mutieren: eine JSON-Spalte an Ort und Stelle zu aendern
    # meldet SQLAlchemy nicht als dirty, und das Ende waere nie gespeichert.
    profile.goals = goals
    await db.commit()

    # Die personalisierte Woche haelt noch die Ueberlagerung des laufenden
    # Plans -- ohne das zeigt Heute bis zu sechs Stunden lang weiter Einheiten
    # aus einem Plan, den der Fahrer gerade beendet hat.
    from app.api.weeks import invalidate_personalized_week_cache

    invalidate_personalized_week_cache(user.id)
    return PlanCancelResponse(status="ended", cancelled_on=today.isoformat())


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


# ── Tage tauschen ───────────────────────────────────────────────────────────
# Der Plan liess sich bisher nur NEU BERECHNEN, nicht umstellen. Wer wusste,
# dass er Donnerstag keine Zeit hat, konnte die Einheit nicht auf Freitag
# ziehen -- er konnte nur den ganzen Block neu bauen lassen und hoffen. Das ist
# der Unterschied zwischen einem Plan, den man liest, und einem, der einem
# gehoert.
#
# WARUM TAUSCHEN UND NICHT VERSCHIEBEN. Ein Verschieben auf einen belegten Tag
# muesste entscheiden, was mit dem dortigen Training passiert -- und jede
# Antwort darauf waere geraten. Ein Tausch ist umkehrbar, erhaelt die
# Wochenlast exakt und braucht keine Annahme.
#
# BEIDE TAGE WERDEN `user_modified`. Das ist eine PROTECTED-Quelle: Die
# stuendliche Anpassung fasst sie nicht mehr von sich aus an. Wer seinen Plan
# selbst ordnet, soll ihn am naechsten Morgen nicht umgeraeumt vorfinden.

class PlanDaySwapRequest(BaseModel):
    a: date = Field(description="Erster Tag (ISO)")
    b: date = Field(description="Zweiter Tag (ISO)")


class PlanDaySwapResponse(BaseModel):
    swapped: bool
    a_title: str | None = None
    b_title: str | None = None
    detail: str | None = None


@router.post("/day/swap", response_model=PlanDaySwapResponse,
             summary="Zwei geplante Tage gegeneinander tauschen")
async def swap_plan_days(
    payload: PlanDaySwapRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> PlanDaySwapResponse:
    """Tauscht den Inhalt zweier Plantage. Vergangenes bleibt unangetastet."""
    from app.models.planned_workout import PlannedWorkout
    from app.services.athlete_time import set_athlete_tz_from_profile, today_local

    if payload.a == payload.b:
        raise HTTPException(status_code=400, detail="Gleicher Tag.")

    prof = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    set_athlete_tz_from_profile(prof.scalar_one_or_none())
    heute = today_local()
    # Was gefahren ist, ist gefahren. Ein Tausch in die Vergangenheit wuerde
    # eine Trainingshistorie umschreiben, die so nie stattgefunden hat.
    if payload.a < heute or payload.b < heute:
        raise HTTPException(
            status_code=400, detail="Vergangene Tage lassen sich nicht tauschen."
        )

    res = await db.execute(
        select(PlannedWorkout).where(
            PlannedWorkout.user_id == current_user.id,
            PlannedWorkout.date.in_([payload.a, payload.b]),
            PlannedWorkout.sport == "cycling",
        )
    )
    rows = {r.date: r for r in res.scalars().all()}
    ra, rb = rows.get(payload.a), rows.get(payload.b)
    if ra is None and rb is None:
        raise HTTPException(status_code=404, detail="An beiden Tagen steht nichts.")

    # Nur der INHALT wandert, nicht die Zeile: `date` bleibt, wo sie ist, damit
    # kein Index und keine Fremdbeziehung nachgezogen werden muss.
    felder = ("title", "duration_seconds_target", "description", "interval_structure",
              "indoor", "template_id")

    if ra is not None and rb is not None:
        for f in felder:
            va, vb = getattr(ra, f), getattr(rb, f)
            setattr(ra, f, vb)
            setattr(rb, f, va)
        ra.blocks_source = "user_modified"
        rb.blocks_source = "user_modified"
        neu_a, neu_b = ra.title, rb.title
    else:
        # Ein Tag ist ein Ruhetag ohne Zeile: die vorhandene Zeile zieht um.
        # `rows` ist danach veraltet -- die Titel werden VOR dem Umzug gemerkt.
        quelle = ra if ra is not None else rb
        war_a = quelle is ra
        quelle.date = payload.b if war_a else payload.a
        quelle.blocks_source = "user_modified"
        neu_a, neu_b = (None, quelle.title) if war_a else (quelle.title, None)

    await db.commit()
    return PlanDaySwapResponse(swapped=True, a_title=neu_a, b_title=neu_b)

# Plan history is separate from the mutable generated blocks. Only the refresh
# command writes snapshots; listing and opening past plans are read-only.
@router.post('/history/refresh', summary='Preserve current plan and close elapsed plans')
async def refresh_plan_history(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
):
    from app.services.plan_history import refresh_journey
    profile = (await db.execute(select(AthleteProfile).where(AthleteProfile.user_id == user.id).with_for_update())).scalar_one_or_none()
    if profile is None:
        return {'saved': False}
    await refresh_journey(db, user.id, profile)
    await db.commit()
    return {'saved': True}


@router.get('/history', summary='Previously saved plans for the signed-in rider')
async def plan_history(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
    limit: Annotated[int, Query(ge=1, le=30)] = 8,
):
    from app.models.plan_journey import PlanJourney
    from app.services.plan_history import summary
    records = (await db.execute(select(PlanJourney).where(PlanJourney.user_id == user.id, PlanJourney.status != 'active').order_by(PlanJourney.created_at.desc(), PlanJourney.id.desc()).offset(offset).limit(limit + 1))).scalars().all()
    return {'plans': [summary(r) for r in records[:limit]], 'next_offset': offset + limit if len(records) > limit else None}


@router.get('/history/{journey_id}', summary='Saved plan structure and observed outcomes')
async def plan_history_detail(
    journey_id: str,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
):
    from app.models.plan_journey import PlanJourney
    from app.services.plan_history import summary
    record = (await db.execute(select(PlanJourney).where(PlanJourney.user_id == user.id, PlanJourney.id == journey_id))).scalar_one_or_none()
    if record is None:
        raise HTTPException(404, 'Plan not found')
    return {**summary(record), 'goal': record.goal, 'revisions': record.revisions, 'outcome': record.outcome}
