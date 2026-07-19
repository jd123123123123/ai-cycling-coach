"""Run workout templates — pace-zone based session library for RUN programs.

Runs have no power templates: blocks are expressed as Friel RUN zones
(Z1 recovery … Z5 VO₂max, semantics matching the frontend's RUN_PACE / RUN_HR
bands) + RPE + a short cue description. Absolute paces/HR are materialised
client-side from the athlete's threshold pace / running LTHR — this library
never fabricates a pace.

Design invariants (mirrors workout_templates.py):
    - Deterministic structures the LLM must PICK, never invent.
    - Warm-up / cool-down are easy jogging; main blocks carry the stimulus.
    - `run_interval_structure(t)` renders the PlannedWorkout.interval_structure
      JSON: {"intervals": [{duration_s, duration_seconds, zone, rpe,
      description, name}]} — `duration_s` is the run-program contract and
      `duration_seconds` keeps the existing week readers rendering runs.

References: Friel running zones, Daniels VO₂ repeats (400/800), classic
strides + progression-run practice.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

RunCategory = Literal["recovery", "endurance", "tempo", "threshold", "vo2"]


@dataclass(frozen=True)
class RunBlock:
    """One segment of a run template — zone (Friel run Z1–Z5) + RPE + cue."""

    name: str          # "Warm-up", "Rep", "Float", "Cool-down", ...
    duration_s: int
    zone: int          # Friel run zone 1..5
    rpe: int           # 1-10
    description: str   # short cue ("relaxed conversational", "5k effort", ...)


@dataclass(frozen=True)
class RunTemplate:
    id: str            # stable id like "run_vo2_400s"
    name: str          # human display ("VO₂ 400s — 10×90s")
    category: RunCategory
    purpose: str       # short prose ("Raises the aerobic ceiling")
    blocks: list[RunBlock]

    @property
    def duration_s(self) -> int:
        return sum(b.duration_s for b in self.blocks)


def _wu(duration_s: int = 600) -> RunBlock:
    return RunBlock("Warm-up", duration_s, 1, 3, "Easy jog, build to relaxed rhythm")


def _cd(duration_s: int = 600) -> RunBlock:
    return RunBlock("Cool-down", duration_s, 1, 2, "Easy jog, shake it out")


def _jog(duration_s: int, name: str = "Recovery jog") -> RunBlock:
    return RunBlock(name, duration_s, 1, 2, "Very easy jog or walk")


def _reps(n: int, work: RunBlock, rec: RunBlock) -> list[RunBlock]:
    """n× (work + recovery), dropping the trailing recovery."""
    out: list[RunBlock] = []
    for i in range(n):
        out.append(work)
        if i < n - 1:
            out.append(rec)
    return out


RUN_TEMPLATES: dict[str, RunTemplate] = {
    # ---- Recovery / easy ------------------------------------------------
    "run_recovery_25": RunTemplate(
        id="run_recovery_25",
        name="Recovery Jog — 25min",
        category="recovery",
        purpose="Flush the legs; blood flow without training stress.",
        blocks=[RunBlock("Easy jog", 25 * 60, 1, 2, "Truly easy — nose-breathing pace")],
    ),
    "run_easy_30": RunTemplate(
        id="run_easy_30",
        name="Easy Run — 30min",
        category="endurance",
        purpose="Aerobic maintenance; conversational the whole way.",
        blocks=[RunBlock("Steady easy", 30 * 60, 2, 3, "Relaxed conversational rhythm")],
    ),
    "run_easy_45": RunTemplate(
        id="run_easy_45",
        name="Easy Run — 45min",
        category="endurance",
        purpose="Aerobic base volume without next-day cost.",
        blocks=[RunBlock("Steady easy", 45 * 60, 2, 3, "Relaxed conversational rhythm")],
    ),
    # ---- Strides --------------------------------------------------------
    "run_strides_8x20": RunTemplate(
        id="run_strides_8x20",
        name="Strides — 8×20s",
        category="endurance",
        purpose="Leg speed and mechanics on fresh-enough legs; near-zero fatigue cost.",
        blocks=[
            RunBlock("Easy run", 25 * 60, 2, 3, "Relaxed conversational rhythm"),
            *_reps(
                8,
                RunBlock("Stride", 20, 5, 8, "Fast but relaxed — build to ~mile effort, tall posture"),
                _jog(70, "Walk/jog back"),
            ),
            _cd(300),
        ],
    ),
    # ---- VO₂ repeats ----------------------------------------------------
    "run_vo2_400s": RunTemplate(
        id="run_vo2_400s",
        name="VO₂ 400s — 10×90s",
        category="vo2",
        purpose="Classic 400m-style repeats; raises the aerobic ceiling.",
        blocks=[
            _wu(),
            *_reps(
                10,
                RunBlock("Rep", 90, 5, 9, "~3k–5k effort, quick and controlled"),
                _jog(90),
            ),
            _cd(),
        ],
    ),
    "run_vo2_800s": RunTemplate(
        id="run_vo2_800s",
        name="VO₂ 800s — 5×3min",
        category="vo2",
        purpose="800m-style repeats; longer time at VO₂max than 400s.",
        blocks=[
            _wu(),
            *_reps(
                5,
                RunBlock("Rep", 180, 5, 9, "5k effort — strong but repeatable"),
                _jog(150),
            ),
            _cd(),
        ],
    ),
    # ---- Tempo / threshold ---------------------------------------------
    "run_tempo_20": RunTemplate(
        id="run_tempo_20",
        name="Tempo Run — 20min",
        category="tempo",
        purpose="Comfortably-hard continuous tempo; lifts sustainable pace.",
        blocks=[
            _wu(),
            RunBlock("Tempo", 20 * 60, 3, 6, "Comfortably hard — short sentences only"),
            _cd(),
        ],
    ),
    "run_tempo_2x15": RunTemplate(
        id="run_tempo_2x15",
        name="Threshold — 2×15min",
        category="threshold",
        purpose="Cruise intervals at threshold; the key 10k–HM stimulus.",
        blocks=[
            _wu(),
            RunBlock("Threshold", 15 * 60, 4, 7, "Around threshold — controlled discomfort"),
            _jog(180),
            RunBlock("Threshold", 15 * 60, 4, 7, "Hold the same effort, not more"),
            _cd(),
        ],
    ),
    # ---- Progression ----------------------------------------------------
    "run_progression_45": RunTemplate(
        id="run_progression_45",
        name="Progression Run — 45min",
        category="tempo",
        purpose="Finish faster than you start; fatigue-resistance with control.",
        blocks=[
            RunBlock("Easy third", 15 * 60, 2, 3, "Settle in, relaxed"),
            RunBlock("Steady third", 15 * 60, 3, 5, "Lift to comfortably hard"),
            RunBlock("Strong third", 12 * 60, 4, 7, "Strong close around threshold"),
            _cd(180),
        ],
    ),
    # ---- Long runs ------------------------------------------------------
    "run_long_60": RunTemplate(
        id="run_long_60",
        name="Long Run — 60min",
        category="endurance",
        purpose="Aerobic endurance; the weekly volume anchor.",
        blocks=[RunBlock("Long steady", 60 * 60, 2, 4, "Steady endurance — patient rhythm")],
    ),
    "run_long_75": RunTemplate(
        id="run_long_75",
        name="Long Run — 75min",
        category="endurance",
        purpose="Extended aerobic endurance; durability for race day.",
        blocks=[RunBlock("Long steady", 75 * 60, 2, 4, "Steady endurance — patient rhythm")],
    ),
    "run_long_ladder_100": RunTemplate(
        id="run_long_ladder_100",
        name="Long Run Ladder — 100min",
        category="endurance",
        purpose="Long run with tempo touches — race-specific fatigue resistance.",
        blocks=[
            RunBlock("Easy opening", 30 * 60, 2, 3, "Settle into relaxed endurance"),
            RunBlock("Tempo touch", 8 * 60, 3, 6, "Lift to comfortably hard"),
            RunBlock("Float", 7 * 60, 2, 4, "Back to steady endurance"),
            RunBlock("Tempo touch", 8 * 60, 3, 6, "Same lift — smooth, not strained"),
            RunBlock("Float", 7 * 60, 2, 4, "Back to steady endurance"),
            RunBlock("Tempo touch", 8 * 60, 3, 6, "Last lift — hold form"),
            RunBlock("Steady close", 26 * 60, 2, 4, "Bring it home steady"),
            _cd(360),
        ],
    ),
}


def get_run_template(template_id: str) -> RunTemplate | None:
    return RUN_TEMPLATES.get(template_id)


def run_interval_structure(t: RunTemplate) -> dict:
    """PlannedWorkout.interval_structure JSON for a run template.

    Emits BOTH `duration_s` (run-program contract) and `duration_seconds`
    (existing week/day readers) so run rows render everywhere today.
    """
    return {
        "intervals": [
            {
                "name": b.name,
                "duration_s": b.duration_s,
                "duration_seconds": b.duration_s,
                "zone": b.zone,
                "rpe": b.rpe,
                "description": b.description,
            }
            for b in t.blocks
        ]
    }
