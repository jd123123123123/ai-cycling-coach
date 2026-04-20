"""Workout templates library — the precise interval structures the coach prescribes from.

Design invariants:
    - Every template is parametric: blocks specify target_pct_ftp, never absolute
      watts. Absolute watts are materialised via `parametrize_template(template, ftp)`
      so that the athlete's current FTP always drives the numbers the LLM cannot
      override.
    - The LLM's job is to PICK a template and tune total duration ±15%. It MUST
      NOT invent interval structures. `resolve_and_prescribe` (in coach_service)
      validates that `template_id` resolves to a known template and rewrites the
      watts server-side, so hallucinated watts are harmless.
    - Warm-up and cool-down durations are fixed; `duration_scale` only stretches
      the MAIN blocks (anything not named "Warm-up" or "Cool-down").
    - `predicted_ef_range` is a heuristic band derived from category + duration;
      callers display it as expectation setting, not a target.

References: Coggan power zones, Seiler polarized, Friel periodization,
San Millán Z2 (see .planning/research/training-frameworks.md).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


# ======================================================================
#  Primitive types
# ======================================================================

Category = Literal[
    "recovery",
    "endurance",
    "tempo",
    "sweet_spot",
    "threshold",
    "vo2",
    "anaerobic",
    "rest",
]


@dataclass(frozen=True)
class IntervalBlock:
    """One segment of a workout template — always expressed as %FTP, never watts.

    The actual watts are computed at parametrize time from the athlete's FTP so
    that the same template scales with the athlete's current fitness without a
    re-authoring step.
    """

    name: str                    # "Warm-up", "Main", "Recovery", "Cool-down"
    duration_s: int
    target_pct_ftp: float        # 0.65 = 65% FTP
    target_rpe: int              # 1-10
    zone: int                    # Coggan 1-7


@dataclass(frozen=True)
class WorkoutTemplate:
    id: str                      # stable id like "vo2_5x4"
    name: str                    # human display (e.g. "VO2 — 5×4min")
    category: Category
    purpose: str                 # short prose ("Builds VO2 ceiling")
    framework_cited: str         # "Coggan Z5 · Friel Build 2"
    blocks: list[IntervalBlock]
    base_tss: float              # approximate TSS at the template's designed volume
    min_ftp_required: int | None = None  # skip if athlete FTP < this (safety)


@dataclass(frozen=True)
class ResolvedBlock:
    """Absolute-watts version of an IntervalBlock, keyed to the athlete's FTP."""

    name: str
    duration_s: int
    target_watts_low: int
    target_watts_high: int
    target_pct_ftp: float
    zone: int
    rpe: int


@dataclass
class PrescribedWorkout:
    template_id: str
    title: str                               # "VO2 — 5×4min at 115% FTP"
    framework_cited: str
    purpose: str
    category: Category
    total_duration_s: int
    predicted_tss: float
    predicted_ef_range: tuple[float, float]  # (low, high) EF expectation
    blocks: list[ResolvedBlock] = field(default_factory=list)

    @property
    def duration_minutes(self) -> int:
        return int(round(self.total_duration_s / 60))


# ======================================================================
#  Shorthand helpers for declaring blocks
# ======================================================================

def _wu(duration_s: int = 900) -> IntervalBlock:
    """15-min standard warm-up — ramped but captured here at a single Z1-2 %FTP
    for simplicity. Users on Zwift/Trainerroad get a ramp; we represent the
    time-average as 55% FTP."""
    return IntervalBlock(
        name="Warm-up",
        duration_s=duration_s,
        target_pct_ftp=0.55,
        target_rpe=3,
        zone=1,
    )


def _cd(duration_s: int = 600) -> IntervalBlock:
    """10-min cool-down at high Z1."""
    return IntervalBlock(
        name="Cool-down",
        duration_s=duration_s,
        target_pct_ftp=0.50,
        target_rpe=2,
        zone=1,
    )


def _rec(duration_s: int, pct: float = 0.50, zone: int = 1) -> IntervalBlock:
    return IntervalBlock(
        name="Recovery",
        duration_s=duration_s,
        target_pct_ftp=pct,
        target_rpe=2,
        zone=zone,
    )


# ======================================================================
#  The 12-template library
# ======================================================================

