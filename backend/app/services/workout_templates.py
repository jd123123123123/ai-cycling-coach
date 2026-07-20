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

from dataclasses import dataclass, field, replace
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

# Machine-readable placement/readiness metadata (plan-engine v2). The
# adaptation engine swaps sessions BY these fields — e.g. a low-readiness
# morning replaces today's high-min_readiness VO2 with a same-slot,
# low-readiness archetype instead of deleting the day.
BlockPlacement = Literal["base", "build", "peak", "taper", "any"]
MinReadiness = Literal["low", "medium", "high"]


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
    # Cadence prescription — optional. When set, surfaces on the workout card
    # and on the .zwo / .fit exports. Friel/Coggan defaults by zone:
    #   Z1-Z2: 85-95 (aerobic natural)
    #   Z3-Z4: 88-100 (tempo to threshold)
    #   Z5+:   95-110 (high RPM neuromuscular)
    # Override with 60-75 for climbing-specific strength-endurance blocks.
    cadence_low: int | None = None
    cadence_high: int | None = None


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
    # ── Adaptation metadata (plan-engine v2) ──────────────────────────────
    # physiological_target: what the session develops, in one machine-usable
    # word (aerobic_base, vo2max, ftp, lactate_clearance, …). block_placement:
    # where in the macrocycle the session belongs. min_readiness: the lowest
    # adaptive-readiness state the session should be prescribed at (VO2 needs
    # 'high', a recovery spin is always fine). indoor_ok: feasible on a
    # trainer. fun_factor 1-3: novelty/affect rating (Ekkekakis/Gonzalez-Cutre
    # — the variety engine biases rotation toward higher-fun formats).
    physiological_target: str = "aerobic_base"
    block_placement: BlockPlacement = "any"
    min_readiness: MinReadiness = "medium"
    indoor_ok: bool = True
    fun_factor: int = 2


