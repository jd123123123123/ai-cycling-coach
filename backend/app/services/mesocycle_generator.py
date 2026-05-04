"""Mesocycle generator — deterministic 4-week periodization engine.

Produces a MesocyclePlan with 28 daily PlannedWorkout drafts respecting:
  - Friel macrocycle phase (detected from target_event_date + CTL)
  - Issurin 3:1 block structure (3 build weeks + 1 recovery)
  - Seiler weekly TID per phase (imported from training_periodization)

Design principles
─────────────────
- NO LLM — fully deterministic rules-based engine.
- Idempotent on (user_id, plan_start_date): a second call with the same
  anchor returns the existing MesocyclePlan unchanged.
- PlannedWorkout drafts carry ``power_target_pct_ftp`` blocks ONLY — never
  absolute watts.  Materialisation at 100% FTP happens at request time
  (server-side authority preserved per Phase 5.1 design decision).
- Conflict-skip: if a PlannedWorkout for (user_id, date) already exists
  (e.g. user has a custom workout), it is NOT overwritten.

References
──────────
  Friel (Training Bible), Issurin (Block Periodization), Seiler & Tonnessen
  2009, Mujika taper protocols.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import TYPE_CHECKING, Literal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mesocycle_plan import MesocyclePlan
from app.models.planned_workout import PlannedWorkout
from app.services.training_periodization import (
    Phase,
    SessionType,
    _PHASE_MIX,
    detect_training_phase,
    pick_template,
    session_type_for_today,
)
from app.services.workout_templates import TEMPLATES

if TYPE_CHECKING:
    from app.models.athlete_profile import AthleteProfile

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
#  Module-level constants
# ──────────────────────────────────────────────────────────────────────────────

MESO_LENGTH_WEEKS = 4
FRIEL_RAMP_CAP_PCT = 0.08  # 8% week-over-week max (Friel Training Bible)

# Issurin block names — weeks 0-2 are build, week 3 is recovery
_ISSURIN_BLOCK_NAMES: dict[int, Literal["accumulation", "transmutation", "realization", "recovery"]] = {
    0: "accumulation",
    1: "transmutation",
    2: "realization",
    3: "recovery",
}

# Ramp factors per Issurin position — applied to CTL×7 baseline
_RAMP_FACTOR: dict[str, float] = {
    "accumulation": 1.05,
    "transmutation": 1.10,
    "realization":  1.15,
    "recovery":     0.65,
}

# Hard session session types
_HARD_TYPES: frozenset[SessionType] = frozenset({"sweet_spot", "threshold", "vo2", "tempo"})

# Default available minutes when we have no schedule signal at generation time
_DEFAULT_AVAILABLE_MINUTES = 90


# ──────────────────────────────────────────────────────────────────────────────
#  Exported helper functions
# ──────────────────────────────────────────────────────────────────────────────

def issurin_block_for_week(
    week_index: int,
    total_weeks: int = 4,
) -> Literal["accumulation", "transmutation", "realization", "recovery"]:
    """Issurin 3:1 block position for a given week index.

    Weeks 0..2 are progressive build weeks (accumulation → transmutation →
    realization).  Week 3 is the mandatory recovery week (TSS reduced ~35%).

    Args:
        week_index: 0-indexed week within the mesocycle.
        total_weeks: total weeks in the meso (default 4, reserved for future 3/6-week mesos).

    Returns:
        One of 'accumulation', 'transmutation', 'realization', 'recovery'.

    Raises:
        ValueError: if week_index is out of range [0, total_weeks).
    """
    if week_index < 0 or week_index >= total_weeks:
        raise ValueError(f"week_index must be in [0, {total_weeks}), got {week_index}")
    if week_index == total_weeks - 1:
        return "recovery"
    return _ISSURIN_BLOCK_NAMES[week_index]


def weekly_tss_target(
    ctl: float,
    phase: Phase,
    block_position: Literal["accumulation", "transmutation", "realization", "recovery"],
) -> int:
    """Compute weekly TSS target for one Issurin block position.

    Formula: CTL × 7 × ramp_factor, capped at Friel 8% rule.

    The 8% cap prevents week-over-week TSS from increasing by more than
    FRIEL_RAMP_CAP_PCT over the previous build week.  For recovery weeks
    the cap is irrelevant (we always drop to 65%).

    Args:
        ctl:            Athlete's current CTL (stress/day average).
        phase:          Friel training phase (influences ramp range).
        block_position: Issurin block ('accumulation', 'transmutation',
                        'realization', 'recovery').

    Returns:
        Integer weekly TSS.
    """
    base_tss = ctl * 7.0
    ramp = _RAMP_FACTOR[block_position]

    if block_position == "recovery":
        return int(round(base_tss * ramp))

    # Clamp ramp to Friel 8% cap — if ramp already exceeds cap use cap
    effective_ramp = min(ramp, 1.0 + FRIEL_RAMP_CAP_PCT)
    return int(round(base_tss * effective_ramp))


@dataclass
class PlannedWorkoutDraft:
    """Transient draft — not yet persisted to the DB.  Caller bulk-inserts."""
    user_id: int
    date: date
    sport: str
    title: str
    duration_seconds_target: int
    interval_structure: dict
    template_id: str
    blocks_source: str = "ai_prescribed"


def build_week_drafts(
    athlete: "AthleteProfile",
    week_start: date,
    phase: Phase,
    weekly_tss_target_val: int,
    block_position: Literal["accumulation", "transmutation", "realization", "recovery"],
    ftp_w: int,
) -> list[PlannedWorkoutDraft]:
    """Build 7 PlannedWorkoutDraft objects for one week.

    Template selection respects Seiler distribution + hard-session count from
    _PHASE_MIX.  Calls session_type_for_today with synthetic weekly_progress
    (cumulative state built day-by-day as we iterate Mon→Sun).

    Monday is typically rest after a hard weekend.  Wednesday is the primary
    quality day for build phases.  Sunday is the long Z2 ride.

    Args:
        athlete:              AthleteProfile ORM object (needs ftp_watts, primary_sport).
        week_start:           Date of Monday (week[0]).
        phase:                Friel phase for this meso.
        weekly_tss_target_val: TSS budget for the week (from weekly_tss_target()).
        block_position:       Issurin block position within the meso.
        ftp_w:                Athlete FTP in watts.

    Returns:
        List of 7 PlannedWorkoutDraft objects (Mon..Sun), NOT persisted.
    """
    sport = athlete.primary_sport or "cycling"
    drafts: list[PlannedWorkoutDraft] = []

    # Synthetic TSB for generation — no readiness signals at plan time
    # Use a neutral TSB of 0 (no freshness / fatigue signal)
    synthetic_tsb = 0.0

    # Track weekly progress as we build the week
    hard_sessions_done = 0
    vo2_sessions_done = 0
    cumulative_tss = 0.0

    for dow in range(7):  # 0=Mon, 6=Sun
        day_date = week_start + timedelta(days=dow)

        weekly_progress = {
            "hard_sessions_done": hard_sessions_done,
            "vo2_sessions_done": vo2_sessions_done,
            "today_tss": 0.0,  # generation time — not "today"
            "yesterday_tss": 0.0,  # synthetic — no historical signal
            "last_48h_tss": 0.0,  # synthetic
            "total_tss_this_week": cumulative_tss,
        }

        session_type = session_type_for_today(
            phase=phase,
            weekly_progress=weekly_progress,
            tsb=synthetic_tsb,
            intensity_ceiling="push",  # no readiness ceiling at generation time
            day_of_week=dow,
        )

        # Estimate available minutes from athlete schedule or default
        available_min = int((athlete.weekly_hours_available or 10.0) / 7.0 * 60)
        available_min = max(available_min, 30)  # floor at 30 min

        # For long ride (Sunday) or key sessions: use a longer window
        if dow == 6:  # Sunday long ride
            available_min = max(available_min, 120)
        elif session_type in _HARD_TYPES and dow == 2:  # Wed key session
            available_min = max(available_min, 75)

        template = pick_template(session_type, ftp_w, available_min)

        # Build interval_structure from template blocks
        intervals = [
            {
                "name": blk.name,
                "duration_seconds": blk.duration_s,
                "power_target_pct_ftp": blk.target_pct_ftp,
                "zone": blk.zone,
                "rpe": blk.target_rpe,
            }
            for blk in template.blocks
        ]
        interval_structure = {"intervals": intervals}

        duration_s = sum(blk.duration_s for blk in template.blocks)
        draft = PlannedWorkoutDraft(
            user_id=athlete.user_id,
            date=day_date,
            sport=sport,
            title=template.name,
            duration_seconds_target=duration_s,
            interval_structure=interval_structure,
            template_id=template.id,
            blocks_source="ai_prescribed",
        )
        drafts.append(draft)

        # Update synthetic weekly progress counters
        if session_type in _HARD_TYPES:
            hard_sessions_done += 1
        if session_type == "vo2":
            vo2_sessions_done += 1
        cumulative_tss += template.base_tss

    return drafts


# ──────────────────────────────────────────────────────────────────────────────
#  Public generator
# ──────────────────────────────────────────────────────────────────────────────

def _next_monday(from_date: date) -> date:
    """Return the next Monday on or after from_date."""
    days_ahead = (0 - from_date.weekday()) % 7  # Monday = 0
    return from_date + timedelta(days=days_ahead)


async def generate_mesocycle(
    db: AsyncSession,
    user_id: int,
    plan_start_date: date | None = None,
) -> MesocyclePlan:
    """Generate or return existing MesocyclePlan for (user_id, plan_start_date).

    Idempotent: if a plan already exists for the anchor (user_id, plan_start_date),
    it is returned unchanged without touching any PlannedWorkout rows.

    Otherwise:
      1. Detect Friel phase from athlete profile.
      2. Build Issurin 3:1 weekly TSS targets.
      3. INSERT MesocyclePlan row.
      4. For each of the 28 days, build a PlannedWorkoutDraft and INSERT —
         skipping any (user_id, date) that already has a PlannedWorkout.

    Args:
        db:              SQLAlchemy AsyncSession.
        user_id:         Athlete's user ID.
        plan_start_date: Monday to anchor the meso.  Defaults to the next Monday
                         from today.  If a non-Monday is supplied, it is advanced
                         to the following Monday with a warning.

    Returns:
        MesocyclePlan (existing or newly created).

    Raises:
        ValueError: if athlete profile is missing, FTP < 100, or plan_start_date
                    is not a date object.
    """
    from app.models.athlete_profile import AthleteProfile  # local import to avoid circulars

    # ── 1. Resolve / validate plan_start_date ─────────────────────────────
    if plan_start_date is None:
        plan_start_date = _next_monday(date.today())
    elif not isinstance(plan_start_date, date):
        raise ValueError(f"plan_start_date must be a date object, got {type(plan_start_date)}")
    else:
        if plan_start_date.weekday() != 0:  # 0 = Monday
            original = plan_start_date
            plan_start_date = _next_monday(plan_start_date + timedelta(days=1))
            logger.warning(
                "plan_start_date %s is not a Monday; advancing to %s",
                original,
                plan_start_date,
            )

    # ── 2. Idempotency check ───────────────────────────────────────────────
    result = await db.execute(
        select(MesocyclePlan).where(
            MesocyclePlan.user_id == user_id,
            MesocyclePlan.plan_start_date == plan_start_date,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        logger.info(
            "Returning existing MesocyclePlan id=%d for user_id=%d start=%s",
            existing.id,
            user_id,
            plan_start_date,
        )
        return existing

    # ── 3. Load athlete profile ────────────────────────────────────────────
    profile_result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    athlete: AthleteProfile | None = profile_result.scalar_one_or_none()
    if athlete is None:
        raise ValueError(f"No AthleteProfile found for user_id={user_id}")

    # FTP guard — cycling primary only
    primary_sport = athlete.primary_sport or "cycling"
    ftp_w = athlete.ftp_watts or 0
    if primary_sport == "cycling" and ftp_w < 100:
        raise ValueError(
            f"Athlete ftp_watts={ftp_w} is below minimum 100 W for mesocycle generation. "
            "Update FTP in athlete profile before generating a plan."
        )

    # ── 4. Detect Friel phase ──────────────────────────────────────────────
    # Use target_event_date from first-class column (Phase 7.0-01)
    goal_date = athlete.target_event_date
    event_type = athlete.target_event_type

    # maintenance override: explicit maintenance type OR no goal date
    if event_type == "maintenance" or goal_date is None:
        phase: Phase = "maintenance"
    else:
        if not isinstance(goal_date, date):
            raise ValueError(f"target_event_date must be a date, got {type(goal_date)}")
        # Estimate CTL from an approximation (no live PMC at generation time)
        # Use a default CTL guess; if the caller has better data they can pass it.
        # For now we use 0.0 so detect_training_phase applies proximity-only logic
        # (CTL thresholds in base1/base2/build1/build2 boundaries).
        # TODO(7.1): pass actual CTL from daily_metrics aggregation.
        estimated_ctl = 40.0  # neutral default that routes to base2/build1 boundary
        phase = detect_training_phase(goal_date, estimated_ctl)

    # ── 5. Build Issurin 3:1 weekly TSS targets ───────────────────────────
    # Use athlete's CTL approximation for ramp calculation
    # Default CTL assumption: 40 TSS/day (~mid-fitness recreational athlete)
    ctl_for_ramp = 40.0

    tss_targets: list[int] = []
    prev_tss: int | None = None
    for week_idx in range(MESO_LENGTH_WEEKS):
        block_pos = issurin_block_for_week(week_idx)
        tss = weekly_tss_target(ctl_for_ramp, phase, block_pos)
        # Enforce Friel 8% cap week-over-week on build weeks
        if prev_tss is not None and block_pos != "recovery":
            cap = int(round(prev_tss * (1.0 + FRIEL_RAMP_CAP_PCT)))
            tss = min(tss, cap)
        tss_targets.append(tss)
        if block_pos != "recovery":
            prev_tss = tss

    # ── 6. Compute plan end date ────────────────────────────────────────────
    plan_end_date = plan_start_date + timedelta(weeks=MESO_LENGTH_WEEKS) - timedelta(days=1)

    # ── 7. Seiler distribution snapshot ────────────────────────────────────
    phase_mix = _PHASE_MIX[phase]
    seiler_dist = {
        "z1_pct": phase_mix["easy_ratio"],
        "z2_pct": 0.0,  # Z2 (tempo) is folded into easy for simplicity
        "z3_pct": phase_mix["hard_ratio"],
    }

    # ── 8. Evidence snapshot ────────────────────────────────────────────────
    days_to_goal = (goal_date - date.today()).days if goal_date else None
    evidence = {
        "ctl": ctl_for_ramp,
        "ftp_watts": ftp_w,
        "days_to_goal": days_to_goal,
        "plan_generated_at": date.today().isoformat(),
    }

    # ── 9. Create MesocyclePlan ─────────────────────────────────────────────
    meso = MesocyclePlan(
        user_id=user_id,
        plan_start_date=plan_start_date,
        plan_end_date=plan_end_date,
        phase=phase,
        block_index=0,  # current week position — starts at 0
        weekly_tss_targets=tss_targets,
        seiler_distribution=seiler_dist,
        target_event_date=goal_date,
        target_event_type=event_type,
        evidence=evidence,
    )
    db.add(meso)

    # ── 10. Build and insert 28 PlannedWorkout drafts ──────────────────────
    # Fetch existing PlannedWorkout dates for this user in the meso window
    # to implement conflict-skip (do not overwrite user-modified workouts).
    existing_dates_result = await db.execute(
        select(PlannedWorkout.date).where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date >= plan_start_date,
            PlannedWorkout.date <= plan_end_date,
        )
    )
    existing_workout_dates: set[date] = {row[0] for row in existing_dates_result.fetchall()}

    inserted_count = 0
    for week_idx in range(MESO_LENGTH_WEEKS):
        week_start = plan_start_date + timedelta(weeks=week_idx)
        block_pos = issurin_block_for_week(week_idx)
        week_tss = tss_targets[week_idx]

        drafts = build_week_drafts(
            athlete=athlete,
            week_start=week_start,
            phase=phase,
            weekly_tss_target_val=week_tss,
            block_position=block_pos,
            ftp_w=ftp_w if ftp_w >= 100 else 200,  # running fallback
        )

        for draft in drafts:
            if draft.date in existing_workout_dates:
                logger.debug(
                    "Skipping PlannedWorkout for user_id=%d date=%s — already exists",
                    user_id,
                    draft.date,
                )
                continue

            pw = PlannedWorkout(
                user_id=draft.user_id,
                date=draft.date,
                sport=draft.sport,
                title=draft.title,
                duration_seconds_target=draft.duration_seconds_target,
                interval_structure=draft.interval_structure,
                template_id=draft.template_id,
                blocks_source=draft.blocks_source,
            )
            db.add(pw)
            inserted_count += 1

    await db.flush()  # assign IDs before returning

    logger.info(
        "Generated MesocyclePlan for user_id=%d start=%s phase=%s inserted=%d workouts",
        user_id,
        plan_start_date,
        phase,
        inserted_count,
    )
    return meso