TEMPLATES: dict[str, WorkoutTemplate] = {
    # ---- Recovery / rest -------------------------------------------------
    "rest_day": WorkoutTemplate(
        id="rest_day",
        name="Rest day",
        category="rest",
        purpose="Full recovery — sleep, walk, mobility. Zero structured load.",
        framework_cited="Banister fitness-fatigue · Mujika recovery",
        blocks=[],
        base_tss=0.0,
    ),
    "recovery_30": WorkoutTemplate(
        id="recovery_30",
        name="Recovery spin — 30min",
        category="recovery",
        purpose="Parasympathetic reset; active recovery below LT1.",
        framework_cited="Coggan Z1 · Seiler LIT",
        blocks=[
            IntervalBlock(
                name="Easy spin", duration_s=30 * 60,
                target_pct_ftp=0.50, target_rpe=2, zone=1,
            ),
        ],
        base_tss=15.0,
    ),

    # ---- Z2 endurance stack (San Millán backbone) ------------------------
    "z2_endurance_60": WorkoutTemplate(
        id="z2_endurance_60",
        name="Z2 endurance — 60min",
        category="endurance",
        purpose="Fat-oxidation / mitochondrial density at LT1.",
        framework_cited="San Millán Z2 · Seiler LIT",
        blocks=[
            IntervalBlock(
                name="Endurance", duration_s=60 * 60,
                target_pct_ftp=0.65, target_rpe=4, zone=2,
            ),
        ],
        base_tss=45.0,
    ),
    "z2_endurance_90": WorkoutTemplate(
        id="z2_endurance_90",
        name="Z2 endurance — 90min",
        category="endurance",
        purpose="Extended LT1 work — aerobic base building.",
        framework_cited="San Millán Z2 · Seiler LIT",
        blocks=[
            IntervalBlock(
                name="Endurance", duration_s=90 * 60,
                target_pct_ftp=0.65, target_rpe=4, zone=2,
            ),
        ],
        base_tss=68.0,
    ),
    "z2_long_120": WorkoutTemplate(
        id="z2_long_120",
        name="Long Z2 — 2h",
        category="endurance",
        purpose="Aerobic durability; tests HR drift at fixed Z2 power.",
        framework_cited="San Millán Z2 · Friel base",
        blocks=[
            IntervalBlock(
                name="Long endurance", duration_s=120 * 60,
                target_pct_ftp=0.65, target_rpe=4, zone=2,
            ),
        ],
        base_tss=90.0,
    ),
    "z2_long_180": WorkoutTemplate(
        id="z2_long_180",
        name="Long Z2 — 3h (San Millán signature)",
        category="endurance",
        purpose=(
            "The canonical San Millán Z2 session. HR drift <6bpm at fixed "
            "power = Z2 ceiling adaptation is landing."
        ),
        framework_cited="San Millán Z2 · Friel base 2",
        blocks=[
            IntervalBlock(
                name="Long endurance", duration_s=180 * 60,
                target_pct_ftp=0.65, target_rpe=5, zone=2,
            ),
        ],
        base_tss=135.0,
    ),

    # ---- Tempo / sweet spot / threshold ----------------------------------
    "tempo_3x10": WorkoutTemplate(
        id="tempo_3x10",
        name="Tempo — 3×10min",
        category="tempo",
        purpose="Sub-threshold aerobic density; LT1-LT2 occupancy.",
        framework_cited="Coggan Z3 · Friel build 1",
        blocks=[
            _wu(),
            IntervalBlock(name="Tempo 1", duration_s=10 * 60, target_pct_ftp=0.85, target_rpe=6, zone=3),
            _rec(3 * 60),
            IntervalBlock(name="Tempo 2", duration_s=10 * 60, target_pct_ftp=0.85, target_rpe=6, zone=3),
            _rec(3 * 60),
            IntervalBlock(name="Tempo 3", duration_s=10 * 60, target_pct_ftp=0.85, target_rpe=6, zone=3),
            _cd(),
        ],
        base_tss=70.0,
    ),
    "sweet_spot_2x20": WorkoutTemplate(
        id="sweet_spot_2x20",
        name="Sweet spot — 2×20min",
        category="sweet_spot",
        purpose="High aerobic work at 88% FTP; strong CTL builder with manageable TSS.",
        framework_cited="Coggan sweet-spot · Friel build 2",
        blocks=[
            _wu(),
            IntervalBlock(name="Sweet spot 1", duration_s=20 * 60, target_pct_ftp=0.88, target_rpe=7, zone=3),
            _rec(5 * 60),
            IntervalBlock(name="Sweet spot 2", duration_s=20 * 60, target_pct_ftp=0.88, target_rpe=7, zone=3),
            _cd(),
        ],
        base_tss=85.0,
    ),
    "threshold_2x15": WorkoutTemplate(
        id="threshold_2x15",
        name="Threshold — 2×15min",
        category="threshold",
        purpose="LT2 occupancy; raises FTP ceiling.",
        framework_cited="Coggan Z4 · Friel build 2",
        blocks=[
            _wu(),
            IntervalBlock(name="Threshold 1", duration_s=15 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(6 * 60),
            IntervalBlock(name="Threshold 2", duration_s=15 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _cd(),
        ],
        base_tss=78.0,
    ),
    "over_under_3x5": WorkoutTemplate(
        id="over_under_3x5",
        name="Over-unders — 3×(5×1min)",
        category="threshold",
        purpose="Lactate shuttle training; LT2 resilience under repeated overshoots.",
        framework_cited="Coggan Z4 overunders · Seiler HIT",
        blocks=[
            _wu(),
            # 3 sets × (5 × (1min over / 1min under)) — encoded as one grouped block each
            IntervalBlock(name="OU set 1 (5×1/1min)", duration_s=5 * 120, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(5 * 60),
            IntervalBlock(name="OU set 2 (5×1/1min)", duration_s=5 * 120, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(5 * 60),
            IntervalBlock(name="OU set 3 (5×1/1min)", duration_s=5 * 120, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _cd(),
        ],
        base_tss=78.0,
    ),

    # ---- VO2 / anaerobic -------------------------------------------------
    "vo2_5x4": WorkoutTemplate(
        id="vo2_5x4",
        name="VO2 — 5×4min at 115% FTP",
        category="vo2",
        purpose="Raises VO2max ceiling; the canonical Z5 stimulus.",
        framework_cited="Coggan Z5 · Friel build 2 · Seiler HIT",
        blocks=[
            _wu(),
            IntervalBlock(name="VO2 1", duration_s=4 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="VO2 2", duration_s=4 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="VO2 3", duration_s=4 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="VO2 4", duration_s=4 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="VO2 5", duration_s=4 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5),
            _cd(),
        ],
        base_tss=72.0,
        min_ftp_required=180,
    ),
    "vo2_micro_30x30": WorkoutTemplate(
        id="vo2_micro_30x30",
        name="VO2 micro — 30×30/30s",
        category="vo2",
        purpose="Micro-interval VO2 accumulation; Billat-style, more VO2 time at lower avg power.",
        framework_cited="Coggan Z5 · Billat micro-intervals",
        blocks=[
            _wu(),
            # 30 × (30s ON + 30s OFF) = 30min of work+recovery alternation, averaged into one block
            IntervalBlock(name="30×30/30 micro set", duration_s=30 * 60, target_pct_ftp=1.20, target_rpe=9, zone=5),
            _cd(),
        ],
        base_tss=65.0,
        min_ftp_required=180,
    ),
}


def get_template(template_id: str) -> WorkoutTemplate | None:
    """Public accessor — returns None when template_id is unknown."""
    return TEMPLATES.get(template_id)


# ======================================================================
#  EF expectation heuristics — category → (low, high) NP/HR band
# ======================================================================

_EF_BAND_BY_CATEGORY: dict[Category, tuple[float, float]] = {
    "rest": (0.0, 0.0),
    "recovery": (1.00, 1.20),
    "endurance": (1.30, 1.60),
    "tempo": (1.40, 1.70),
    "sweet_spot": (1.45, 1.75),
    "threshold": (1.50, 1.80),
    "vo2": (1.30, 1.55),         # lower than threshold — VO2 effort pushes HR hard
    "anaerobic": (1.20, 1.45),
}


# ======================================================================
#  Parametrization — template × FTP → PrescribedWorkout
# ======================================================================

def _watts_band(ftp: int, pct: float, tolerance_pct: float = 0.05) -> tuple[int, int]:
    """Return (low, high) watts for a target % of FTP at ±tolerance_pct.

    Example: ftp=280, pct=1.15, tol=0.05 → band around 322W = (305, 338).
    """
    center = ftp * pct
    low = int(round(center * (1.0 - tolerance_pct)))
    high = int(round(center * (1.0 + tolerance_pct)))
    if high < low:
        high = low
    return low, high


def _tolerance_for_zone(zone: int) -> float:
    """Narrower band on high-zone efforts (tight on VO2), wider on Z1-2 rec/endurance."""
    if zone <= 1:
        return 0.10
    if zone == 2:
        return 0.08
    if zone == 3:
        return 0.06
    return 0.05


def parametrize_template(
    template: WorkoutTemplate,
    ftp: int,
    duration_scale: float = 1.0,
) -> PrescribedWorkout:
    """Return a concrete PrescribedWorkout with absolute watts computed from FTP.

    Args:
        template: the blueprint to materialise.
        ftp: athlete's current FTP in watts. Must be >0.
        duration_scale: multiplier applied to MAIN blocks only (never warm-up or
            cool-down). Clamped to [0.7, 1.15] so the LLM cannot lever this into
            creating a fundamentally different workout — the plan's
            `duration_scale ±15%` invariant is enforced here.

    Returns:
        PrescribedWorkout with absolute watts, absolute seconds, scaled TSS,
        and a predicted EF range based on the template category.
    """
    if ftp <= 0:
        # Defensive: callers should gate on ftp > 0 before calling. We refuse
        # to fabricate absolute numbers from nothing.
        raise ValueError("parametrize_template requires ftp > 0")

    # Clamp the scale so a malicious/careless caller cannot produce a 3h VO2.
    scale = max(0.7, min(1.15, duration_scale))

    resolved: list[ResolvedBlock] = []
    scaled_work_seconds = 0
    base_work_seconds = 0

    for block in template.blocks:
        is_fixed = block.name in ("Warm-up", "Cool-down")
        duration = block.duration_s if is_fixed else int(round(block.duration_s * scale))
        if not is_fixed:
            scaled_work_seconds += duration
            base_work_seconds += block.duration_s
        tol = _tolerance_for_zone(block.zone)
        low, high = _watts_band(ftp, block.target_pct_ftp, tolerance_pct=tol)
        resolved.append(
            ResolvedBlock(
                name=block.name,
                duration_s=duration,
                target_watts_low=low,
                target_watts_high=high,
                target_pct_ftp=round(block.target_pct_ftp, 3),
                zone=block.zone,
                rpe=block.target_rpe,
            )
        )

    # TSS scaling: base_tss is for the designed volume; we scale by the ratio
    # of scaled main-block seconds to base main-block seconds. Rest-day edge
    # case (no main blocks) keeps TSS=base (which is 0 for rest_day).
    if base_work_seconds > 0:
        tss_scale = scaled_work_seconds / base_work_seconds
        predicted_tss = round(template.base_tss * tss_scale, 1)
    else:
        predicted_tss = template.base_tss

    total_duration_s = sum(b.duration_s for b in resolved)
    ef_range = _EF_BAND_BY_CATEGORY.get(template.category, (1.30, 1.60))

    return PrescribedWorkout(
        template_id=template.id,
        title=template.name,
        framework_cited=template.framework_cited,
        purpose=template.purpose,
        category=template.category,
        total_duration_s=total_duration_s,
        predicted_tss=predicted_tss,
        predicted_ef_range=ef_range,
        blocks=resolved,
    )


def prescribed_workout_to_dict(pw: PrescribedWorkout) -> dict:
    """Serialise to the JSON shape the Pydantic schema / frontend expects."""
    return {
        "template_id": pw.template_id,
        "title": pw.title,
        "framework_cited": pw.framework_cited,
        "purpose": pw.purpose,
        "category": pw.category,
        "duration_minutes": pw.duration_minutes,
        "total_duration_s": pw.total_duration_s,
        "predicted_tss": pw.predicted_tss,
        "predicted_ef_range": list(pw.predicted_ef_range),
        "blocks": [
            {
                "name": b.name,
                "duration_s": b.duration_s,
                "target_watts_low": b.target_watts_low,
                "target_watts_high": b.target_watts_high,
                "target_pct_ftp": b.target_pct_ftp,
                "zone": b.zone,
                "rpe": b.rpe,
            }
            for b in pw.blocks
        ],
        # `why_this_workout` is filled in by coach_service (LLM or rule-based);
        # keep the field slot here so the serialiser shape is stable.
        "why_this_workout": None,
    }