@dataclass(frozen=True)
class ResolvedBlock:
    """Absolute-watts version of an IntervalBlock, keyed to the athlete's FTP.

    HR bounds (target_hr_low/high) are populated when the caller can supply
    an LTHR (or one can be derived from MHR / age via `services.hr_zones`).
    Both `None` for sprints (Zone 7) where HR has no meaningful target.
    """

    name: str
    duration_s: int
    target_watts_low: int
    target_watts_high: int
    target_pct_ftp: float
    zone: int
    rpe: int
    cadence_low: int | None = None   # 60-75 for climbing blocks; None = "natural"
    cadence_high: int | None = None
    target_hr_low: int | None = None  # bpm
    target_hr_high: int | None = None # bpm


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

    "z2_climbing_long": WorkoutTemplate(
        id="z2_climbing_long",
        name="Climbing Z2 — 3h with low-cadence strength blocks",
        category="endurance",
        purpose=(
            "Maratona / Dolomites-style preparation. Two 20-min sub-threshold "
            "climbing blocks at 60-70rpm embedded in a 3h Z2 ride to build "
            "muscular endurance under sustained climbing load. The low cadence "
            "biases recruitment toward Type IIa fibres (Lucia 2004; Hansen 2007)."
        ),
        framework_cited="Friel build 1 climbing · Hansen 2007 cadence-specific endurance",
        blocks=[
            IntervalBlock(
                name="Endurance", duration_s=45 * 60,
                target_pct_ftp=0.65, target_rpe=5, zone=2,
                cadence_low=85, cadence_high=95,
            ),
            IntervalBlock(
                name="Low-cadence climb 1", duration_s=20 * 60,
                target_pct_ftp=0.82, target_rpe=7, zone=3,
                cadence_low=60, cadence_high=70,
            ),
            IntervalBlock(
                name="Endurance recovery", duration_s=15 * 60,
                target_pct_ftp=0.62, target_rpe=4, zone=2,
                cadence_low=85, cadence_high=95,
            ),
            IntervalBlock(
                name="Low-cadence climb 2", duration_s=20 * 60,
                target_pct_ftp=0.82, target_rpe=7, zone=3,
                cadence_low=60, cadence_high=70,
            ),
            IntervalBlock(
                name="Endurance", duration_s=70 * 60,
                target_pct_ftp=0.65, target_rpe=5, zone=2,
                cadence_low=85, cadence_high=95,
            ),
            IntervalBlock(
                name="Cool-down", duration_s=10 * 60,
                target_pct_ftp=0.50, target_rpe=2, zone=1,
                cadence_low=80, cadence_high=90,
            ),
        ],
        base_tss=160.0,
        min_ftp_required=180,
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

    # Rønnestad short-interval VO2 — Rønnestad et al. 2015 (Scand J Med Sci
    # Sports). Higher total time-at-VO2 than long intervals with lower
    # perceptual cost; the strongest "more bang per minute" VO2 protocol
    # in the trained-cyclist literature.
    "vo2_ronnestad_3x13": WorkoutTemplate(
        id="vo2_ronnestad_3x13",
        name="VO2 short-intervals — 3×(13×30/15s) (Rønnestad)",
        category="vo2",
        purpose=(
            "Rønnestad short-interval protocol: 3 sets × 13 reps × (30s @ "
            "~108–112% FTP / 15s easy), 3-min recoveries between sets. Higher "
            "time-at-VO2 than 5×4min with lower RPE — the highest-evidence "
            "VO2 stimulus for trained cyclists."
        ),
        framework_cited="Rønnestad 2015 · Bossi 2020 short-interval VO2",
        blocks=[
            _wu(),
            IntervalBlock(name="Set 1 — 13×30/15s @ 110% FTP", duration_s=13 * 45, target_pct_ftp=1.10, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="Set 2 — 13×30/15s @ 110% FTP", duration_s=13 * 45, target_pct_ftp=1.10, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="Set 3 — 13×30/15s @ 110% FTP", duration_s=13 * 45, target_pct_ftp=1.10, target_rpe=9, zone=5),
            _cd(),
        ],
        base_tss=78.0,
        min_ftp_required=180,
    ),

    # MAP 5×3min @ 110% — Vandewalle/Coggan MAP development. Shorter than
    # the 5×4 @ 115% canonical session — more accessible when fatigued or
    # ramping back, still genuine VO2 stimulus.
    "vo2_map_5x3": WorkoutTemplate(
        id="vo2_map_5x3",
        name="MAP — 5×3min @ 110% FTP",
        category="vo2",
        purpose="MAP-development VO2 dose; shorter reps than 5×4, easier to nail clean.",
        framework_cited="Coggan Z5 · Vandewalle MAP",
        blocks=[
            _wu(),
            IntervalBlock(name="MAP 1", duration_s=3 * 60, target_pct_ftp=1.10, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="MAP 2", duration_s=3 * 60, target_pct_ftp=1.10, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="MAP 3", duration_s=3 * 60, target_pct_ftp=1.10, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="MAP 4", duration_s=3 * 60, target_pct_ftp=1.10, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="MAP 5", duration_s=3 * 60, target_pct_ftp=1.10, target_rpe=9, zone=5),
            _cd(),
        ],
        base_tss=62.0,
        min_ftp_required=180,
    ),

    # ---- Norwegian threshold (Seiler) ------------------------------------
    # Seiler's signature interval block — 4×8min @ 90–94% FTP with 2-min
    # recoveries. The 4×8 has more VO2-time than 2×15 threshold (smaller
    # but more reps) while staying sub-LT2, so it's tolerable repeatedly
    # week after week. Used by Ingebrigtsen-era Norwegian endurance.
    "threshold_seiler_4x8": WorkoutTemplate(
        id="threshold_seiler_4x8",
        name="Norwegian threshold — 4×8min @ 92% FTP",
        category="threshold",
        purpose=(
            "Sub-threshold (LT2-) intervals — Seiler/Norwegian threshold "
            "model. High weekly tolerance, more time-at-threshold than 2×15 "
            "with less acute strain. Cornerstone of the Ingebrigtsen system."
        ),
        framework_cited="Seiler HIT · Norwegian threshold (Tjelta 2019)",
        blocks=[
            _wu(),
            IntervalBlock(name="Seiler 1", duration_s=8 * 60, target_pct_ftp=0.92, target_rpe=8, zone=4),
            _rec(2 * 60),
            IntervalBlock(name="Seiler 2", duration_s=8 * 60, target_pct_ftp=0.92, target_rpe=8, zone=4),
            _rec(2 * 60),
            IntervalBlock(name="Seiler 3", duration_s=8 * 60, target_pct_ftp=0.92, target_rpe=8, zone=4),
            _rec(2 * 60),
            IntervalBlock(name="Seiler 4", duration_s=8 * 60, target_pct_ftp=0.92, target_rpe=8, zone=4),
            _cd(),
        ],
        base_tss=88.0,
    ),

    # ---- Longer SST — Allen/Coggan classic durability builder -----------
    "sweet_spot_4x15": WorkoutTemplate(
        id="sweet_spot_4x15",
        name="Sweet spot — 4×15min",
        category="sweet_spot",
        purpose=(
            "Long sub-threshold accumulation — 60 minutes of work in the "
            "sweet-spot band. CTL builder for fondo / climbing prep without "
            "the recovery cost of pure threshold."
        ),
        framework_cited="Allen & Coggan sweet-spot · Friel build 1",
        blocks=[
            _wu(),
            IntervalBlock(name="SST 1", duration_s=15 * 60, target_pct_ftp=0.90, target_rpe=7, zone=3),
            _rec(5 * 60),
            IntervalBlock(name="SST 2", duration_s=15 * 60, target_pct_ftp=0.90, target_rpe=7, zone=3),
            _rec(5 * 60),
            IntervalBlock(name="SST 3", duration_s=15 * 60, target_pct_ftp=0.90, target_rpe=7, zone=3),
            _rec(5 * 60),
            IntervalBlock(name="SST 4", duration_s=15 * 60, target_pct_ftp=0.90, target_rpe=7, zone=3),
            _cd(),
        ],
        base_tss=120.0,
    ),

    # ---- Anaerobic / neuromuscular ---------------------------------------
    # Sprint repeats — Mujika neuromuscular template. Short, fully-rested,
    # peak-power-preserving. Useful in taper weeks and as a peak-power
    # maintenance dose during base.
    "neuromuscular_sprints_8x15": WorkoutTemplate(
        id="neuromuscular_sprints_8x15",
        name="Sprint repeats — 8×15s all-out",
        category="anaerobic",
        purpose=(
            "Peak-power & neuromuscular recruitment. Full 3-min recoveries "
            "keep each rep maximal — this is *not* anaerobic capacity work, "
            "it's pure top-end preservation."
        ),
        framework_cited="Mujika neuromuscular · Coggan NM",
        blocks=[
            _wu(),
            IntervalBlock(name="Sprint set (8×15s · 3-min easy between)", duration_s=8 * (15 + 3 * 60), target_pct_ftp=1.80, target_rpe=10, zone=6),
            _cd(),
        ],
        base_tss=45.0,
    ),

    # Tabata 8×20/10s @ ~170% — anaerobic capacity. Classic. Lactate-tolerance
    # work. Use sparingly — high systemic cost for the duration.
    "anaerobic_tabata_8x20_10": WorkoutTemplate(
        id="anaerobic_tabata_8x20_10",
        name="Tabata — 8×(20s on / 10s off)",
        category="anaerobic",
        purpose=(
            "Anaerobic-capacity / lactate-tolerance. 4-minute set of 20s @ "
            "~170% FTP / 10s easy. Originally Tabata 1996 (speed skaters); "
            "high acute strain — schedule once every 10–14 days max."
        ),
        framework_cited="Tabata 1996 · Coggan anaerobic capacity",
        blocks=[
            _wu(),
            IntervalBlock(name="Tabata set 1 (8×20/10s @ 170%)", duration_s=4 * 60, target_pct_ftp=1.70, target_rpe=10, zone=6),
            _rec(5 * 60),
            IntervalBlock(name="Tabata set 2 (8×20/10s @ 170%)", duration_s=4 * 60, target_pct_ftp=1.70, target_rpe=10, zone=6),
            _cd(),
        ],
        base_tss=55.0,
        min_ftp_required=180,
    ),

    # ---- Polarized long ride — Seiler / Stöggl signature -----------------
    # 3-hour Z1/Z2 long ride with 4×4min VO2 efforts inserted late, when the
    # athlete is already fatigued — the polarized model's high-intensity dose
    # delivered on a base of low-intensity volume.
    "polarized_long_z2_4x4": WorkoutTemplate(
        id="polarized_long_z2_4x4",
        name="Polarized long — 3h Z2 + 4×4 VO2 finisher",
        category="vo2",
        purpose=(
            "Seiler/Stöggl polarized session: long aerobic volume with the "
            "high-intensity dose embedded late, on pre-fatigued legs. Builds "
            "durability and VO2 simultaneously."
        ),
        framework_cited="Seiler & Tønnessen 2009 · Stöggl polarized",
        blocks=[
            IntervalBlock(name="Warm-up easy", duration_s=15 * 60, target_pct_ftp=0.55, target_rpe=3, zone=1),
            IntervalBlock(name="Z2 long base", duration_s=130 * 60, target_pct_ftp=0.65, target_rpe=5, zone=2),
            IntervalBlock(name="VO2 1 @ 115%", duration_s=4 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="VO2 2 @ 115%", duration_s=4 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="VO2 3 @ 115%", duration_s=4 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="VO2 4 @ 115%", duration_s=4 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5),
            _cd(15 * 60),
        ],
        base_tss=180.0,
        min_ftp_required=200,
    ),

    # ======================================================================
    #  Expanded library — curated, distinct protocols across every system.
    #  Each entry is a genuinely-different structure (not just a duration
    #  variant of an existing template), drawn from the modern endurance
    #  literature and coaching practice.
    # ======================================================================

    # ---- Endurance / aerobic base (5) -----------------------------------
    "maf_aerobic_90": WorkoutTemplate(
        id="maf_aerobic_90",
        name="MAF aerobic — 90min HR-capped",
        category="endurance",
        purpose=(
            "Maffetone Aerobic Function — strictly HR-capped Z1/low-Z2. "
            "Power may sit at 55–62% FTP depending on fitness; the HR cap "
            "(180 − age, adjusted) is the controlling variable. Long-term "
            "aerobic-capacity tool when used 80%+ of weekly volume."
        ),
        framework_cited="Maffetone MAF · Hawley aerobic base",
        blocks=[
            IntervalBlock(name="MAF aerobic", duration_s=90 * 60, target_pct_ftp=0.60, target_rpe=3, zone=2),
        ],
        base_tss=60.0,
    ),
    "z2_progressive_90": WorkoutTemplate(
        id="z2_progressive_90",
        name="Progressive Z2 — 90min negative-split",
        category="endurance",
        purpose=(
            "Negative-split aerobic ride — start at 60% FTP, finish at 72%. "
            "Trains aerobic durability under accumulating fatigue without "
            "crossing LT1; teaches even-perceived-effort pacing."
        ),
        framework_cited="Friel · Allen & Coggan progressive endurance",
        blocks=[
            IntervalBlock(name="Easy Z2", duration_s=30 * 60, target_pct_ftp=0.60, target_rpe=4, zone=2),
            IntervalBlock(name="Mid Z2", duration_s=30 * 60, target_pct_ftp=0.66, target_rpe=5, zone=2),
            IntervalBlock(name="High Z2", duration_s=30 * 60, target_pct_ftp=0.72, target_rpe=6, zone=2),
        ],
        base_tss=78.0,
    ),

    # ---- Within-Z2 texture variants -------------------------------------
    # These three share the aerobic-base purpose of the flat 0.65 z2_endurance
    # stack but occupy *different bands inside Z2* (low / upper) or add a light
    # tempo touch, so the week's steady days differ in intensity AND duration
    # instead of being the identical 0.65-FTP ride repeated. All stay aerobic
    # (Seiler LIT) — this is within-Z2 variety, not added quality.
    "z2_endurance_low_100": WorkoutTemplate(
        id="z2_endurance_low_100",
        name="Low Z2 — 100min fat-burning endurance",
        category="endurance",
        purpose=(
            "Longer, easier low-Z2 (0.60 FTP) fat-oxidation ride — the "
            "'all-day pace' end of the aerobic band. Higher volume at lower "
            "strain; maximises fat-oxidation rate and time-in-zone without "
            "creeping toward LT1."
        ),
        framework_cited="San Millán low-Z2 · Seiler LIT · Maffetone aerobic",
        blocks=[
            IntervalBlock(
                name="Low endurance", duration_s=100 * 60,
                target_pct_ftp=0.60, target_rpe=3, zone=2,
            ),
        ],
        base_tss=62.0,
    ),
    "z2_endurance_upper_75": WorkoutTemplate(
        id="z2_endurance_upper_75",
        name="Upper Z2 — 75min high-aerobic",
        category="endurance",
        purpose=(
            "Shorter, firmer upper-Z2 (0.70 FTP) ride pressing the top of the "
            "aerobic band just under LT1. Higher aerobic stimulus per minute "
            "than the 0.65 steady ride while staying comfortably sub-threshold."
        ),
        framework_cited="San Millán upper-Z2 · Seiler LIT · Friel base",
        blocks=[
            IntervalBlock(
                name="High aerobic", duration_s=75 * 60,
                target_pct_ftp=0.70, target_rpe=5, zone=2,
            ),
        ],
        base_tss=63.0,
    ),
    "z2_endurance_tempo_touch_75": WorkoutTemplate(
        id="z2_endurance_tempo_touch_75",
        name="Endurance + tempo touches — 75min",
        category="endurance",
        purpose=(
            "Aerobic ride with three short ~0.76-FTP tempo touches folded into "
            "a 0.63-FTP Z2 base — a light aerobic-density stimulus that breaks "
            "up the steady day without making it a quality session. Still an "
            "easy day (>75% of the ride is Z2)."
        ),
        framework_cited="Seiler LIT · Friel aerobic-density touches",
        blocks=[
            IntervalBlock(name="Z2 base", duration_s=20 * 60, target_pct_ftp=0.63, target_rpe=4, zone=2),
            IntervalBlock(name="Tempo touch 1", duration_s=6 * 60, target_pct_ftp=0.76, target_rpe=6, zone=3),
            IntervalBlock(name="Z2 base", duration_s=12 * 60, target_pct_ftp=0.63, target_rpe=4, zone=2),
            IntervalBlock(name="Tempo touch 2", duration_s=6 * 60, target_pct_ftp=0.76, target_rpe=6, zone=3),
            IntervalBlock(name="Z2 base", duration_s=12 * 60, target_pct_ftp=0.63, target_rpe=4, zone=2),
            IntervalBlock(name="Tempo touch 3", duration_s=6 * 60, target_pct_ftp=0.76, target_rpe=6, zone=3),
            IntervalBlock(name="Z2 cool", duration_s=13 * 60, target_pct_ftp=0.60, target_rpe=3, zone=2),
        ],
        base_tss=58.0,
    ),
    "z2_long_240": WorkoutTemplate(
        id="z2_long_240",
        name="Long Z2 — 4h base ride",
        category="endurance",
        purpose=(
            "4-hour Z2 — the cornerstone of grand-tour / fondo base prep. "
            "Tests fueling, position durability, and Pw:HR decoupling at "
            "fixed power. Sunday session in Friel base 2 / build 1."
        ),
        framework_cited="San Millán Z2 · Friel base 2 · Hawley endurance",
        blocks=[
            IntervalBlock(name="Long endurance", duration_s=240 * 60, target_pct_ftp=0.65, target_rpe=5, zone=2),
        ],
        base_tss=180.0,
    ),
    "z2_fasted_60": WorkoutTemplate(
        id="z2_fasted_60",
        name="Fasted Z2 — 60min metabolic",
        category="endurance",
        purpose=(
            "Pre-breakfast 60-min Z2 — train-low-compete-high stimulus for "
            "fat-oxidation rate and mitochondrial signaling (PGC-1α). Cap at "
            "low Z2 — never push fasted to upper Z2."
        ),
        framework_cited="Hawley & Burke train-low · San Millán Z2",
        blocks=[
            IntervalBlock(name="Fasted Z2", duration_s=60 * 60, target_pct_ftp=0.60, target_rpe=4, zone=2),
        ],
        base_tss=42.0,
    ),
    "z2_endurance_surges_75": WorkoutTemplate(
        id="z2_endurance_surges_75",
        name="Playful Z2 — 75min with 6 surprise surges",
        category="endurance",
        purpose=(
            "An easy aerobic ride that stays a LIT day but breaks the trance: "
            "six 15-second playful out-of-the-saddle surges sprinkled through "
            "a 0.65-FTP Z2 base. Near-zero extra load, maximum boredom-kill — "
            "novelty feeds intrinsic motivation (González-Cutre) without "
            "touching the easy-day affect budget (Ekkekakis)."
        ),
        framework_cited="Seiler LIT · González-Cutre novelty · Ekkekakis affect",
        blocks=[
            IntervalBlock(name="Z2 base", duration_s=30 * 60, target_pct_ftp=0.65, target_rpe=4, zone=2),
            IntervalBlock(
                name="Surge play (6×15s sprints · long easy spins between)",
                duration_s=15 * 60, target_pct_ftp=0.70, target_rpe=6, zone=2,
            ),
            IntervalBlock(name="Z2 close", duration_s=30 * 60, target_pct_ftp=0.65, target_rpe=4, zone=2),
        ],
        base_tss=58.0,
    ),
    "recovery_60": WorkoutTemplate(
        id="recovery_60",
        name="Recovery spin — 60min",
        category="recovery",
        purpose="Longer parasympathetic-reset ride; high cadence, low force.",
        framework_cited="Coggan Z1 · Seiler LIT",
        blocks=[
            IntervalBlock(name="Easy spin", duration_s=60 * 60, target_pct_ftp=0.50, target_rpe=2, zone=1, cadence_low=90, cadence_high=100),
        ],
        base_tss=28.0,
    ),

    # ---- Tempo / sub-threshold (5) --------------------------------------
    "tempo_2x30": WorkoutTemplate(
        id="tempo_2x30",
        name="Long tempo — 2×30min @ 80% FTP",
        category="tempo",
        purpose=(
            "Coyle / Holloszy long-tempo durability — sustained sub-LT work "
            "for muscular endurance and substrate-utilisation efficiency."
        ),
        framework_cited="Coyle 1984 · Friel build 1 tempo",
        blocks=[
            _wu(),
            IntervalBlock(name="Tempo 1 (30min @ 80%)", duration_s=30 * 60, target_pct_ftp=0.80, target_rpe=6, zone=3),
            _rec(8 * 60),
            IntervalBlock(name="Tempo 2 (30min @ 80%)", duration_s=30 * 60, target_pct_ftp=0.80, target_rpe=6, zone=3),
            _cd(),
        ],
        base_tss=98.0,
    ),
    "tempo_4x15": WorkoutTemplate(
        id="tempo_4x15",
        name="Tempo — 4×15min @ 83% FTP",
        category="tempo",
        purpose="High-density tempo accumulation; aerobic-density ceiling lift.",
        framework_cited="Friel tempo · Allen & Coggan Z3",
        blocks=[
            _wu(),
            IntervalBlock(name="Tempo 1", duration_s=15 * 60, target_pct_ftp=0.83, target_rpe=6, zone=3),
            _rec(4 * 60),
            IntervalBlock(name="Tempo 2", duration_s=15 * 60, target_pct_ftp=0.83, target_rpe=6, zone=3),
            _rec(4 * 60),
            IntervalBlock(name="Tempo 3", duration_s=15 * 60, target_pct_ftp=0.83, target_rpe=6, zone=3),
            _rec(4 * 60),
            IntervalBlock(name="Tempo 4", duration_s=15 * 60, target_pct_ftp=0.83, target_rpe=6, zone=3),
            _cd(),
        ],
        base_tss=92.0,
    ),
    "tempo_progression_60": WorkoutTemplate(
        id="tempo_progression_60",
        name="Tempo progression — 60min ramping 75→90%",
        category="tempo",
        purpose=(
            "Continuous progression from upper Z2 into sweet-spot — trains "
            "the LT1→LT2 transition with one long aerobic effort."
        ),
        framework_cited="Friel progression · Coggan Z3-Z4 transition",
        blocks=[
            _wu(10 * 60),
            IntervalBlock(name="Progression 75%", duration_s=20 * 60, target_pct_ftp=0.75, target_rpe=5, zone=3),
            IntervalBlock(name="Progression 82%", duration_s=20 * 60, target_pct_ftp=0.82, target_rpe=6, zone=3),
            IntervalBlock(name="Progression 90%", duration_s=20 * 60, target_pct_ftp=0.90, target_rpe=7, zone=3),
            _cd(),
        ],
        base_tss=88.0,
    ),
    "tempo_bursts_3x10": WorkoutTemplate(
        id="tempo_bursts_3x10",
        name="Tempo + bursts — 3×10min @ 83% with 10s surges",
        category="tempo",
        purpose=(
            "Steady tempo reps with a 10-second seated surge every 2 minutes — "
            "adds neuromuscular snap and engagement to the aerobic workhorse "
            "without changing its recovery cost. The surges mimic group-ride "
            "reality; the base stays honest Z3."
        ),
        framework_cited="Friel tempo · Allen variable-power · CTS tempo+surges",
        blocks=[
            _wu(),
            IntervalBlock(name="Tempo+bursts 1 (10min @ 83% · 10s surge each 2min)", duration_s=10 * 60, target_pct_ftp=0.85, target_rpe=6, zone=3),
            _rec(4 * 60),
            IntervalBlock(name="Tempo+bursts 2 (10min @ 83% · 10s surge each 2min)", duration_s=10 * 60, target_pct_ftp=0.85, target_rpe=6, zone=3),
            _rec(4 * 60),
            IntervalBlock(name="Tempo+bursts 3 (10min @ 83% · 10s surge each 2min)", duration_s=10 * 60, target_pct_ftp=0.85, target_rpe=7, zone=3),
            _cd(),
        ],
        base_tss=72.0,
    ),
    "sub_threshold_2x40": WorkoutTemplate(
        id="sub_threshold_2x40",
        name="Sub-threshold — 2×40min @ 88% FTP",
        category="sweet_spot",
        purpose=(
            "80 min of sub-threshold work in two long reps — the heaviest "
            "sustainable sweet-spot dose for trained athletes. CTL builder "
            "for stage races and long climbs."
        ),
        framework_cited="Allen & Coggan SST · Friel build 2",
        blocks=[
            _wu(),
            IntervalBlock(name="Sub-LT 1 (40min @ 88%)", duration_s=40 * 60, target_pct_ftp=0.88, target_rpe=7, zone=3),
            _rec(10 * 60),
            IntervalBlock(name="Sub-LT 2 (40min @ 88%)", duration_s=40 * 60, target_pct_ftp=0.88, target_rpe=7, zone=3),
            _cd(),
        ],
        base_tss=145.0,
    ),
    "sweet_spot_3x20": WorkoutTemplate(
        id="sweet_spot_3x20",
        name="Sweet spot — 3×20min @ 90% FTP",
        category="sweet_spot",
        purpose="Classic 60-min-of-work SST — the canonical fondo CTL builder.",
        framework_cited="Allen & Coggan SST · Friel build 1-2",
        blocks=[
            _wu(),
            IntervalBlock(name="SST 1", duration_s=20 * 60, target_pct_ftp=0.90, target_rpe=7, zone=3),
            _rec(5 * 60),
            IntervalBlock(name="SST 2", duration_s=20 * 60, target_pct_ftp=0.90, target_rpe=7, zone=3),
            _rec(5 * 60),
            IntervalBlock(name="SST 3", duration_s=20 * 60, target_pct_ftp=0.90, target_rpe=7, zone=3),
            _cd(),
        ],
        base_tss=108.0,
    ),

    # ---- Threshold / LT2 (5) --------------------------------------------
    "threshold_pyramid": WorkoutTemplate(
        id="threshold_pyramid",
        name="Threshold pyramid — 1/2/3/4/3/2/1 min @ 100% FTP",
        category="threshold",
        purpose=(
            "Ascending-descending threshold pyramid; matched recoveries. "
            "Lactate-tolerance under varying-duration stress — useful for "
            "criterium / fluctuating-effort race demands."
        ),
        framework_cited="Friel pyramid · Coggan Z4",
        blocks=[
            _wu(),
            IntervalBlock(name="1 min", duration_s=60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(60),
            IntervalBlock(name="2 min", duration_s=2 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(2 * 60),
            IntervalBlock(name="3 min", duration_s=3 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(3 * 60),
            IntervalBlock(name="4 min", duration_s=4 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(3 * 60),
            IntervalBlock(name="3 min", duration_s=3 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(2 * 60),
            IntervalBlock(name="2 min", duration_s=2 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(60),
            IntervalBlock(name="1 min", duration_s=60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _cd(),
        ],
        base_tss=68.0,
    ),
    "threshold_hill_4x10": WorkoutTemplate(
        id="threshold_hill_4x10",
        name="Hill threshold — 4×10min @ 98% FTP",
        category="threshold",
        purpose=(
            "Long climbing-threshold reps on a 5–8% gradient (indoor: simulate "
            "with 60-65rpm on the trainer). Specific to sustained-climbing "
            "demands of fondos and grand tours."
        ),
        framework_cited="Friel climbing · Hansen 2007 cadence-specific",
        blocks=[
            _wu(),
            IntervalBlock(name="Hill 1", duration_s=10 * 60, target_pct_ftp=0.98, target_rpe=8, zone=4, cadence_low=65, cadence_high=80),
            _rec(5 * 60),
            IntervalBlock(name="Hill 2", duration_s=10 * 60, target_pct_ftp=0.98, target_rpe=8, zone=4, cadence_low=65, cadence_high=80),
            _rec(5 * 60),
            IntervalBlock(name="Hill 3", duration_s=10 * 60, target_pct_ftp=0.98, target_rpe=8, zone=4, cadence_low=65, cadence_high=80),
            _rec(5 * 60),
            IntervalBlock(name="Hill 4", duration_s=10 * 60, target_pct_ftp=0.98, target_rpe=8, zone=4, cadence_low=65, cadence_high=80),
            _cd(),
        ],
        base_tss=105.0,
    ),
    "over_under_4x12": WorkoutTemplate(
        id="over_under_4x12",
        name="Long over-unders — 4×(6×1/1min) @ 95/105%",
        category="threshold",
        purpose=(
            "Long over-under blocks — repeated lactate spikes and clearances. "
            "Trains LT2 resilience and shuttle-clearance more aggressively "
            "than the short 3×5min over-unders."
        ),
        framework_cited="Coggan over-unders · Bishop lactate clearance",
        blocks=[
            _wu(),
            IntervalBlock(name="OU set 1 (6×1/1min)", duration_s=12 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(5 * 60),
            IntervalBlock(name="OU set 2 (6×1/1min)", duration_s=12 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(5 * 60),
            IntervalBlock(name="OU set 3 (6×1/1min)", duration_s=12 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(5 * 60),
            IntervalBlock(name="OU set 4 (6×1/1min)", duration_s=12 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _cd(),
        ],
        base_tss=110.0,
        min_ftp_required=180,
    ),
    "threshold_descending": WorkoutTemplate(
        id="threshold_descending",
        name="Descending threshold — 15/12/10/8 min @ 95→102%",
        category="threshold",
        purpose=(
            "Reps shorten while intensity creeps up — trains the ability to "
            "find a higher gear as the rep clock shrinks. Pre-race specificity."
        ),
        framework_cited="Friel · Magness descending sets",
        blocks=[
            _wu(),
            IntervalBlock(name="15 min @ 95%", duration_s=15 * 60, target_pct_ftp=0.95, target_rpe=8, zone=4),
            _rec(5 * 60),
            IntervalBlock(name="12 min @ 98%", duration_s=12 * 60, target_pct_ftp=0.98, target_rpe=8, zone=4),
            _rec(5 * 60),
            IntervalBlock(name="10 min @ 100%", duration_s=10 * 60, target_pct_ftp=1.00, target_rpe=9, zone=4),
            _rec(5 * 60),
            IntervalBlock(name="8 min @ 102%", duration_s=8 * 60, target_pct_ftp=1.02, target_rpe=9, zone=4),
            _cd(),
        ],
        base_tss=98.0,
    ),
    "lactate_shuttles_3x8": WorkoutTemplate(
        id="lactate_shuttles_3x8",
        name="Lactate shuttles — 3×8min Z3/Z4 alternation",
        category="threshold",
        purpose=(
            "Alternating 2-min Z3 / 2-min Z4 inside each 8-min rep. Bishop's "
            "lactate-shuttle protocol — clearance kinetics and MCT4/MCT1 "
            "upregulation."
        ),
        framework_cited="Bishop lactate shuttle · Brooks lactate clearance",
        blocks=[
            _wu(),
            IntervalBlock(name="Shuttle 1 (2/2/2/2 @ 85/105%)", duration_s=8 * 60, target_pct_ftp=0.95, target_rpe=8, zone=4),
            _rec(5 * 60),
            IntervalBlock(name="Shuttle 2 (2/2/2/2 @ 85/105%)", duration_s=8 * 60, target_pct_ftp=0.95, target_rpe=8, zone=4),
            _rec(5 * 60),
            IntervalBlock(name="Shuttle 3 (2/2/2/2 @ 85/105%)", duration_s=8 * 60, target_pct_ftp=0.95, target_rpe=8, zone=4),
            _cd(),
        ],
        base_tss=70.0,
    ),

    # ---- VO2 (4 additional) ---------------------------------------------
    "vo2_hill_6x3": WorkoutTemplate(
        id="vo2_hill_6x3",
        name="Hill VO2 — 6×3min @ 115% FTP on climb",
        category="vo2",
        purpose=(
            "VO2 reps on a 5–8% gradient. Lower cadence + higher torque "
            "drives recruitment of Type IIa fibres at VO2 power; specific "
            "stimulus for sustained climbing demands."
        ),
        framework_cited="Friel climbing VO2 · Coggan Z5 · Hansen cadence",
        blocks=[
            _wu(),
            IntervalBlock(name="Hill VO2 1", duration_s=3 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5, cadence_low=70, cadence_high=85),
            _rec(3 * 60),
            IntervalBlock(name="Hill VO2 2", duration_s=3 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5, cadence_low=70, cadence_high=85),
            _rec(3 * 60),
            IntervalBlock(name="Hill VO2 3", duration_s=3 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5, cadence_low=70, cadence_high=85),
            _rec(3 * 60),
            IntervalBlock(name="Hill VO2 4", duration_s=3 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5, cadence_low=70, cadence_high=85),
            _rec(3 * 60),
            IntervalBlock(name="Hill VO2 5", duration_s=3 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5, cadence_low=70, cadence_high=85),
            _rec(3 * 60),
            IntervalBlock(name="Hill VO2 6", duration_s=3 * 60, target_pct_ftp=1.15, target_rpe=9, zone=5, cadence_low=70, cadence_high=85),
            _cd(),
        ],
        base_tss=82.0,
        min_ftp_required=180,
    ),
    "vo2_microbursts_30x15_45": WorkoutTemplate(
        id="vo2_microbursts_30x15_45",
        name="VO2 microbursts — 30×(15s on / 45s off) @ 150%",
        category="vo2",
        purpose=(
            "Short-burst micros — Stepto/Hawley style. 30 reps of 15s @ "
            "~150% FTP with 45s easy. Drives VO2 with surge-recovery cycling "
            "that mirrors race-winning attacks."
        ),
        framework_cited="Stepto & Hawley HIT · Coggan Z5+",
        blocks=[
            _wu(),
            IntervalBlock(name="Microburst set (30×15/45s)", duration_s=30 * 60, target_pct_ftp=1.20, target_rpe=9, zone=5),
            _cd(),
        ],
        base_tss=70.0,
        min_ftp_required=180,
    ),
    "vo2_3x6": WorkoutTemplate(
        id="vo2_3x6",
        name="Long VO2 — 3×6min @ 108% FTP",
        category="vo2",
        purpose=(
            "Longer-rep VO2 — sustained time-at-VO2 with bigger lactate "
            "accumulation. The hardest single-session VO2 stimulus most "
            "athletes can tolerate weekly."
        ),
        framework_cited="Friel VO2 · Coggan Z5",
        blocks=[
            _wu(),
            IntervalBlock(name="VO2 long 1", duration_s=6 * 60, target_pct_ftp=1.08, target_rpe=9, zone=5),
            _rec(4 * 60),
            IntervalBlock(name="VO2 long 2", duration_s=6 * 60, target_pct_ftp=1.08, target_rpe=9, zone=5),
            _rec(4 * 60),
            IntervalBlock(name="VO2 long 3", duration_s=6 * 60, target_pct_ftp=1.08, target_rpe=9, zone=5),
            _cd(),
        ],
        base_tss=72.0,
        min_ftp_required=180,
    ),
    "vo2_descending_5_4_3_2_1": WorkoutTemplate(
        id="vo2_descending_5_4_3_2_1",
        name="VO2 descending ladder — 5/4/3/2/1 min",
        category="vo2",
        purpose=(
            "Descending-rep VO2 ladder, intensity climbing as reps shorten "
            "(110→125% FTP). Trains the ability to dig deeper as the rep "
            "gets shorter — race-finish specificity."
        ),
        framework_cited="Friel ladder · Coggan Z5/Z6",
        blocks=[
            _wu(),
            IntervalBlock(name="5 min @ 110%", duration_s=5 * 60, target_pct_ftp=1.10, target_rpe=9, zone=5),
            _rec(4 * 60),
            IntervalBlock(name="4 min @ 113%", duration_s=4 * 60, target_pct_ftp=1.13, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="3 min @ 117%", duration_s=3 * 60, target_pct_ftp=1.17, target_rpe=9, zone=5),
            _rec(3 * 60),
            IntervalBlock(name="2 min @ 122%", duration_s=2 * 60, target_pct_ftp=1.22, target_rpe=10, zone=5),
            _rec(2 * 60),
            IntervalBlock(name="1 min @ 130%", duration_s=60, target_pct_ftp=1.30, target_rpe=10, zone=6),
            _cd(),
        ],
        base_tss=72.0,
        min_ftp_required=180,
    ),

    # ---- Anaerobic / neuromuscular (4 additional) -----------------------
    "anaerobic_capacity_5x3_130": WorkoutTemplate(
        id="anaerobic_capacity_5x3_130",
        name="Anaerobic capacity — 5×3min @ 130% FTP",
        category="anaerobic",
        purpose=(
            "Above-VO2 anaerobic-capacity work — depletes the anaerobic "
            "bucket repeatedly. Build phase: develops repeated-effort "
            "tolerance for race attacks."
        ),
        framework_cited="Coggan anaerobic capacity · Bishop W'",
        blocks=[
            _wu(),
            IntervalBlock(name="AC 1", duration_s=3 * 60, target_pct_ftp=1.30, target_rpe=10, zone=6),
            _rec(5 * 60),
            IntervalBlock(name="AC 2", duration_s=3 * 60, target_pct_ftp=1.30, target_rpe=10, zone=6),
            _rec(5 * 60),
            IntervalBlock(name="AC 3", duration_s=3 * 60, target_pct_ftp=1.30, target_rpe=10, zone=6),
            _rec(5 * 60),
            IntervalBlock(name="AC 4", duration_s=3 * 60, target_pct_ftp=1.30, target_rpe=10, zone=6),
            _rec(5 * 60),
            IntervalBlock(name="AC 5", duration_s=3 * 60, target_pct_ftp=1.30, target_rpe=10, zone=6),
            _cd(),
        ],
        base_tss=68.0,
        min_ftp_required=180,
    ),
    "anaerobic_8x90s": WorkoutTemplate(
        id="anaerobic_8x90s",
        name="Lactate tolerance — 8×90s @ 135% FTP",
        category="anaerobic",
        purpose=(
            "90-second above-VO2 reps — lactate-tolerance / W' depletion. "
            "The crit-rider's bread-and-butter session."
        ),
        framework_cited="Skiba W' · Coggan Z6",
        blocks=[
            _wu(),
            IntervalBlock(name="LT 1", duration_s=90, target_pct_ftp=1.35, target_rpe=10, zone=6),
            _rec(3 * 60),
            IntervalBlock(name="LT 2", duration_s=90, target_pct_ftp=1.35, target_rpe=10, zone=6),
            _rec(3 * 60),
            IntervalBlock(name="LT 3", duration_s=90, target_pct_ftp=1.35, target_rpe=10, zone=6),
            _rec(3 * 60),
            IntervalBlock(name="LT 4", duration_s=90, target_pct_ftp=1.35, target_rpe=10, zone=6),
            _rec(3 * 60),
            IntervalBlock(name="LT 5", duration_s=90, target_pct_ftp=1.35, target_rpe=10, zone=6),
            _rec(3 * 60),
            IntervalBlock(name="LT 6", duration_s=90, target_pct_ftp=1.35, target_rpe=10, zone=6),
            _rec(3 * 60),
            IntervalBlock(name="LT 7", duration_s=90, target_pct_ftp=1.35, target_rpe=10, zone=6),
            _rec(3 * 60),
            IntervalBlock(name="LT 8", duration_s=90, target_pct_ftp=1.35, target_rpe=10, zone=6),
            _cd(),
        ],
        base_tss=60.0,
        min_ftp_required=180,
    ),
    "neuromuscular_spinup_6x30": WorkoutTemplate(
        id="neuromuscular_spinup_6x30",
        name="Spin-up sprints — 6×30s @ 130%, high cadence",
        category="anaerobic",
        purpose=(
            "Open-gear, high-cadence (110–120rpm) 30-second sprints. Develops "
            "leg speed and neuromuscular recruitment without the high force "
            "of seated big-gear work."
        ),
        framework_cited="Mujika neuromuscular · Hansen cadence",
        blocks=[
            _wu(),
            IntervalBlock(name="Spin-up set (6×30s · 4-min easy between)", duration_s=6 * (30 + 4 * 60), target_pct_ftp=1.30, target_rpe=10, zone=6, cadence_low=110, cadence_high=125),
            _cd(),
        ],
        base_tss=50.0,
    ),
    "neuromuscular_standing_6x10": WorkoutTemplate(
        id="neuromuscular_standing_6x10",
        name="Standing-start power — 6×10s from a near-stop",
        category="anaerobic",
        purpose=(
            "Standing 10-second efforts from 50rpm in a big gear — develops "
            "maximal force and torque the seated spin-up can't reach. Track-"
            "sprint methodology, useful for road sprinters too."
        ),
        framework_cited="Coggan NM · track sprint methodology",
        blocks=[
            _wu(),
            IntervalBlock(name="Standing-start set (6×10s · 4-min easy)", duration_s=6 * (10 + 4 * 60), target_pct_ftp=2.00, target_rpe=10, zone=7, cadence_low=50, cadence_high=85),
            _cd(),
        ],
        base_tss=42.0,
    ),

    # ---- Specialty / drills (4) -----------------------------------------
    "cadence_high_fsr_6x3": WorkoutTemplate(
        id="cadence_high_fsr_6x3",
        name="Fast-pedal drills — 6×3min @ 110rpm, Z2 power",
        # Categorized as 'recovery' even though power is Z2 — this is a skill /
        # neural drill, not a load-building endurance session, and treating it
        # as a recovery-tier item keeps it out of the endurance shortening
        # cascade in workout_modifier (which would otherwise substitute a real
        # endurance ride for this drill).
        category="recovery",
        purpose=(
            "Fast-spin recruitment drills (FSR) — develops smooth high-cadence "
            "pedaling without raising power above Z2. Useful early-season "
            "neural-efficiency work."
        ),
        framework_cited="Carmichael CTS FastPedal · Friel skill",
        blocks=[
            _wu(),
            IntervalBlock(name="FSR set (6×3min @ 110rpm)", duration_s=6 * (3 * 60 + 2 * 60), target_pct_ftp=0.65, target_rpe=5, zone=2, cadence_low=105, cadence_high=120),
            _cd(),
        ],
        base_tss=45.0,
    ),
    "cadence_low_lcf_4x6": WorkoutTemplate(
        id="cadence_low_lcf_4x6",
        name="Low-cadence force — 4×6min @ 60rpm, Z3",
        category="tempo",
        purpose=(
            "Low-cadence force reps (LCF) — high torque at modest power. "
            "Type-IIa recruitment + on-bike strength stimulus without the "
            "knee load of true big-gear sprints."
        ),
        framework_cited="Friel force · Hansen 2007 · Lucia 2004",
        blocks=[
            _wu(),
            IntervalBlock(name="LCF 1", duration_s=6 * 60, target_pct_ftp=0.85, target_rpe=7, zone=3, cadence_low=55, cadence_high=65),
            _rec(3 * 60),
            IntervalBlock(name="LCF 2", duration_s=6 * 60, target_pct_ftp=0.85, target_rpe=7, zone=3, cadence_low=55, cadence_high=65),
            _rec(3 * 60),
            IntervalBlock(name="LCF 3", duration_s=6 * 60, target_pct_ftp=0.85, target_rpe=7, zone=3, cadence_low=55, cadence_high=65),
            _rec(3 * 60),
            IntervalBlock(name="LCF 4", duration_s=6 * 60, target_pct_ftp=0.85, target_rpe=7, zone=3, cadence_low=55, cadence_high=65),
            _cd(),
        ],
        base_tss=58.0,
    ),
    "crit_simulation_stochastic": WorkoutTemplate(
        id="crit_simulation_stochastic",
        name="Crit simulation — stochastic surges 60min",
        category="threshold",
        purpose=(
            "Stochastic race simulation — 60-min ride with unpredictable 20–"
            "45-second surges to 120–140% FTP every 90–180 seconds, on a Z3 "
            "tempo base. Replicates crit/road-race demands."
        ),
        framework_cited="Allen race simulation · Phinney 2016 stochastic",
        blocks=[
            _wu(),
            IntervalBlock(name="Crit set (60min variable, base Z3, surges 130%)", duration_s=60 * 60, target_pct_ftp=0.90, target_rpe=8, zone=4),
            _cd(),
        ],
        base_tss=92.0,
        min_ftp_required=180,
    ),
    "group_ride_variable": WorkoutTemplate(
        id="group_ride_variable",
        name="Group-ride simulation — 90min variable",
        category="tempo",
        purpose=(
            "Variable-power group-ride simulation — Z2 base with periodic "
            "Z4 surges (1–3 min) and recoveries. Trains race-pack durability "
            "and pacing flexibility."
        ),
        framework_cited="Allen variable-power training",
        blocks=[
            _wu(),
            IntervalBlock(name="Group ride (90min variable)", duration_s=90 * 60, target_pct_ftp=0.75, target_rpe=6, zone=3),
            _cd(),
        ],
        base_tss=85.0,
    ),

    # ---- Field tests (2) -------------------------------------------------
    "ftp_test_20min": WorkoutTemplate(
        id="ftp_test_20min",
        name="FTP test — 20-min max effort",
        category="threshold",
        purpose=(
            "Standard 20-min max-effort field test. New FTP = avg power × "
            "0.95. Use after a recovery week and at the start of each new "
            "training block."
        ),
        framework_cited="Allen & Coggan 20-min protocol",
        blocks=[
            _wu(20 * 60),
            IntervalBlock(name="5-min openers @ 100%", duration_s=5 * 60, target_pct_ftp=1.00, target_rpe=8, zone=4),
            _rec(10 * 60),
            IntervalBlock(name="20-min ALL-OUT test", duration_s=20 * 60, target_pct_ftp=1.05, target_rpe=10, zone=4),
            _cd(),
        ],
        base_tss=88.0,
    ),
    "ftp_ramp_test": WorkoutTemplate(
        id="ftp_ramp_test",
        name="FTP ramp test — Coggan progressive",
        category="threshold",
        purpose=(
            "Progressive 1-min ramp to failure starting at 100W +20W/min "
            "(scale for fitness). FTP = 75% of MAP (max 1-min sustained). "
            "Lower acute fatigue than the 20-min test."
        ),
        framework_cited="Coggan ramp test · MAP→FTP regression",
        blocks=[
            _wu(15 * 60),
            IntervalBlock(name="Ramp to failure (1-min steps)", duration_s=25 * 60, target_pct_ftp=1.00, target_rpe=10, zone=4),
            _cd(),
        ],
        base_tss=55.0,
    ),

    # ---- Taper / race-pace confidence (1) -------------------------------
    "race_pace_60_95": WorkoutTemplate(
        id="race_pace_60_95",
        name="Race-pace confidence — 60min @ 95% FTP",
        category="threshold",
        purpose=(
            "Single sustained 60-min effort at 95% FTP — taper-week "
            "confidence ride. Confirms the engine is firing before race day "
            "without depleting freshness."
        ),
        framework_cited="Mujika taper · Friel race-week",
        blocks=[
            _wu(15 * 60),
            IntervalBlock(name="Race-pace 60min @ 95%", duration_s=60 * 60, target_pct_ftp=0.95, target_rpe=8, zone=4),
            _cd(),
        ],
        base_tss=95.0,
        min_ftp_required=180,
    ),
}


# ======================================================================
#  Adaptation metadata — populated for EVERY template (plan-engine v2)
# ======================================================================
# (physiological_target, block_placement, min_readiness, indoor_ok, fun_factor)
# Values follow the evidence base: VO2/threshold need 'high' readiness
# (HRV-gated per Kiviniemi/Javaloyes), recovery/skill work is always 'low',
# rides ≥3h are flagged indoor_ok=False, and fun_factor 3 marks the
# novelty/affect formats (surges, over-unders, race sims, ladders).

_META: dict[str, tuple[str, BlockPlacement, MinReadiness, bool, int]] = {
    # rest / recovery / skills
    "rest_day":                    ("recovery", "any", "low", True, 1),
    "recovery_30":                 ("recovery", "any", "low", True, 1),
    "recovery_60":                 ("recovery", "any", "low", True, 1),
    "cadence_high_fsr_6x3":        ("pedaling_skill", "any", "low", True, 2),
    # endurance / aerobic base
    "z2_endurance_60":             ("aerobic_base", "any", "low", True, 1),
    "z2_endurance_90":             ("aerobic_base", "any", "low", True, 1),
    "z2_long_120":                 ("durability", "base", "medium", True, 2),
    "z2_long_180":                 ("durability", "base", "medium", False, 2),
    "z2_long_240":                 ("durability", "base", "medium", False, 2),
    "z2_climbing_long":            ("climbing_strength", "build", "medium", False, 3),
    "maf_aerobic_90":              ("aerobic_base", "base", "low", True, 1),
    "z2_progressive_90":           ("aerobic_base", "base", "medium", True, 2),
    "z2_endurance_low_100":        ("fat_oxidation", "base", "low", True, 1),
    "z2_endurance_upper_75":       ("aerobic_base", "base", "medium", True, 2),
    "z2_endurance_tempo_touch_75": ("aerobic_base", "base", "medium", True, 2),
    "z2_endurance_surges_75":      ("aerobic_base", "any", "medium", True, 3),
    "z2_fasted_60":                ("fat_oxidation", "base", "medium", True, 1),
    # tempo / sub-threshold
    "tempo_3x10":                  ("muscular_endurance", "base", "medium", True, 2),
    "tempo_2x30":                  ("muscular_endurance", "build", "medium", True, 2),
    "tempo_4x15":                  ("muscular_endurance", "build", "medium", True, 2),
    "tempo_progression_60":        ("muscular_endurance", "base", "medium", True, 2),
    "tempo_bursts_3x10":           ("muscular_endurance", "any", "medium", True, 3),
    "cadence_low_lcf_4x6":         ("climbing_strength", "base", "medium", True, 2),
    "group_ride_variable":         ("race_specificity", "any", "medium", False, 3),
    # sweet spot
    "sweet_spot_2x20":             ("ftp", "any", "medium", True, 2),
    "sweet_spot_3x20":             ("ftp", "build", "medium", True, 2),
    "sweet_spot_4x15":             ("ftp", "build", "medium", True, 2),
    "sub_threshold_2x40":          ("ftp", "build", "high", True, 1),
    # threshold
    "threshold_2x15":              ("ftp", "build", "high", True, 2),
    "over_under_3x5":              ("lactate_clearance", "build", "high", True, 3),
    "threshold_seiler_4x8":        ("ftp", "build", "high", True, 2),
    "threshold_pyramid":           ("lactate_tolerance", "build", "high", True, 3),
    "threshold_hill_4x10":         ("climbing_strength", "build", "high", True, 2),
    "over_under_4x12":             ("lactate_clearance", "build", "high", True, 2),
    "threshold_descending":        ("ftp", "peak", "high", True, 2),
    "lactate_shuttles_3x8":        ("lactate_clearance", "build", "high", True, 2),
    "crit_simulation_stochastic":  ("race_specificity", "peak", "high", True, 3),
    "ftp_test_20min":              ("assessment", "any", "high", True, 2),
    "ftp_ramp_test":               ("assessment", "any", "high", True, 2),
    "race_pace_60_95":             ("race_specificity", "taper", "high", True, 2),
    # vo2
    "vo2_5x4":                     ("vo2max", "build", "high", True, 2),
    "vo2_micro_30x30":             ("vo2max", "build", "high", True, 3),
    "vo2_ronnestad_3x13":          ("vo2max", "build", "high", True, 3),
    "vo2_map_5x3":                 ("vo2max", "build", "high", True, 2),
    "polarized_long_z2_4x4":       ("durability", "build", "high", False, 3),
    "vo2_hill_6x3":                ("vo2max", "build", "high", True, 2),
    "vo2_microbursts_30x15_45":    ("vo2max", "build", "high", True, 3),
    "vo2_3x6":                     ("vo2max", "build", "high", True, 2),
    "vo2_descending_5_4_3_2_1":    ("vo2max", "peak", "high", True, 3),
    # anaerobic / neuromuscular
    "anaerobic_capacity_5x3_130":  ("anaerobic_capacity", "peak", "high", True, 2),
    "anaerobic_8x90s":             ("anaerobic_capacity", "peak", "high", True, 2),
    "anaerobic_tabata_8x20_10":    ("anaerobic_capacity", "peak", "high", True, 2),
    "neuromuscular_sprints_8x15":  ("neuromuscular_power", "any", "medium", True, 3),
    "neuromuscular_spinup_6x30":   ("neuromuscular_power", "any", "medium", True, 3),
    "neuromuscular_standing_6x10": ("neuromuscular_power", "any", "medium", False, 3),
}

# Apply the metadata to the frozen templates (dataclasses.replace keeps the
# instances immutable). Every template MUST have a row in _META — enforced by
# the assertion so a new template can't ship without adaptation metadata.
_missing = set(TEMPLATES) - set(_META)
assert not _missing, f"templates missing adaptation metadata: {_missing}"
for _tid, (_target, _placement, _readiness, _indoor, _fun) in _META.items():
    _t = TEMPLATES.get(_tid)
    if _t is not None:
        TEMPLATES[_tid] = replace(
            _t,
            physiological_target=_target,
            block_placement=_placement,
            min_readiness=_readiness,
            indoor_ok=_indoor,
            fun_factor=_fun,
        )


# ======================================================================
#  Endurance trim ladder — duration-first trimming (plan-engine v2)
# ======================================================================
# When a week runs over its TSS budget, the plan trims the DURATION of an
# endurance day (a shorter Z2 variant still counts aerobically) before it
# ever downgrades to a recovery spin or inserts an extra rest day — a 12h/wk
# athlete must never silently receive a 5h week. Ordered by descending
# base_tss; deliberately excludes special-purpose variants (fasted, MAF).

ENDURANCE_TRIM_LADDER: tuple[str, ...] = (
    "z2_long_120",              # 90 TSS · 120 min
    "z2_progressive_90",        # 78 TSS · 90 min
    "z2_endurance_90",          # 68 TSS · 90 min
    "z2_endurance_upper_75",    # 63 TSS · 75 min
    "z2_endurance_low_100",     # 62 TSS · 100 min
    "z2_endurance_surges_75",   # 58 TSS · 75 min
    "z2_endurance_tempo_touch_75",  # 58 TSS · 75 min
    "z2_endurance_60",          # 45 TSS · 60 min
)


def pick_trim_variant(
    max_tss: float,
    max_minutes: int,
    exclude_id: str | None = None,
) -> WorkoutTemplate | None:
    """Largest endurance variant fitting both a TSS cap and a time window.

    Returns None when nothing on the ladder fits (callers then fall back to a
    recovery spin / rest day). Used by the mesocycle filler trim and by
    plan-absorption's rebalance so both trim duration before killing a day.
    """
    for tid in ENDURANCE_TRIM_LADDER:
        if tid == exclude_id:
            continue
        t = TEMPLATES.get(tid)
        if t is None:
            continue
        minutes = int(round(sum(b.duration_s for b in t.blocks) / 60))
        if t.base_tss <= max_tss and minutes <= max_minutes:
            return t
    return None


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


def _default_cadence_for_zone(zone: int) -> tuple[int, int]:
    """Default cadence range when a block doesn't override.

    Friel & Coggan defaults:
        Z1 (recovery)    : 80-95 — easy spin
        Z2 (endurance)   : 85-95 — aerobic natural
        Z3 (tempo)       : 85-95 — tempo
        Z4 (threshold)   : 90-100 — threshold cadence
        Z5+ (VO2/AC)     : 95-110 — high RPM
    """
    if zone <= 1:
        return (80, 95)
    if zone == 2:
        return (85, 95)
    if zone == 3:
        return (85, 95)
    if zone == 4:
        return (90, 100)
    return (95, 110)


def parametrize_template(
    template: WorkoutTemplate,
    ftp: int,
    duration_scale: float = 1.0,
    lthr: int | None = None,
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
        # Cadence: prefer block-level override, else fall back to a sensible
        # zone-based default (Friel / Coggan conventions).
        c_low, c_high = block.cadence_low, block.cadence_high
        if c_low is None or c_high is None:
            c_low, c_high = _default_cadence_for_zone(block.zone)
        # HR target band — only when LTHR is known. The helper returns None
        # for Z7 sprints (HR can't catch up to a 10-second effort).
        from app.services.hr_zones import hr_band_for_zone
        hr_band = hr_band_for_zone(block.zone, lthr)
        hr_low, hr_high = (hr_band[0], hr_band[1]) if hr_band else (None, None)
        resolved.append(
            ResolvedBlock(
                name=block.name,
                duration_s=duration,
                target_watts_low=low,
                target_watts_high=high,
                target_pct_ftp=round(block.target_pct_ftp, 3),
                zone=block.zone,
                rpe=block.target_rpe,
                cadence_low=c_low,
                cadence_high=c_high,
                target_hr_low=hr_low,
                target_hr_high=hr_high,
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
                "cadence_low": b.cadence_low,
                "cadence_high": b.cadence_high,
                "target_hr_low": b.target_hr_low,
                "target_hr_high": b.target_hr_high,
            }
            for b in pw.blocks
        ],
        # `why_this_workout` is filled in by coach_service (LLM or rule-based);
        # keep the field slot here so the serialiser shape is stable.
        "why_this_workout": None,
    }
