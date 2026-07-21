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
from app.services.workout_templates import TEMPLATES, pick_trim_variant

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
    "z2_endurance_surges_75",       # 0.65 base + 6 playful 15s surges, 75min
    "z2_endurance_tempo_touch_75",  # 0.65 base + 3× tempo touches, 75min
    "z2_endurance_90",              # steady 0.65, 90min
    "z2_endurance_60",              # steady 0.65, 60min
]

# ── variety_dial consumption (review finding: dial had NO consumer) ──────────
# The dial shifts the deterministic rotations so the SAME calendar week
# rebuilds to a visibly different plan when the athlete says "too boring"
# (None→mixed→adventurous). 'adventurous' additionally widens the filler pool
# with the playful/alternative Z2 formats (MAF, fasted ride) so the week's
# character changes, not just its ordering.
_VARIETY_DIAL_SHIFT: dict[str | None, int] = {
    None: 0, "steady": 0, "mixed": 3, "adventurous": 5,
}
# 'mixed' keeps the standard rotation but swaps the plain 60-min ride for the
# fasted 60-min alternate, so even a tightly time-boxed athlete (60-min
# windows, where only one 60-min template fits) sees a different texture after
# the too_boring bump.
_ENDURANCE_VARIETY_MIXED: list[str] = [
    tid if tid != "z2_endurance_60" else "z2_fasted_60"
    for tid in _ENDURANCE_VARIETY
]
_ENDURANCE_VARIETY_ADVENTUROUS: list[str] = [
    "z2_endurance_surges_75",       # playful surges open the adventurous week
    "z2_progressive_90",
    "maf_aerobic_90",               # HR-capped MAF alternative format
    "z2_endurance_tempo_touch_75",
    "z2_fasted_60",                 # fasted-metabolism alternative format
    "z2_endurance_upper_75",
    "z2_endurance_low_100",
]

# Recovery-week easy rotation (review NEW-4: 'Lockeres Ausfahren — 60 min' ×4).
# On the deload week every downgraded quality slot and aerobic filler draws
# from this pool so the week reads as varied easy riding, not the same spin
# repeated. STRICTLY easy variants only — no surges, no tempo touches: low/
# steady Z2, HR-capped MAF, the sub-LT1 fast-pedal skill drill, recovery spins.
_RECOVERY_WEEK_VARIETY: list[str] = [
    "recovery_60",
    "z2_endurance_60",
    "cadence_high_fsr_6x3",
    "z2_endurance_low_100",
    "maf_aerobic_90",
    "recovery_30",
]

# Recovery-SPIN dedupe ladder for the budget-trim cascade — tried in order,
# preferring a variant the week doesn't already contain (same easy intent,
# different flavor) before repeating a title.
_RECOVERY_SPIN_LADDER: tuple[str, ...] = (
    "recovery_60", "cadence_high_fsr_6x3", "recovery_30",
)

