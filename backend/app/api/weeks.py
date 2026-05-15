"""Weeks API endpoint — GET /weeks/current.

Returns the current 7-day plan with a language-aware preface paragraph.

All routes are RLS-protected via get_db_for_user which sets the PostgreSQL
session variable app.current_user_id, enabling RLS policies on
planned_workouts and mesocycle_plans to filter rows by the authenticated user.

The endpoint is idempotent: calling it multiple times in the same week
does NOT create duplicate PlannedWorkout rows — the mesocycle generator
has a UniqueConstraint on (user_id, plan_start_date) and skips existing dates.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.athlete_profile import AthleteProfile
from app.models.planned_workout import PlannedWorkout
from app.models.user import User
from app.schemas.weeks import (
    DayPlan,
    IntervalBlockOut,
    Language,
    MesoBlockContext,
    WeekResponse,
)
from app.services.advanced_metrics import ctl_atl_tsb_snapshot
from app.services.mesocycle_generator import generate_mesocycle, issurin_block_for_week
from app.services.weekly_rationale import build_weekly_rationale
from app.services.workout_templates import TEMPLATES, get_template

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weeks", tags=["weeks"])


# ──────────────────────────────────────────────────────────────────────────────
#  Per-day deterministic rationale helper
# ──────────────────────────────────────────────────────────────────────────────

_DAY_RATIONALE_SIMPLE: dict[str, list[str]] = {
    "rest": [
        "Rest day — let the body absorb the recent work.",
        "Easy day — you've earned a break.",
        "Rest day — recovery is part of the training.",
        "Off day — staying fresh for the week ahead.",
        "Rest — muscles repair and grow stronger today.",
        "Recovery day — today the body does the real work.",
        "Light day — protect your energy for the week ahead.",
    ],
    "recovery": [
        "Easy spin to flush the legs and keep the body moving.",
        "Gentle ride — keep the heart rate low and enjoy it.",
        "Recovery ride — easy enough to chat the whole way.",
        "Light session — active recovery to stay loose.",
        "Easy spin — not every day needs to be hard.",
        "Short, easy ride to promote blood flow and recovery.",
        "Recovery day — easy legs, fresh mind.",
    ],
    "endurance": [
        "Long steady ride — the foundation of all endurance fitness.",
        "Aerobic base building — consistent effort, no burning.",
        "Steady endurance session — the engine room of your fitness.",
        "Base miles — the work that pays off in months, not days.",
        "Long and easy — the best fitness builder per hour of training.",
        "Aerobic ride — keep it conversational and cover the distance.",
        "Endurance session — steady effort and let the mileage do the talking.",
    ],
    "tempo": [
        "Comfortably hard — just below where it starts to hurt.",
        "Tempo effort — steady pressure that builds race fitness.",
        "Threshold-adjacent — a sustained push to lift your ceiling.",
        "Solid tempo work — challenging but completely doable.",
        "Sustained effort — the kind that makes you stronger in a few weeks.",
        "Tempo ride — focused, controlled, and effective.",
        "A quality session — hard enough to adapt, easy enough to recover fast.",
    ],
    "sweet_spot": [
        "Sweet spot — hard enough to build fitness, easy enough to do often.",
        "High-quality work in the productive middle ground.",
        "Sweet spot session — the most effective zone for time-crunched athletes.",
        "Sustained intervals — the bread and butter of structured training.",
        "Quality session — targeted effort that delivers fast fitness gains.",
        "Productive hard work — balanced effort for maximum adaptation.",
        "Sweet spot intervals — your main fitness builder for the week.",
    ],
    "threshold": [
        "Threshold session — holding the line between hard and very hard.",
        "Tough but targeted — exactly the stimulus needed right now.",
        "Hard intervals at your limit — this is where the fitness jumps come from.",
        "Threshold work — you'll feel it, but you'll recover quickly.",
        "Tough session — stay focused and hit the targets.",
        "Key quality session — the hardest effort of the week.",
        "Threshold intervals — controlled discomfort with big returns.",
    ],
    "vo2": [
        "Short hard efforts to lift your aerobic ceiling.",
        "VO2 work — brief, intense, and highly effective.",
        "Hard but short — your body adapts fast to these efforts.",
        "High-intensity intervals — the fastest route to a higher ceiling.",
        "Tough short work — you'll be glad you did it in a few weeks.",
        "Quality intervals — brief windows of real effort.",
        "Intense but short session — hard efforts to push your limits.",
    ],
}

_DAY_RATIONALE_TECHNICAL: dict[str, list[str]] = {
    "rest": [
        "Rest day — structural remodelling and glycogen supercompensation.",
        "Off day — parasympathetic recovery; CTL consolidates.",
        "Rest — ATL flush underway; HRV typically rebounds within 36h.",
        "Rest day — Friel recovery prescription.",
        "Full recovery — mitochondrial biogenesis peaks at rest.",
        "Rest — Banister model: fatigue decays, fitness holds.",
        "Off — maintain TSB target above -10 today.",
    ],
    "recovery": [
        "Recovery Z1 — flush the legs after high-load days; lactate clearance.",
        "Active recovery at ≤55% FTP — parasympathetic dominance maintained.",
        "Recovery ride — sub-threshold, RPE 2-3, no neuromuscular stress.",
        "Easy Z1-Z2 spin — keep EPOC minimal, protect ATL.",
        "Recovery session — sub-LT1 to support Issurin block transition.",
        "Low-stress ride — restore glycogen, flush metabolites.",
        "Recovery Z1 — short aerobic flush before the next hard block.",
    ],
    "endurance": [
        "Z2 aerobic base — Maffetone / San Millán: mitochondrial density stimulus.",
        "Long Z2 session — fat oxidation pathway; Seiler polarized cornerstone.",
        "Aerobic endurance — sub-LT1 for maximal aerobic enzyme adaptation.",
        "Z2 base miles — central cardiac stroke-volume adaptation.",
        "Friel base-phase cornerstone: sub-threshold aerobic accumulation.",
        "Endurance block — high volume sub-LT1 per Seiler polarized model.",
        "Z2 long ride — aerobic base; highest stimulus per training stress unit.",
    ],
    "tempo": [
        "Tempo Z3 — Friel tempo: between LT1 and LT2, high lactate steady-state.",
        "Sustained Z3 effort — sweet-spot adjacent, aerobic threshold stress.",
        "Tempo session — 76-90% FTP sustained; crosses LT1, spares LT2.",
        "Z3 tempo intervals — aerobic power ceiling lift.",
        "Friel build-phase tempo: raises LT1 without accumulating deep Z4-5 fatigue.",
        "Sustained tempo Z3 — prolonged lactate clearance adaptation.",
        "Tempo block — productive LT1-LT2 zone for fitness building.",
    ],
    "sweet_spot": [
        "Sweet spot 88-93% FTP — Coggan Z4 lower; highest TSS per hour with manageable ATL.",
        "Sweet-spot block — straddles LT2; deep aerobic and threshold adaptation.",
        "SS intervals — 88-93% FTP sustained; Friel build-phase key stimulus.",
        "Sweet spot Z3-Z4 — maximises training density; 2-3×/week recoverable.",
        "Classic sweet-spot session — 10-20% FTP below LT2 for maximum adaptation index.",
        "SS quality session — Coggan zone boundary work; high-yield density.",
        "Sweet-spot intervals — the most efficient adaptation stimulus in Friel build phases.",
    ],
    "threshold": [
        "Threshold Z4 — ~100% FTP sustained; LT2 stimulus, maximal aerobic power.",
        "LT2 intervals — Friel build stimulus: 95-105% FTP with full recovery between.",
        "Threshold session — 5-20min at FTP; neuromuscular and metabolic adaptation.",
        "Z4 threshold block — near-maximal lactate steady-state training.",
        "Classic threshold work — Coggan Z4 ceiling; builds FTP directly.",
        "Key Z4 session — highest single-session adaptation per Friel build protocol.",
        "Threshold intervals — LT2 stress with structured recovery.",
    ],
    "vo2": [
        "VO2max intervals Z5 — Coggan Z5 (106-120% FTP); raises aerobic ceiling.",
        "High-intensity Z5 block — Seiler 'hard day'; oxygen uptake ceiling stimulus.",
        "VO2 intervals — Billat / Seiler: 3-5min at Z5 accumulates VO2time.",
        "Z5 VO2max session — 110-120% FTP short intervals; aerobic ceiling lift.",
        "Classic VO2 work — 4-6x4min at 115% FTP per Friel build 2 protocol.",
        "VO2max stimulus — Coggan Z5; highest aerobic adaptation per session.",
        "Intense VO2 block — Z5 intervals for aerobic ceiling development.",
    ],
}


def _per_day_rationale(
    category: str,
    day_index: int,
    language: Language,
) -> str:
    """Return a one-sentence per-day rationale for a workout category.

    Deterministic in Phase 7.0 — day_index selects from the 7-sentence bank
    so each day of the week gets distinct copy. No LLM; Phase 7.2 polishes.
    """
    bank = (
        _DAY_RATIONALE_TECHNICAL
        if language == "technical"
        else _DAY_RATIONALE_SIMPLE
    )
    sentences = bank.get(category, bank["endurance"])
    return sentences[day_index % len(sentences)]


# ──────────────────────────────────────────────────────────────────────────────
#  Endpoint
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/current", response_model=WeekResponse)
async def get_current_week(
    language: Annotated[
        Language,
        Query(description="Language mode: 'simple' (default) or 'technical'."),
    ] = "simple",
    locale: Annotated[
        Literal["en", "de"],
        Query(description="UI locale — 'en' (default) or 'de'."),
    ] = "en",
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_active_user),
) -> WeekResponse:
    """Return today + next 6 days as a planned week with rationale.

    Generates a mesocycle if the athlete does not have one for the current week.
    Idempotent: repeat calls within the same week return the same plan.
    RLS-scoped: each user sees only their own workouts.
    """
    # ── 1. Compute today + week_start (Monday anchor) ─────────────────────
    today = date.today()
    # week_start = most recent Monday (Monday=0 in weekday())
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    # ── 2. Load athlete profile ───────────────────────────────────────────
    profile_result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    athlete: AthleteProfile | None = profile_result.scalar_one_or_none()

    if athlete is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Complete your profile setup first",
            headers={"X-Error-Code": "profile_required"},
        )

    # FTP guard — cycling primary only
    primary_sport = athlete.primary_sport or "cycling"
    ftp_w = athlete.ftp_watts or 0
    if primary_sport == "cycling" and ftp_w < 100:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Set your FTP before generating a plan",
            headers={"X-Error-Code": "ftp_required"},
        )

    # ── 3. Generate mesocycle (idempotent) ────────────────────────────────
    try:
        meso = await generate_mesocycle(db, current_user.id, plan_start_date=week_start)
    except ValueError as exc:
        err = str(exc)
        if "ftp_watts" in err.lower() or "ftp" in err.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Set your FTP before generating a plan",
                headers={"X-Error-Code": "ftp_required"},
            ) from exc
        if "no athleteprofile" in err.lower() or "athlete" in err.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Complete your profile setup first",
                headers={"X-Error-Code": "profile_required"},
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Mesocycle generation failed: {err}",
        ) from exc

    # ── 4. PMC snapshot — CTL + 7d delta ─────────────────────────────────
    pmc_snap = await ctl_atl_tsb_snapshot(db, current_user.id)
    ctl_now = float(pmc_snap.get("ctl") or 0.0)
    ctl_delta_7d = float(pmc_snap.get("ctl_7d_delta") or 0.0)

    # ── 5. Event context ─────────────────────────────────────────────────
    target_event_date = athlete.target_event_date
    target_event_type = athlete.target_event_type
    days_to_event = (
        (target_event_date - today).days
        if target_event_date is not None
        else None
    )

    # ── 6. Meso block context ─────────────────────────────────────────────
    meso_phase = meso.phase
    # Current week's position within the meso (0..3 clamped)
    days_into_meso = (today.toordinal() - meso.plan_start_date.toordinal())
    block_index_in_meso = min(max(days_into_meso // 7, 0), 3)
    block_position = issurin_block_for_week(block_index_in_meso)

    tss_targets: list[int] = meso.weekly_tss_targets or []
    week_tss_target = (
        tss_targets[block_index_in_meso]
        if block_index_in_meso < len(tss_targets)
        else 0
    )

    seiler_dist = meso.seiler_distribution or {}
    seiler_z3_pct = float(seiler_dist.get("z3_pct", 0.15))

    # ── 7. Load the 7 PlannedWorkout rows (today..today+6) ───────────────
    pw_result = await db.execute(
        select(PlannedWorkout)
        .where(
            PlannedWorkout.user_id == current_user.id,
            PlannedWorkout.date >= today,
            PlannedWorkout.date <= today + timedelta(days=6),
        )
        .order_by(PlannedWorkout.date)
    )
    pws = pw_result.scalars().all()

    # Build a lookup: date → PlannedWorkout (for gap-filling)
    pw_by_date: dict[date, PlannedWorkout] = {pw.date: pw for pw in pws}

    # ── 8. Build DayPlan list — exactly 7, one per day ──────────────────
    days: list[DayPlan] = []
    for i in range(7):
        day_date = today + timedelta(days=i)
        pw = pw_by_date.get(day_date)

        if pw is not None:
            template_id = pw.template_id
            tmpl = get_template(template_id) if template_id else None

            # Resolve category from template or fallback to 'endurance'
            category: str = tmpl.category if tmpl else "endurance"

            # target_tss: template base_tss as rounded int
            target_tss_val: int | None = (
                int(round(tmpl.base_tss)) if tmpl else None
            )

            # Build interval list from interval_structure JSON
            interval_structure = pw.interval_structure or {}
            raw_intervals = interval_structure.get("intervals", [])
            intervals_out = [
                IntervalBlockOut(
                    duration_seconds=blk.get("duration_seconds", 0),
                    power_target_pct_ftp=blk.get("power_target_pct_ftp"),
                    zone=blk.get("zone", 1),
                )
                for blk in raw_intervals
            ]

            # day-of-week index relative to week_start (Mon=0..Sun=6) for copy selection
            dow = day_date.weekday()

            day_plan = DayPlan(
                date=day_date,
                sport=pw.sport,
                title=pw.title,
                template_id=template_id,
                duration_seconds_target=pw.duration_seconds_target,
                target_tss=target_tss_val,
                category=category,
                intervals=intervals_out,
                rationale=_per_day_rationale(category, dow, language),
                is_today=(day_date == today),
            )
        else:
            # Gap day — no PlannedWorkout exists (e.g. meso starts in the future
            # or the date is outside the generated window)
            dow = day_date.weekday()
            day_plan = DayPlan(
                date=day_date,
                sport=primary_sport,
                title="Rest",
                template_id=None,
                duration_seconds_target=None,
                target_tss=None,
                category="rest",
                intervals=[],
                rationale=_per_day_rationale("rest", dow, language),
                is_today=(day_date == today),
            )

        days.append(day_plan)

    # ── 9. Weekly preface from rationale service ─────────────────────────
    preface = build_weekly_rationale(
        phase=meso_phase,
        block_position=block_position,
        block_index_in_meso=block_index_in_meso,
        weekly_tss_target=week_tss_target,
        ctl_now=ctl_now,
        ctl_delta_7d=ctl_delta_7d,
        days_to_event=days_to_event,
        target_event_type=target_event_type,
        seiler_z3_pct=seiler_z3_pct,
        language=language,
        locale=locale,
    )

    # ── 10. Assemble response ─────────────────────────────────────────────
    meso_block_ctx = MesoBlockContext(
        phase=meso_phase,
        block_position=block_position,
        block_index_in_meso=block_index_in_meso,
        weekly_tss_target=week_tss_target,
        days_to_event=days_to_event,
        target_event_type=target_event_type,
    )

    return WeekResponse(
        week_start=week_start,
        week_end=week_end,
        language=language,
        preface=preface,
        meso_block=meso_block_ctx,
        days=days,
    )
