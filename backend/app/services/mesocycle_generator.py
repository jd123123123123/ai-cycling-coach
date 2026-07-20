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
    default_target_ctl,
    detect_training_phase,
    mountain_event_template,
    pick_template,
    session_type_for_today,
)
from app.services.run_workout_templates import (
    RUN_TEMPLATES,
    RunTemplate,
    run_interval_structure,
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

# Mujika taper volume factors — in taper/race phases the weekly target is a
# straight volume CUT from CTL×7 (freshen, don't build); the Issurin block
# ramp does not apply. Race week is mostly openers.
_PHASE_VOLUME_FACTOR: dict[str, float] = {
    "taper": 0.60,
    "race": 0.45,
}

# Hard session session types
_HARD_TYPES: frozenset[SessionType] = frozenset({"sweet_spot", "threshold", "vo2", "tempo"})

# Default available minutes when we have no schedule signal at generation time
_DEFAULT_AVAILABLE_MINUTES = 90

# Endurance-day template rotation — cycled across the week's *filler* Z2 days so
# no two steady days are identical. Each entry occupies a different band inside
# Z2 (low 0.60 → upper 0.70 → progressive 0.60→0.72 → tempo-touch 0.65/0.76 →
# steady 0.65 → short 0.65) AND a different duration (100/75/90/75/90/60 min),
# so adjacent filler days differ in both intensity and shape — the week reads as
# textured aerobic base, not the same 0.65-FTP ride repeated. Still 100% aerobic
# (Seiler LIT): this is within-Z2 variety, not added quality. The Sunday long
# ride and any phase quality/climbing session are picked separately (longest-fit
# / phase rules), so this only varies the mid-week aerobic filler.
_ENDURANCE_VARIETY: list[str] = [
    "z2_endurance_low_100",         # low Z2, 100min — easy/long fat-burning
    "z2_endurance_upper_75",        # upper Z2, 75min — firm high-aerobic
    "z2_progressive_90",            # ramp 0.60→0.72, 90min
    "z2_endurance_tempo_touch_75",  # 0.65 base + 3× tempo touches, 75min
    "z2_endurance_90",              # steady 0.65, 90min
    "z2_endurance_60",              # steady 0.65, 60min
]

# How far past the weekly TSS target a filler endurance day may push before the
# builder trims it. Key sessions (Sunday long, phase quality, climbing) are
# never trimmed — only the aerobic filler absorbs the cap.
_FILLER_OVERSHOOT = 1.10          # keep a full filler day if it lands ≤ 110% of budget
_FILLER_RECOVERY_OVERSHOOT = 1.15  # else a recovery spin if it lands ≤ 115%

# ── Dual-sport: maintenance runs woven into the bike week ────────────────────
# When the athlete both rides and runs (secondary_sports includes 'running',
# or primary running + secondary cycling) the generated week interleaves 2
# easy maintenance runs (3 at weekly_hours >= 8) on bike-rest / bike-easy
# days. Long-run progression is deliberately NOT handled here — that is the
# run-program scheduler's domain (weeks API); when a RUN program is active we
# defer run scheduling to it entirely.
_RUN_EASY_TEMPLATE_ID = "run_easy_45"  # 45min Z2 — inside the 40-50min band
# Weekly quality-run rotation (build/peak only): strides ↔ tempo, alternating
# by calendar week so consecutive build weeks never repeat.
_RUN_QUALITY_TEMPLATE_IDS: tuple[str, str] = ("run_strides_8x20", "run_tempo_20")
_RUN_TSS_PER_MIN_EASY = 0.75      # conservative rTSS/min for a Z2 run
_RUN_TSS_PER_MIN_QUALITY = 1.1    # rTSS/min for a tempo/strides session
_RUN_QUALITY_PHASES: frozenset[str] = frozenset({"build1", "build2", "peak"})
_EASY_BIKE_TYPES: frozenset[str] = frozenset({"endurance", "recovery"})
_RUNS_PER_WEEK_DEFAULT = 2
_RUNS_PER_WEEK_HIGH_VOLUME = 3    # when weekly_hours_available >= 8h
_HIGH_VOLUME_HOURS = 8.0


def _rest_dows_for_week(
    phase: Phase,
    block_position: Literal["accumulation", "transmutation", "realization", "recovery"],
) -> set[int]:
    """Designate which day-of-week indices are scheduled rest days.

    Rest count is driven by ``_PHASE_MIX[phase]["rest_days"]`` (base1 → 2), +1 on
    a recovery week (mirrors ``weekly_intensity_quota``). Rest is placed
    deterministically on the least-disruptive days first — Monday (post-weekend),
    then Friday (pre-weekend) — while *protecting* the phase's key days so the
    cap/rest logic composes with, rather than overrides, the session picker:

        - Sunday (6)                 always protected — the long ride.
        - Saturday (5)               protected in base/build/peak — 2nd weekend day.
        - Wednesday (2)              protected in base2/build/peak — keystone quality.
        - Tuesday (1) / Thursday (3) protected in build2/peak — the two quality days.

    Taper and race manage their own rest/quality cadence inside
    ``session_type_for_today`` (Mujika sharpening, race-week opener), so we return
    an empty set for them and leave that untouched.
    """
    if phase in ("taper", "race"):
        return set()

    n_rest = int(round(_PHASE_MIX[phase]["rest_days"]))
    if block_position == "recovery":
        n_rest = min(6, n_rest + 1)

    protected: set[int] = {6}  # Sunday long ride is sacred
    if phase in ("base1", "base2", "build1", "build2", "peak"):
        protected.add(5)  # Saturday — second weekend endurance day
    if phase in ("base2", "build1", "build2", "peak"):
        protected.add(2)  # Wednesday keystone quality
    if phase in ("build2", "peak"):
        protected.update({1, 3})  # Tue/Thu quality days

    # Priority: rest Monday first, then Friday, then mid/late-week fillers,
    # never a protected key day.
    priority = [0, 4, 3, 1, 2, 5]
    rest: set[int] = set()
    for d in priority:
        if len(rest) >= n_rest:
            break
        if d in protected:
            continue
        rest.add(d)
    return rest


# ──────────────────────────────────────────────────────────────────────────────
#  Exported helper functions
# ──────────────────────────────────────────────────────────────────────────────

def template_tss_estimate(
    template_id: str | None,
    duration_seconds: int | None = None,
) -> float | None:
    """Best-effort planned TSS for ANY template id — bike, run or unknown.

    The single producer every planned-TSS consumer (weeks payload, weekly
    recap, recovery ETA, race-day simulation) must go through, so run and
    strength rows are never silently dropped from weekly totals (usability
    audit P0-5, the 294-vs-284 gap).

        1. Bike template     → its designed base_tss.
        2. Run template      → duration × 1.1 TSS/min for quality categories
                               (tempo/threshold/vo2), × 0.75 TSS/min otherwise
                               (same constants the dual-sport planner uses).
        3. Unknown id with a → duration × 0.75 TSS/min (conservative aerobic
           planned duration     estimate — covers strength/custom sessions).
        4. Nothing usable    → None (never a fabricated number).
    """
    if template_id:
        tmpl = TEMPLATES.get(template_id)
        if tmpl is not None:
            return float(tmpl.base_tss)
        run_tmpl = RUN_TEMPLATES.get(template_id)
        if run_tmpl is not None:
            quality = run_tmpl.category in ("tempo", "threshold", "vo2")
            per_min = _RUN_TSS_PER_MIN_QUALITY if quality else _RUN_TSS_PER_MIN_EASY
            return (run_tmpl.duration_s / 60.0) * per_min
    if duration_seconds and duration_seconds > 0:
        return (duration_seconds / 60.0) * _RUN_TSS_PER_MIN_EASY
    return None


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


async def current_block_position(
    db: AsyncSession,
    user_id: int,
    today: date | None = None,
) -> str | None:
    """Return the Issurin block position the athlete is in *today*.

    Finds the most recent generated mesocycle plan that brackets ``today`` and
    maps the day onto its 4-week structure (week 3 → 'recovery'). Returns None
    when there's no active plan, so callers fall back to the loading default.
    Lets the live coach brief deload on a break week, not just the plan.
    """
    if today is None:
        today = date.today()
    row = (
        await db.execute(
            select(MesocyclePlan)
            .where(
                MesocyclePlan.user_id == user_id,
                MesocyclePlan.plan_start_date <= today,
                MesocyclePlan.plan_end_date >= today,
            )
            .order_by(MesocyclePlan.plan_start_date.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    week_index = max(0, min((today - row.plan_start_date).days // 7, 3))
    return issurin_block_for_week(week_index)


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

    TAPER/RACE phases override the block ramp with a Mujika volume cut
    (60% / 45% of CTL×7) — you freshen into a race, you don't keep ramping.
    This is also what makes the race-day forward simulation taper naturally.

    Args:
        ctl:            Athlete's current CTL (stress/day average).
        phase:          Friel training phase (taper/race cut volume).
        block_position: Issurin block ('accumulation', 'transmutation',
                        'realization', 'recovery').

    Returns:
        Integer weekly TSS.
    """
    base_tss = ctl * 7.0

    phase_factor = _PHASE_VOLUME_FACTOR.get(phase)
    if phase_factor is not None:
        return int(round(base_tss * phase_factor))

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


# ──────────────────────────────────────────────────────────────────────────────
#  Dual-sport helpers (bike week + interleaved maintenance runs)
# ──────────────────────────────────────────────────────────────────────────────

def _dual_sport_running(athlete: "AthleteProfile") -> bool:
    """True when the athlete both rides and runs.

    Either direction counts: primary cycling with 'running' in
    secondary_sports, or primary running with 'cycling' in secondary_sports.
    """
    primary = (athlete.primary_sport or "cycling").lower()
    secondary = {
        str(s).lower() for s in (getattr(athlete, "secondary_sports", None) or [])
    }
    return (primary == "cycling" and "running" in secondary) or (
        primary == "running" and "cycling" in secondary
    )


def _run_tss_estimate(template: RunTemplate, quality: bool) -> float:
    """Deterministic rTSS estimate for a maintenance run.

    duration_min × 0.75 for easy runs, × 1.1 for the weekly quality run
    (tempo/strides). Counted against the week's TSS budget so the bike
    filler trimming respects the shared load target.
    """
    per_min = _RUN_TSS_PER_MIN_QUALITY if quality else _RUN_TSS_PER_MIN_EASY
    return (template.duration_s / 60.0) * per_min


def _plan_week_runs(
    plan: list[dict],
    phase: Phase,
    block_position: str,
    weekly_hours: float,
    week_start: date,
) -> list[dict]:
    """Place this week's maintenance runs around the bike skeleton.

    Deterministic placement over the 7 pass-1 bike entries. Invariants:

      - Runs land ONLY on bike-rest or bike-easy (endurance/recovery) days.
      - Never on, the day before, OR the day after the hardest bike day
        (highest planned base_tss; earliest day wins ties).
      - At least ONE full rest day survives run-free (when the bike week has
        scheduled rest at all).
      - The single weekly quality run (build/peak phases, never on a recovery
        week) is only placed on a day with no hard bike session within ±24h —
        no two hard sessions across sports back-to-back. If no day qualifies,
        every run stays easy.
      - Target count: 2 runs/week, 3 when weekly_hours >= 8. Fewer when the
        invariants leave fewer candidate days — constraints always win.

    Returns a list of {"dow", "template", "quality", "tss"} dicts sorted by
    day-of-week. Empty list when nothing can be placed.
    """
    n_runs = (
        _RUNS_PER_WEEK_HIGH_VOLUME
        if weekly_hours >= _HIGH_VOLUME_HOURS
        else _RUNS_PER_WEEK_DEFAULT
    )

    ridden = [
        (float(e["template"].base_tss), i)
        for i, e in enumerate(plan)
        if e["session_type"] != "rest"
    ]
    if not ridden:
        return []
    # Hardest bike day = max planned TSS; ties break to the earliest day.
    hardest_dow = max(ridden, key=lambda t: (t[0], -t[1]))[1]
    blocked = {hardest_dow - 1, hardest_dow, hardest_dow + 1}
    hard_bike_dows = {
        i for i, e in enumerate(plan) if e["session_type"] in _HARD_TYPES
    }

    rest_dows = [i for i, e in enumerate(plan) if e["session_type"] == "rest"]
    easy_dows = [
        i for i, e in enumerate(plan) if e["session_type"] in _EASY_BIKE_TYPES
    ]

    # One full rest day must survive with no run on it. Prefer to "protect" a
    # rest day that is already excluded by the hardest-day adjacency rule so
    # we don't burn an otherwise-usable candidate.
    protected_rest: int | None = None
    if rest_dows:
        pre_blocked = [d for d in rest_dows if d in blocked]
        protected_rest = pre_blocked[0] if pre_blocked else rest_dows[0]

    rest_candidates = [
        d for d in rest_dows if d not in blocked and d != protected_rest
    ]
    easy_candidates = [d for d in easy_dows if d not in blocked]
    # Rest days first (clean single-session days), then easy-ride days.
    chosen = (rest_candidates + easy_candidates)[:n_runs]
    if not chosen:
        return []

    # Weekly quality run — build/peak only, never on the deload week, and
    # never within 24h of a hard bike session (cross-sport hard-hard guard).
    quality_dow: int | None = None
    if phase in _RUN_QUALITY_PHASES and block_position != "recovery":
        for d in sorted(chosen):
            if not ({d - 1, d, d + 1} & hard_bike_dows):
                quality_dow = d
                break

    week_ord = week_start.toordinal() // 7
    quality_template = RUN_TEMPLATES[_RUN_QUALITY_TEMPLATE_IDS[week_ord % 2]]
    easy_template = RUN_TEMPLATES[_RUN_EASY_TEMPLATE_ID]

    entries: list[dict] = []
    for d in sorted(chosen):
        quality = d == quality_dow
        template = quality_template if quality else easy_template
        entries.append({
            "dow": d,
            "template": template,
            "quality": quality,
            "tss": _run_tss_estimate(template, quality),
        })
    return entries


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

    Dual-sport athletes (secondary_sports includes 'running', or primary
    running + secondary cycling) additionally get 2-3 maintenance runs
    (sport='running') interleaved on bike-rest / bike-easy days — see
    _plan_week_runs for the placement invariants. Their rTSS estimate is
    deducted from the filler budget so the combined week respects the target.
    Cycling-only athletes get the exact same 7 drafts as before.

    Args:
        athlete:              AthleteProfile ORM object (needs ftp_watts, primary_sport).
        week_start:           Date of Monday (week[0]).
        phase:                Friel phase for this meso.
        weekly_tss_target_val: TSS budget for the week (from weekly_tss_target()).
        block_position:       Issurin block position within the meso.
        ftp_w:                Athlete FTP in watts.

    Returns:
        List of 7 bike PlannedWorkoutDraft objects (Mon..Sun) — plus the
        week's run drafts for dual-sport athletes — NOT persisted.
    """
    sport = athlete.primary_sport or "cycling"
    # Weekly-intensity philosophy from onboarding (goals JSON) biases the
    # quality-day picks so the generated week reflects 80/20 vs sweet-spot.
    training_model = (getattr(athlete, "goals", None) or {}).get("training_model")
    drafts: list[PlannedWorkoutDraft] = []

    # Synthetic TSB for generation — no readiness signals at plan time
    # Use a neutral TSB of 0 (no freshness / fatigue signal)
    synthetic_tsb = 0.0

    # ── Named builder program (FTP / VO₂max / 200k) ───────────────────────
    # When the athlete picked a program, its weekly skeleton OWNS the week
    # shape: session types, rotating template variants, and rest days. The
    # TSS budgeting / trimming machinery below still applies unchanged.
    from app.services.program_builder import active_program, program_day, program_week_index

    prog = active_program(getattr(athlete, "goals", None))
    prog_id = prog[0] if prog else None
    prog_week = program_week_index(prog[1], week_start) if prog else 0

    # ── Dual-sport gate ───────────────────────────────────────────────────
    # Athlete rides AND runs → weave 2-3 maintenance runs into the bike week
    # (pass 1.5 below). When a RUN program is active the weeks-API run
    # scheduler owns the run days — we defer entirely so runs are never
    # double-planned. Cycling-only athletes take none of these branches.
    dual_running = (
        _dual_sport_running(athlete)
        and active_program(getattr(athlete, "goals", None), sport="run") is None
    )
    if dual_running:
        # Bike skeleton rows are cycling; run rows carry sport='running'.
        # (Matters for the primary-running + secondary-cycling direction.)
        sport = "cycling"

    # ── Rest-day skeleton ─────────────────────────────────────────────────
    # Real rest days are placed deterministically from the phase's rest_days
    # count (base1 → 2). At generation time we have no load history, so the
    # picker's history-based Monday-rest rule can never fire — we own the week
    # shape here instead.  On a rest DOW we emit the rest_day template (tss 0)
    # rather than yet another Z2 session.
    rest_dows = _rest_dows_for_week(phase, block_position)

    # Riding days drive a realistic per-day time window (weekly hours spread
    # over the days we actually ride, not all 7), so variety templates fit.
    weekly_hours = athlete.weekly_hours_available or 10.0
    riding_days = max(1, 7 - len(rest_dows))
    base_available_min = max(30, int(weekly_hours * 60 / riding_days))

    # ── Pass 1: resolve session type + template for each riding day ────────
    hard_sessions_done = 0
    vo2_sessions_done = 0
    cumulative_tss = 0.0
    variety_idx = 0

    # Per-day plan entries: dict with date/session_type/template/flags.
    plan: list[dict] = []

    for dow in range(7):  # 0=Mon, 6=Sun
        day_date = week_start + timedelta(days=dow)

        # Program week shape (when a builder program is active) — the program
        # decides rest days, session type, and the rotating template variant.
        if prog_id is not None:
            pd = program_day(prog_id, prog_week, dow, block_position == "recovery")
            if pd == "REST":
                plan.append({
                    "date": day_date, "session_type": "rest",
                    "template": TEMPLATES["rest_day"], "kind": "rest",
                })
                continue
            assert not isinstance(pd, str)
            available_min = base_available_min if dow != 5 else max(base_available_min, 150)
            template = pick_template(
                pd.session_type, ftp_w, available_min,
                preferred_template_id=pd.template_id,
                rotation_key=day_date.toordinal(),
            )
            if pd.session_type in ("vo2", "threshold", "sweet_spot", "tempo"):
                hard_sessions_done += 1
                if pd.session_type == "vo2":
                    vo2_sessions_done += 1
            kind = "fixed" if pd.fixed else "filler"
            cumulative_tss += float(template.base_tss)
            plan.append({
                "date": day_date, "session_type": pd.session_type,
                "template": template, "kind": kind,
            })
            continue

        # Scheduled rest — skip the picker entirely so we never spend load or
        # advance the quality counters on a rest day.
        if dow in rest_dows:
            plan.append({
                "date": day_date,
                "session_type": "rest",
                "template": TEMPLATES["rest_day"],
                "kind": "rest",
            })
            continue

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
            training_model=training_model,
            is_recovery_week=(block_position == "recovery"),
        )

        available_min = base_available_min
        # For long ride (Sunday) or key sessions: use a longer window
        if dow == 6:  # Sunday long ride
            available_min = max(available_min, 120)
        elif session_type in _HARD_TYPES and dow == 2:  # Wed key session
            available_min = max(available_min, 75)

        # Mountain-event specificity — route quality days (and the Saturday
        # long ride) to climbing / low-cadence variants when the athlete
        # targets a fondo / hilly race inside the specificity window.
        preferred_id = None
        if athlete.target_event_date is not None:
            preferred_id = mountain_event_template(
                session_type=session_type,
                event_type=athlete.target_event_type,
                days_to_event=(athlete.target_event_date - day_date).days,
                day_of_week=dow,
            )

        # Variety: rotate the mid-week aerobic *filler* among distinct Z2
        # templates so the week isn't the identical ride 6×. The Sunday long
        # ride (longest-fit) and any climbing-preferred day keep their own
        # pick and are exempt from the rotation.
        is_filler = (
            session_type == "endurance" and dow != 6 and preferred_id is None
        )
        if is_filler:
            preferred_id = _ENDURANCE_VARIETY[variety_idx % len(_ENDURANCE_VARIETY)]
            variety_idx += 1

        template = pick_template(
            session_type, ftp_w, available_min, preferred_template_id=preferred_id,
            # Deterministic anti-monotony: rotate quality/endurance variants by
            # calendar day so consecutive weeks never repeat the same picks.
            rotation_key=day_date.toordinal(),
        )

        # Classify the day: filler endurance can be trimmed to hit the weekly
        # TSS target; everything else (Sunday long, quality, climbing, recovery)
        # is a fixed session we reserve budget for and never trim.
        kind = "filler" if is_filler else "fixed"
        plan.append({
            "date": day_date,
            "session_type": session_type,
            "template": template,
            "kind": kind,
        })

        # Advance synthetic weekly counters (rest days already skipped above).
        if session_type in _HARD_TYPES:
            hard_sessions_done += 1
        if session_type == "vo2":
            vo2_sessions_done += 1
        cumulative_tss += template.base_tss

    # ── Pass 1.5: dual-sport run interleave ───────────────────────────────
    # Place the week's maintenance runs around the bike skeleton. Their TSS
    # estimate joins the reserved budget below, so the bike filler trimming
    # still lands the COMBINED week near the weekly target.
    run_entries: list[dict] = []
    if dual_running:
        run_entries = _plan_week_runs(
            plan, phase, block_position, weekly_hours, week_start
        )
    run_tss_total = sum(e["tss"] for e in run_entries)

    # ── Pass 2: cap the week to the TSS target by trimming filler ─────────
    # Reserve the budget consumed by fixed sessions (long ride + quality +
    # recovery) plus any interleaved runs. Whatever is left is the filler
    # budget; once a full filler day would push the running filler total well
    # past that budget, downgrade it to a recovery spin or a rest day so the
    # week lands near target instead of ~2× it. Key sessions are never touched.
    reserved = sum(
        e["template"].base_tss for e in plan if e["kind"] == "fixed"
    )
    filler_budget = max(0.0, float(weekly_tss_target_val) - reserved - run_tss_total)
    filler_running = 0.0

    for e in plan:
        template = e["template"]
        if e["kind"] == "filler":
            tss = template.base_tss
            if filler_running + tss <= filler_budget * _FILLER_OVERSHOOT:
                filler_running += tss
            else:
                rec = TEMPLATES["recovery_60"]
                if filler_running + rec.base_tss <= filler_budget * _FILLER_RECOVERY_OVERSHOOT:
                    template = rec
                    filler_running += rec.base_tss
                else:
                    template = TEMPLATES["rest_day"]

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
        duration_s = sum(blk.duration_s for blk in template.blocks)
        drafts.append(PlannedWorkoutDraft(
            user_id=athlete.user_id,
            date=e["date"],
            sport=sport,
            title=template.name,
            duration_seconds_target=duration_s,
            interval_structure={"intervals": intervals},
            template_id=template.id,
            blocks_source="ai_prescribed",
        ))

    # ── Append the interleaved run sessions (sport='running') ─────────────
    for entry in run_entries:
        run_template: RunTemplate = entry["template"]
        drafts.append(PlannedWorkoutDraft(
            user_id=athlete.user_id,
            date=week_start + timedelta(days=entry["dow"]),
            sport="running",
            title=run_template.name,
            duration_seconds_target=run_template.duration_s,
            interval_structure=run_interval_structure(run_template),
            template_id=run_template.id,
            blocks_source="ai_prescribed",
        ))

    return drafts


# ──────────────────────────────────────────────────────────────────────────────
#  Public generator
# ──────────────────────────────────────────────────────────────────────────────

def _next_monday(from_date: date | None = None) -> date:
    """Return the next Monday on or after from_date (defaults to today)."""
    d = from_date if from_date is not None else date.today()
    days_ahead = (0 - d.weekday()) % 7  # Monday = 0
    return d + timedelta(days=days_ahead)


async def generate_mesocycle(
    db: AsyncSession,
    user_id: int,
    plan_start_date: date | None = None,
    current_ctl: float | None = None,
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
        # Use the caller-supplied live CTL when available; else a neutral default
        # that routes to the base2/build1 boundary on proximity alone.
        effective_ctl = current_ctl if current_ctl is not None else 40.0
        # Race-ready CTL target (from goals or event type + priority) feeds the
        # under-built taper override — we don't taper fitness the athlete never
        # built. Only meaningful when we have a live CTL to compare against.
        target_ctl = None
        if current_ctl is not None:
            goals_dict = getattr(athlete, "goals", None) or {}
            raw_target = goals_dict.get("target_ctl") if isinstance(goals_dict, dict) else None
            if isinstance(raw_target, (int, float)):
                target_ctl = float(raw_target)
            else:
                target_ctl = default_target_ctl(
                    event_type, getattr(athlete, "target_priority", None)
                )
        phase = detect_training_phase(goal_date, effective_ctl, target_ctl=target_ctl)

    # ── 5. Build Issurin 3:1 weekly TSS targets ───────────────────────────
    # Anchor the ramp to the athlete's LIVE CTL when the caller supplied it
    # (weeks API always does). The old hardcoded 40.0 prescribed ~296 TSS/wk
    # to a CTL-33 athlete (usability audit P0-4). Fall back to 40 TSS/day
    # (~mid-fitness recreational) only when no live CTL is available.
    ctl_for_ramp = float(current_ctl) if current_ctl is not None else 40.0

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