# Weekday keys shared with the profile's days_available / hard_day_blackouts
# JSON (Monday-first, matching date.weekday()).
_WEEKDAY_KEYS: tuple[str, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

# Hard ceiling on the week's total planned DURATION vs the athlete's declared
# hours (review finding: 2 h/Woche in → 3 h 10 out). Small tolerance so a
# 2h athlete can still get a coherent 2h05 week, never a 160% week.
_WEEK_HOURS_TOLERANCE = 1.05

# How far past the weekly TSS target a filler endurance day may push before the
# builder trims it. Key sessions (Sunday long, phase quality, climbing) are
# never trimmed — only the aerobic filler absorbs the cap.
_FILLER_OVERSHOOT = 1.10          # keep a full filler day if it lands ≤ 110% of budget
_FILLER_RECOVERY_OVERSHOOT = 1.15  # else a recovery spin if it lands ≤ 115%

# ── Declared-hours budget blend (plan-engine v2, Z2-degeneration cause 1) ────
# The weekly TSS budget is no longer CTL×7 alone: an athlete who declares 12
# h/wk must not receive a ~5h plan just because their CTL history is thin.
# hours-implied load = weekly_hours × (typical_IF² × 100) TSS/h — at the
# mostly-aerobic weekly IF ≈ 0.68 that is ~46 TSS per declared hour. When the
# hours-implied load exceeds the CTL-safe anchor, the budget starts at a
# meaningful fraction of the declared availability (floor) but never more
# than 50% above the CTL anchor in one jump; the Friel 8% week-over-week cap
# then closes the remaining gap progressively. When declared hours imply LESS
# than the CTL anchor, time is the binding constraint and simply caps the plan.
_TYPICAL_WEEK_IF = 0.68
_TSS_PER_DECLARED_HOUR = round(_TYPICAL_WEEK_IF ** 2 * 100, 1)  # ≈ 46.2
_HOURS_FLOOR_FRACTION = 0.65   # start at ≥65% of the hours-implied load …
_MAX_BUDGET_LIFT = 1.5         # … but never jump >50% above the CTL anchor

# ── Day-type-aware time windows (Z2-degeneration cause 3) ────────────────────
# The flat weekly_hours/riding_days window locked every template ≥150 min out
# of the plan forever. The LONG day now gets its own window: ~45% of declared
# weekly hours (a 12h athlete's Sunday can be a real 3-4h ride), additionally
# capped so the long ride doesn't swallow more than ~45% of the week's TSS
# budget. Weekday windows keep the existing spread.
_LONG_DAY_HOURS_SHARE = 0.45
_LONG_DAY_TSS_SHARE = 0.45
_Z2_TSS_PER_MIN_PLAN = 0.75    # planning-grade Z2 TSS/min (matches run est.)

# Foster monotony ceiling for the PLANNED week (mean daily TSS / SD). Above
# 2.0 the week reads "every day alike" — the guard swaps the smallest filler
# to rest so hard days stay hard and easy days stay genuinely easy.
_MONOTONY_LIMIT = 2.0

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


def _pick_variety_filler(
    pool: list[str],
    idx: int,
    ftp_w: int,
    available_min: int,
    exclude: set[str] | None = None,
) -> str:
    """First pool entry (scanning from the rotation index) that fits the day's
    time window + FTP gate. ``exclude`` (recovery-week dedupe, review NEW-4)
    skips template ids the week already contains — relaxed on a second pass
    when nothing unused fits. Falls back to the raw rotation entry (the picker
    then resolves best-fit) when nothing in the pool fits at all."""
    n = len(pool)
    for pass_exclude in (exclude, None) if exclude else (None,):
        for off in range(n):
            tid = pool[(idx + off) % n]
            t = TEMPLATES.get(tid)
            if t is None:
                continue
            if pass_exclude and tid in pass_exclude:
                continue
            if t.min_ftp_required is not None and (not ftp_w or ftp_w < t.min_ftp_required):
                continue
            if sum(b.duration_s for b in t.blocks) / 60.0 <= max(1, available_min):
                return tid
    return pool[idx % n]


def _athlete_availability(athlete) -> tuple[set[int], int, set[int]]:
    """Parse the profile's days_available / hard_day_blackouts JSON.

    Returns ``(available_dows, long_dow, blackout_dows)``:
      - available_dows: day-of-week indices (Mon=0) the athlete can train.
        Defaults to all 7 when the profile has no days_available.
      - long_dow: the athlete's long-ride day. Their explicit long_day when
        set and available; else Sunday, else Saturday, else the last
        available day.
      - blackout_dows: days on which HARD sessions must never land.
    """
    available: set[int] = set(range(7))
    raw = getattr(athlete, "days_available", None)
    if isinstance(raw, dict):
        parsed = {
            i for i, key in enumerate(_WEEKDAY_KEYS) if bool(raw.get(key, True))
        }
        if parsed:  # an all-false dict would make the week impossible — ignore
            available = parsed

    long_dow = 6
    if isinstance(raw, dict):
        ld = raw.get("long_day")
        if isinstance(ld, str) and ld in _WEEKDAY_KEYS:
            long_dow = _WEEKDAY_KEYS.index(ld)
    if long_dow not in available:
        if 6 in available:
            long_dow = 6
        elif 5 in available:
            long_dow = 5
        else:
            long_dow = max(available)

    blackouts: set[int] = set()
    raw_blackouts = getattr(athlete, "hard_day_blackouts", None)
    if isinstance(raw_blackouts, (list, tuple)):
        blackouts = {
            _WEEKDAY_KEYS.index(d) for d in raw_blackouts if d in _WEEKDAY_KEYS
        }
    return available, long_dow, blackouts


def _rest_dows_for_week(
    phase: Phase,
    block_position: Literal["accumulation", "transmutation", "realization", "recovery"],
    available: set[int] | None = None,
    long_dow: int = 6,
) -> set[int]:
    """Designate which day-of-week indices are scheduled rest days.

    Rest count is driven by ``_PHASE_MIX[phase]["rest_days"]`` (base1 → 2), +1 on
    a recovery week (mirrors ``weekly_intensity_quota``). Days the athlete marked
    UNAVAILABLE in days_available are always rest — the plan must never schedule
    a session on a day the athlete said they cannot train (review finding:
    Di/Do/Fr/Sa/So selected, plan trained Mittwoch and rested Freitag/Samstag).
    Additional rest (when the phase wants more than the unavailable days supply)
    is placed deterministically on the least-disruptive AVAILABLE days first,
    while *protecting* the phase's key days:

        - the long-ride day (athlete's long_day, default Sunday)  always
        - the available day before the long day                   base/build/peak
        - a keystone quality day (Wed when available)             base2/build/peak
        - two more quality days                                   build2/peak

    Taper and race manage their own rest/quality cadence inside
    ``session_type_for_today`` — for them only the unavailable days are forced
    to rest.
    """
    if available is None:
        available = set(range(7))
    unavailable = set(range(7)) - available

    if phase in ("taper", "race"):
        return set(unavailable)

    n_rest = int(round(_PHASE_MIX[phase]["rest_days"]))
    if block_position == "recovery":
        n_rest = min(6, n_rest + 1)
    n_rest = max(n_rest, len(unavailable))

    rest: set[int] = set(unavailable)
    if len(rest) >= n_rest:
        return rest

    protected: set[int] = {long_dow}

    def _prev_available(d: int) -> int | None:
        for step in range(1, 7):
            c = (d - step) % 7
            if c in available and c not in protected:
                return c
        return None

    if phase in ("base1", "base2", "build1", "build2", "peak"):
        second = _prev_available(long_dow)  # 2nd weekend/endurance day
        if second is not None:
            protected.add(second)
    if phase in ("base2", "build1", "build2", "peak"):
        for cand in (2, 1, 3, 0, 4, 5, 6):  # keystone quality — Wed preferred
            if cand in available and cand not in protected:
                protected.add(cand)
                break
    if phase in ("build2", "peak"):
        added = 0
        for cand in (1, 3, 0, 4, 2, 5, 6):  # Tue/Thu quality days preferred
            if cand in available and cand not in protected:
                protected.add(cand)
                added += 1
                if added >= 2:
                    break

    # Priority: rest Monday first, then Friday, then mid/late-week fillers,
    # never a protected key day (unless nothing else is left).
    priority = [0, 4, 3, 1, 2, 5, 6]
    for d in priority:
        if len(rest) >= n_rest:
            break
        if d not in available or d in protected or d in rest:
            continue
        rest.add(d)
    if len(rest) < n_rest:  # small availability — take protected, long day last
        for d in priority:
            if len(rest) >= n_rest:
                break
            if d in available and d != long_dow and d not in rest:
                rest.add(d)
    return rest


# Canonical "virtual" weekday roles handed to the phase logic, by how many
# non-long training days the week has. The k-th training day AFTER the long
# ride (cyclic order) receives the k-th slot, so the phase-protection /
# quality-day rules keep composing while the ACTUAL days follow the athlete's
# availability. With all 7 days available this is the identity mapping.
#   0=Mon-ish endurance opener · 1/3=Tue/Thu quality · 2=Wed keystone ·
#   4=Fri recovery · 5=Sat second-weekend/tempo-touch · 6=long ride
_VIRTUAL_SLOTS: dict[int, list[int]] = {
    0: [],
    1: [2],
    2: [2, 5],
    3: [1, 2, 5],       # canonical recovery-week pattern (rest Mon/Thu/Fri)
    4: [1, 2, 3, 5],    # canonical base/build week (rest Mon/Fri) → identity
    5: [1, 2, 3, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
}
_QUALITY_VIRTUAL_DOWS: frozenset[int] = frozenset({1, 2, 3})


def _assign_virtual_dows(
    training_dows: list[int],
    long_dow: int,
    blackout_dows: set[int],
) -> dict[int, int]:
    """Map actual training days → canonical weekday roles (see _VIRTUAL_SLOTS).

    Blackout fix-up: when a quality role lands on a hard-day-blackout day it is
    swapped with a non-blackout training day holding an easy role, so the
    athlete's hard sessions move rather than vanish. (The generator's pick loop
    additionally enforces the blackout as a hard guarantee.)
    """
    others = sorted(
        (d for d in training_dows if d != long_dow),
        key=lambda d: (d - long_dow - 1) % 7,
    )
    slots = _VIRTUAL_SLOTS.get(len(others), [0, 1, 2, 3, 4, 5])[: len(others)]
    mapping: dict[int, int] = dict(zip(others, slots))
    for day in list(mapping):
        if mapping[day] in _QUALITY_VIRTUAL_DOWS and day in blackout_dows:
            for other_day in mapping:
                if (
                    other_day not in blackout_dows
                    and mapping[other_day] not in _QUALITY_VIRTUAL_DOWS
                ):
                    mapping[day], mapping[other_day] = mapping[other_day], mapping[day]
                    break
    mapping[long_dow] = 6
    return mapping


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


def hours_implied_tss(weekly_hours: float) -> float:
    """Weekly TSS the athlete's declared availability implies at typical IF.

    ~46 TSS per declared hour (IF ≈ 0.68, a realistic blended aerobic-week
    intensity). The transparency payload shows this next to the CTL anchor.
    """
    return float(weekly_hours) * _TSS_PER_DECLARED_HOUR


def _blend_weekly_anchor(ctl_weekly: float, weekly_hours: float | None) -> float:
    """Blend the CTL-safe anchor with the declared-hours load (cause-1 fix).

    - No declared hours → pure CTL anchor (backward compatible).
    - Declared hours imply LESS than the CTL anchor → time is the binding
      constraint; the plan is capped at what the athlete can actually ride.
    - Declared hours imply MORE → lift the anchor toward the hours-implied
      load: at least the CTL anchor, at most min(65% of the hours-implied
      load, 1.5× the CTL anchor). The Friel 8% week-over-week cap then keeps
      closing the remaining gap each subsequent week/meso as CTL rises.
    """
    if weekly_hours is None or weekly_hours <= 0:
        return ctl_weekly
    implied = hours_implied_tss(weekly_hours)
    if implied <= ctl_weekly:
        return implied
    floor = implied * _HOURS_FLOOR_FRACTION
    return min(max(ctl_weekly, floor), ctl_weekly * _MAX_BUDGET_LIFT)


def weekly_tss_target(
    ctl: float,
    phase: Phase,
    block_position: Literal["accumulation", "transmutation", "realization", "recovery"],
    weekly_hours: float | None = None,
) -> int:
    """Compute weekly TSS target for one Issurin block position.

    Formula: blended anchor × ramp_factor, capped at Friel 8% rule, where the
    anchor blends CTL×7 with the athlete's declared weekly hours (see
    ``_blend_weekly_anchor`` — a 12h athlete no longer gets a 5h plan just
    because CTL history is thin, and a time-poor athlete is no longer asked
    for more hours than they declared).

    The 8% cap prevents week-over-week TSS from increasing by more than
    FRIEL_RAMP_CAP_PCT over the previous build week.  For recovery weeks
    the cap is irrelevant (we always drop to 65%).

    TAPER/RACE phases override the block ramp with a Mujika volume cut
    (60% / 45% of the anchor) — you freshen into a race, you don't keep
    ramping. This is also what makes the race-day forward simulation taper
    naturally.

    Args:
        ctl:            Athlete's current CTL (stress/day average).
        phase:          Friel training phase (taper/race cut volume).
        block_position: Issurin block ('accumulation', 'transmutation',
                        'realization', 'recovery').
        weekly_hours:   Athlete-declared weekly availability (None → pure
                        CTL anchor, the pre-v2 behaviour).

    Returns:
        Integer weekly TSS.
    """
    base_tss = _blend_weekly_anchor(ctl * 7.0, weekly_hours)

    phase_factor = _PHASE_VOLUME_FACTOR.get(phase)
    if phase_factor is not None:
        return int(round(base_tss * phase_factor))

    ramp = _RAMP_FACTOR[block_position]

    if block_position == "recovery":
        return int(round(base_tss * ramp))

    # Clamp ramp to Friel 8% cap — if ramp already exceeds cap use cap
    effective_ramp = min(ramp, 1.0 + FRIEL_RAMP_CAP_PCT)
    return int(round(base_tss * effective_ramp))


def planned_week_monotony(daily_tss: list[float]) -> float:
    """Foster monotony of a PLANNED week: mean daily TSS / SD (population).

    0.0 for an empty/zero week; a large sentinel (9.9) when every day is
    identical (SD → 0), which is maximal monotony by definition. Exposed in
    the meso evidence for transparency and enforced (< 2.0) by the builder's
    monotony guard.
    """
    if not daily_tss:
        return 0.0
    n = len(daily_tss)
    mean = sum(daily_tss) / n
    if mean <= 0:
        return 0.0
    var = sum((x - mean) ** 2 for x in daily_tss) / n
    sd = var ** 0.5
    if sd < 1e-6:
        return 9.9
    return round(mean / sd, 2)


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

    # ── Availability (days_available / long_day / hard_day_blackouts) ─────
    # The athlete's declared days are LAW: unavailable days are forced rest,
    # the long ride lands on their long_day, and hard sessions never land on
    # a blacked-out day (review findings 2 + 3).
    available_dows, long_dow, blackout_dows = _athlete_availability(athlete)

    # ── Rest-day skeleton ─────────────────────────────────────────────────
    # Real rest days are placed deterministically from the phase's rest_days
    # count (base1 → 2). At generation time we have no load history, so the
    # picker's history-based Monday-rest rule can never fire — we own the week
    # shape here instead.  On a rest DOW we emit the rest_day template (tss 0)
    # rather than yet another Z2 session.
    rest_dows = _rest_dows_for_week(phase, block_position, available_dows, long_dow)

    # Actual training days → canonical weekday roles for the phase logic.
    virtual_dow = _assign_virtual_dows(
        [d for d in range(7) if d not in rest_dows], long_dow, blackout_dows
    )

    # Riding days drive a realistic per-day time window (weekly hours spread
    # over the days we actually ride, not all 7), so variety templates fit.
    weekly_hours = athlete.weekly_hours_available or 10.0
    riding_days = max(1, 7 - len(rest_dows))
    base_available_min = max(30, int(weekly_hours * 60 / riding_days))

    # Day-type-aware long-day window (Z2-degeneration cause 3): the LONG day
    # gets ~45% of the declared weekly hours — a 12h athlete's long day can be
    # a genuine 3h+ ride — additionally capped so the long ride doesn't swallow
    # more than ~45% of the weekly TSS budget. The historical 120-min floor now
    # only applies when the declared hours can actually carry it (review
    # finding 4: a 2 h/Woche athlete must never receive a 2h long ride).
    long_floor_min = min(120, max(30, int(weekly_hours * 60 * 0.5)))
    long_window_min = max(
        long_floor_min, int(weekly_hours * 60 * _LONG_DAY_HOURS_SHARE)
    )
    budget_cap_min = int(
        (_LONG_DAY_TSS_SHARE * max(0, weekly_tss_target_val)) / _Z2_TSS_PER_MIN_PLAN
    )
    long_day_min = max(long_floor_min, min(long_window_min, budget_cap_min))

    # ── Pass 1: resolve session type + template for each riding day ────────
    hard_sessions_done = 0
    vo2_sessions_done = 0
    cumulative_tss = 0.0
    # variety_dial consumption (review finding 3): the dial shifts every
    # deterministic rotation, so bumping it ("too boring") rebuilds the SAME
    # calendar week into a visibly different plan; 'adventurous' additionally
    # swaps in the playful/alternative Z2 formats.
    dial = getattr(athlete, "variety_dial", None)
    variety_shift = _VARIETY_DIAL_SHIFT.get(dial, 0)
    if dial == "adventurous":
        variety_pool = _ENDURANCE_VARIETY_ADVENTUROUS
    elif dial == "mixed":
        variety_pool = _ENDURANCE_VARIETY_MIXED
    else:
        variety_pool = _ENDURANCE_VARIETY
    # Week-shifted variety start (plan-engine v2): the rotation index used to
    # reset to 0 every week, so week after week Tuesday was the SAME texture.
    # Offsetting by the calendar week makes consecutive weeks open on a
    # different Z2 variant — deterministic, no randomness.
    variety_idx = (week_start.toordinal() // 7 + variety_shift) % len(variety_pool)
    # Recovery weeks swap the filler pool for the strictly-easy rotation and
    # keep their own rotating index (review NEW-4 — no identical spins ×4).
    if block_position == "recovery":
        variety_pool = _RECOVERY_WEEK_VARIETY
        variety_idx = variety_idx % len(variety_pool)
    recovery_variety_idx = (
        week_start.toordinal() // 7 + variety_shift
    ) % len(_RECOVERY_WEEK_VARIETY)

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
                    "vdow": dow,
                })
                continue
            assert not isinstance(pd, str)
            # Recovery-week deload slots: the program downgrades every quality
            # day to the SAME pinned recovery_60 — which rendered as four
            # identical "Lockeres Ausfahren — 60 min" rows (review NEW-4).
            # Draw varied easy flavors from the recovery pool instead; the
            # deload intent holds — the pool is strictly easy variants.
            preferred_prog_id = pd.template_id
            if block_position == "recovery" and pd.session_type == "recovery":
                preferred_prog_id = _pick_variety_filler(
                    _RECOVERY_WEEK_VARIETY, recovery_variety_idx, ftp_w,
                    base_available_min,
                    exclude={p["template"].id for p in plan},
                )
                recovery_variety_idx += 1
            # Weekend endurance slots are the program's long-ride anchors.
            # Pinned templates (the 200k Saturday ladder) get the full
            # hours-derived window so z2_long_180/240 actually fit; unpinned
            # slots (e.g. the vo2_builder Sunday) take the budget-aware long
            # window and pick LONGEST-FIT (rotation_key=0) — passing the
            # rotation key here was the bug that demoted the long ride to a
            # 60-90min spin (Z2-degeneration cause 3).
            if pd.session_type == "endurance" and dow in (5, 6):
                available_min = long_window_min if pd.template_id else long_day_min
                rotation = 0
            else:
                available_min = base_available_min if dow != 5 else max(base_available_min, 150)
                rotation = day_date.toordinal()
            template = pick_template(
                pd.session_type, ftp_w, available_min,
                preferred_template_id=preferred_prog_id,
                rotation_key=rotation,
            )
            if pd.session_type in ("vo2", "threshold", "sweet_spot", "tempo"):
                hard_sessions_done += 1
                if pd.session_type == "vo2":
                    vo2_sessions_done += 1
            kind = "fixed" if pd.fixed else "filler"
            cumulative_tss += float(template.base_tss)
            plan.append({
                "date": day_date, "session_type": pd.session_type,
                "template": template, "kind": kind, "vdow": dow,
            })
            continue

        # Scheduled rest — skip the picker entirely so we never spend load or
        # advance the quality counters on a rest day. Unavailable days are
        # always in rest_dows, so the plan NEVER trains a day the athlete
        # said they don't have.
        if dow in rest_dows:
            plan.append({
                "date": day_date,
                "session_type": "rest",
                "template": TEMPLATES["rest_day"],
                "kind": "rest",
                "vdow": dow,
            })
            continue

        # Canonical weekday role for the phase logic — with all 7 days
        # available this is the identity, otherwise the athlete's actual
        # training days take on the canonical week's roles (long ride on
        # their long_day, quality on their free mid-week days, …).
        vdow = virtual_dow.get(dow, dow)

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
            day_of_week=vdow,
            training_model=training_model,
            is_recovery_week=(block_position == "recovery"),
        )

        # hard_day_blackouts are a hard guarantee: if a hard session would
        # still land on a blacked-out day (e.g. no easy day was available to
        # swap roles with), it becomes endurance instead.
        if dow in blackout_dows and session_type in _HARD_TYPES:
            session_type = "endurance"

        available_min = base_available_min
        # For the long ride or key sessions: use a longer window
        if vdow == 6:  # long ride — day-type-aware window (cause 3)
            available_min = max(available_min, long_day_min)
        elif session_type in _HARD_TYPES and vdow == 2:  # keystone session
            available_min = max(available_min, min(75, int(weekly_hours * 60)))

        # Mountain-event specificity — route quality days (and the second
        # weekend day) to climbing / low-cadence variants when the athlete
        # targets a fondo / hilly race inside the specificity window.
        preferred_id = None
        if athlete.target_event_date is not None:
            preferred_id = mountain_event_template(
                session_type=session_type,
                event_type=athlete.target_event_type,
                days_to_event=(athlete.target_event_date - day_date).days,
                day_of_week=vdow,
            )
        # The Saturday-role climbing keystone (z2_climbing_long, 3h) needs the
        # long-day window or it silently never fits a time-crunched athlete.
        if vdow == 5 and preferred_id == "z2_climbing_long":
            available_min = max(available_min, long_window_min)

        # Variety: rotate the mid-week aerobic *filler* among distinct Z2
        # templates so the week isn't the identical ride 6×. The long ride
        # (longest-fit) and any climbing-preferred day keep their own pick
        # and are exempt from the rotation.
        is_filler = (
            session_type == "endurance" and vdow != 6 and preferred_id is None
        )
        if is_filler:
            preferred_id = _pick_variety_filler(
                variety_pool, variety_idx, ftp_w, available_min,
                # Recovery weeks additionally dedupe against the days already
                # placed (review NEW-4 — no identical easy rides ×4).
                exclude=(
                    {p["template"].id for p in plan}
                    if block_position == "recovery" else None
                ),
            )
            variety_idx += 1

        template = pick_template(
            session_type, ftp_w, available_min, preferred_template_id=preferred_id,
            # Deterministic anti-monotony: rotate quality/endurance variants by
            # calendar day (+ the variety-dial shift) so consecutive weeks —
            # and a "too boring" rebuild of the SAME week — never repeat the
            # same picks. The LONG slot is genuinely exempt (rotation_key=0 →
            # longest-fit): rotating it was Z2-degeneration cause 3, demoting
            # the long ride to z2_endurance_60.
            rotation_key=0 if vdow == 6 else day_date.toordinal() + variety_shift,
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
            "vdow": vdow,
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
    # budget. TRIM ORDER (plan-engine v2, Z2-degeneration cause 1): a filler
    # that overshoots is first swapped for a SHORTER Z2 variant (the day stays
    # aerobic — trim duration, not the plan's texture), then a recovery spin,
    # and only as a last resort a rest day. Key/quality sessions are never
    # touched — the old recovery_60/rest cascade is what collapsed a
    # 12h-athlete's week into ~5h of spins.
    reserved = sum(
        e["template"].base_tss for e in plan if e["kind"] == "fixed"
    )
    filler_budget = max(0.0, float(weekly_tss_target_val) - reserved - run_tss_total)
    filler_running = 0.0

    for e in plan:
        if e["kind"] != "filler":
            continue
        tss = e["template"].base_tss
        if filler_running + tss <= filler_budget * _FILLER_OVERSHOOT:
            filler_running += tss
            continue
        remaining = filler_budget * _FILLER_OVERSHOOT - filler_running
        shorter = pick_trim_variant(
            remaining, base_available_min, exclude_id=e["template"].id
        )
        if shorter is not None:
            e["template"] = shorter
            filler_running += shorter.base_tss
            continue
        # Recovery-spin swap with title dedupe (review NEW-4): prefer an easy
        # variant the week doesn't already contain — same deload intent,
        # different flavor — before repeating an identical row.
        used_ids = {p["template"].id for p in plan if p is not e}
        spin = None
        spin_fallback = None
        for tid in _RECOVERY_SPIN_LADDER:
            t = TEMPLATES[tid]
            if filler_running + t.base_tss > filler_budget * _FILLER_RECOVERY_OVERSHOOT:
                continue
            if tid not in used_ids:
                spin = t
                break
            if spin_fallback is None:
                spin_fallback = t
        spin = spin or spin_fallback
        if spin is not None:
            e["template"] = spin
            filler_running += spin.base_tss
        else:
            e["template"] = TEMPLATES["rest_day"]

    # ── Pass 2.5: Foster monotony guard (plan-engine v2) ──────────────────
    # Planned monotony (mean daily TSS / SD, runs included) must stay below
    # 2.0 — above it the week reads "every day alike" (Foster 1998: high
    # monotony + strain associate with illness/overreaching; modest effect,
    # used here as a VARIETY constraint, not an injury claim). The corrective
    # move is contrast: swap the smallest still-riding filler day to rest so
    # hard days stay hard and easy days become genuinely easy. Key sessions
    # are never touched; two attempts max (stability > twitchiness).
    run_tss_by_dow: dict[int, float] = {}
    for entry in run_entries:
        run_tss_by_dow[entry["dow"]] = run_tss_by_dow.get(entry["dow"], 0.0) + entry["tss"]
    for _ in range(2):
        daily = [
            e["template"].base_tss + run_tss_by_dow.get(i, 0.0)
            for i, e in enumerate(plan)
        ]
        if planned_week_monotony(daily) < _MONOTONY_LIMIT:
            break
        swappable = [
            e for e in plan
            if e["kind"] == "filler" and e["template"].base_tss > 0
        ]
        if not swappable:
            break
        victim = min(swappable, key=lambda e: e["template"].base_tss)
        victim["template"] = TEMPLATES["rest_day"]

    # ── Pass 2.7: declared-hours DURATION ceiling (review finding 4) ──────
    # Stated hours are a hard ceiling on total planned time, always: a
    # 2 h/Woche beginner must never receive a 3h10 week. TSS trimming above
    # cannot guarantee this (rest-day floors, ramp factors), so we enforce it
    # on minutes directly: shrink the longest shrinkable days — fillers
    # first, then fixed endurance, the long ride last before quality — until
    # the BIKE week fits declared_hours × 1.05. Interleaved runs are deducted
    # through the shared TSS budget above, not here — dual-sport must never
    # reshape the bike week beyond that budget (cycling-only invariant).
    declared_hours = getattr(athlete, "weekly_hours_available", None)
    if declared_hours and declared_hours > 0:
        cap_min = declared_hours * 60.0 * _WEEK_HOURS_TOLERANCE

        def _minutes(entry: dict) -> float:
            return sum(b.duration_s for b in entry["template"].blocks) / 60.0

        def _week_minutes() -> float:
            return sum(_minutes(e) for e in plan)

        def _shrink_rank(entry: dict) -> tuple:
            # Lower rank shrinks first: fillers → recovery → fixed endurance
            # → long ride → quality. Longest first within a rank.
            st = entry["session_type"]
            if entry["kind"] == "filler":
                rank = 0
            elif st in ("recovery",):
                rank = 1
            elif st == "endurance":
                rank = 2 if entry.get("vdow") != 6 else 3
            else:
                rank = 4
            return (rank, -_minutes(entry))

        for entry in sorted(
            (e for e in plan if e["session_type"] != "rest"), key=_shrink_rank
        ):
            over = _week_minutes() - cap_min
            if over <= 0.5:
                break
            cur_min = _minutes(entry)
            target_min = int(cur_min - over)
            if target_min >= 20:
                shorter = pick_template(
                    entry["session_type"], ftp_w, target_min, rotation_key=0
                )
                if sum(b.duration_s for b in shorter.blocks) / 60.0 < cur_min:
                    entry["template"] = shorter
                    continue
            # Nothing shorter fits in this category — drop the day.
            rec30 = TEMPLATES["recovery_30"]
            if target_min >= 30 and cur_min > 30:
                entry["template"] = rec30
                entry["session_type"] = "recovery"
            else:
                entry["template"] = TEMPLATES["rest_day"]
                entry["session_type"] = "rest"

    for e in plan:
        template = e["template"]

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

def _fitness_builder_phase(ctl: float) -> Phase:
    """CTL-keyed phase for the no-event fitness-builder path.

    Mirrors detect_training_phase's far-from-goal CTL splits so a goal-less
    athlete still gets a phase with real quality (base1 carries VO2 + tempo,
    base2 adds threshold, build1 runs the full quality quota) instead of a
    literal maintenance plan.
    """
    if ctl < 40.0:
        return "base1"
    if ctl < 55.0:
        return "base2"
    return "build1"


def fitness_builder_progression(ctl: float, weekly_hours: float | None) -> dict:
    """Progression horizon for the no-event path — the honest replacement for
    the '— Wochen übrig' dash: a rolling 12-week fitness block with a
    deterministic CTL target derived from the Friel-capped ramp."""
    # ~8%/wk load ramp sustained over 12 weeks moves CTL by roughly a third,
    # bounded so low-CTL starters see a meaningful but honest number.
    target_ctl = round(min(ctl + 15.0, max(ctl * 1.30, ctl + 6.0)), 1)
    return {
        "mode": "fitness_builder",
        "horizon_weeks": 12,
        "start_ctl": round(ctl, 1),
        "target_ctl": target_ctl,
    }


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

    # No-event / "einfach fitter werden" path (review finding 5): this used to
    # collapse into a literal 'maintenance' plan — one sweet-spot touch, no
    # VO2/threshold, no horizon. A fitness builder deserves a real CTL-keyed
    # base→build progression instead; the progression horizon is written into
    # the evidence below so the UI can render it instead of a dash.
    if event_type == "maintenance" or goal_date is None:
        ctl_ref = float(current_ctl) if current_ctl is not None else 40.0
        phase = _fitness_builder_phase(ctl_ref)
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

    # Declared-hours blend (plan-engine v2): the weekly budget respects what
    # the athlete SAID they can ride, not just what their CTL history shows —
    # see _blend_weekly_anchor for the closing-the-gap rules.
    declared_hours = getattr(athlete, "weekly_hours_available", None)

    tss_targets: list[int] = []
    prev_tss: int | None = None
    for week_idx in range(MESO_LENGTH_WEEKS):
        block_pos = issurin_block_for_week(week_idx)
        tss = weekly_tss_target(
            ctl_for_ramp, phase, block_pos, weekly_hours=declared_hours
        )
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
        # Budget transparency (plan-engine v2): both anchors the weekly
        # budget was blended from, so "why is my week X TSS" is answerable.
        "weekly_hours": declared_hours,
        "budget_basis": {
            "ctl_anchored": int(round(ctl_for_ramp * 7)),
            "hours_implied": (
                int(round(hours_implied_tss(declared_hours)))
                if declared_hours else None
            ),
        },
    }

    # No-event athletes get a real progression horizon (review finding 5) —
    # persisted here so the plan/interview responses and UI can render it.
    if event_type == "maintenance" or goal_date is None:
        evidence["progression"] = fitness_builder_progression(
            ctl_for_ramp, declared_hours
        )

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
    planned_monotony: list[float] = []
    week0_hours: float = 0.0
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

        if week_idx == 0:
            week0_hours = sum(d.duration_seconds_target for d in drafts) / 3600.0

        # Planned Foster monotony per week (transparency — the guard inside
        # build_week_drafts already enforces < 2.0 where fillers allow).
        daily_tss: dict[date, float] = {}
        for draft in drafts:
            est = template_tss_estimate(
                draft.template_id, draft.duration_seconds_target
            ) or 0.0
            daily_tss[draft.date] = daily_tss.get(draft.date, 0.0) + est
        planned_monotony.append(planned_week_monotony([
            daily_tss.get(week_start + timedelta(days=i), 0.0) for i in range(7)
        ]))

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

    # Hours transparency (review finding 4): when the plan's ACTUAL first
    # week lands well below the stated hours, say so — computed AFTER the
    # week is materialized, so start_hours always equals the hours the plan
    # card shows (the old TSS-derived estimate drifted: "5.9h" stat next to a
    # "~6,4 h" note on the same card). Bilingual strings stay as fallback;
    # the UI renders the numeric fields with its own locale formatter.
    if declared_hours and declared_hours > 0 and week0_hours < 0.8 * declared_hours:
        start_hours = round(week0_hours, 1)
        evidence["hours_note"] = {
            "declared_hours": float(declared_hours),
            "start_hours": start_hours,
            "reason": "ctl_anchor",
            "de": (
                f"Wir starten bei ~{start_hours:g} h/Woche und bauen "
                f"Richtung {declared_hours:g} h auf — dein bisheriges "
                "Training trägt sicher erst dieses Startvolumen, der Plan "
                "steigert es Woche für Woche (max. +8 %)."
            ),
            "en": (
                f"We start at ~{start_hours:g} h/week and build toward "
                f"{declared_hours:g} h — your recent training safely "
                "supports this starting volume, and the plan ramps it "
                "week over week (max +8%)."
            ),
        }

    # Expose the planned-week monotony in the meso evidence (task: monotony
    # guard transparency) — assign a NEW dict so the JSON column dirties.
    meso.evidence = {**evidence, "planned_monotony": planned_monotony}

    await db.flush()  # assign IDs before returning

    logger.info(
        "Generated MesocyclePlan for user_id=%d start=%s phase=%s inserted=%d workouts",
        user_id,
        plan_start_date,
        phase,
        inserted_count,
    )
    return meso
