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

from dataclasses import dataclass, replace
from typing import Literal

RunCategory = Literal["recovery", "endurance", "tempo", "threshold", "vo2"]

# Adaptation metadata vocab — mirrors workout_templates (plan-engine v2).
RunBlockPlacement = Literal["base", "build", "peak", "taper", "any"]
RunMinReadiness = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class RunBlock:
    """One segment of a run template — zone (Friel run Z1–Z5) + RPE + cue."""

    name: str          # "Warm-up", "Rep", "Float", "Cool-down", ...
    duration_s: int
    zone: int          # Friel run zone 1..5
    rpe: int           # 1-10
    description: str   # short cue ("relaxed conversational", "5k effort", ...)
    description_de: str = ""  # German cue, beginner-safe plain language


@dataclass(frozen=True)
class RunTemplate:
    id: str            # stable id like "run_vo2_400s"
    name: str          # human display ("VO₂ 400s — 10×90s")
    category: RunCategory
    purpose: str       # short prose ("Raises the aerobic ceiling")
    blocks: list[RunBlock]
    # ── Adaptation metadata (plan-engine v2) — same semantics as the bike
    # library: the adaptation engine swaps sessions by readiness/placement
    # instead of deleting the day. fun_factor 1-3 biases variety rotation.
    physiological_target: str = "aerobic_base"
    block_placement: RunBlockPlacement = "any"
    min_readiness: RunMinReadiness = "medium"
    indoor_ok: bool = True
    fun_factor: int = 2
    # ── Localization (de) — applied from _RUN_I18N_DE below. purpose_de is
    # plain, beginner-safe German (no lab jargon), safe for SIMPLE mode.
    name_de: str = ""
    purpose_de: str = ""

    @property
    def duration_s(self) -> int:
        return sum(b.duration_s for b in self.blocks)


def _wu(duration_s: int = 600) -> RunBlock:
    return RunBlock(
        "Warm-up", duration_s, 1, 3,
        "Easy jog, build to relaxed rhythm",
        "Locker eintraben, in einen entspannten Rhythmus finden",
    )


def _cd(duration_s: int = 600) -> RunBlock:
    return RunBlock(
        "Cool-down", duration_s, 1, 2,
        "Easy jog, shake it out",
        "Locker austraben, Beine ausschütteln",
    )


def _jog(duration_s: int, name: str = "Recovery jog") -> RunBlock:
    return RunBlock(
        name, duration_s, 1, 2,
        "Very easy jog or walk",
        "Ganz lockeres Traben oder Gehen",
    )


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
        blocks=[RunBlock("Easy jog", 25 * 60, 1, 2, "Truly easy — nose-breathing pace", "Wirklich locker — so ruhig, dass du durch die Nase atmen kannst")],
    ),
    "run_easy_30": RunTemplate(
        id="run_easy_30",
        name="Easy Run — 30min",
        category="endurance",
        purpose="Aerobic maintenance; conversational the whole way.",
        blocks=[RunBlock("Steady easy", 30 * 60, 2, 3, "Relaxed conversational rhythm", "Entspanntes Tempo, bei dem du dich noch unterhalten kannst")],
    ),
    "run_easy_45": RunTemplate(
        id="run_easy_45",
        name="Easy Run — 45min",
        category="endurance",
        purpose="Aerobic base volume without next-day cost.",
        blocks=[RunBlock("Steady easy", 45 * 60, 2, 3, "Relaxed conversational rhythm", "Entspanntes Tempo, bei dem du dich noch unterhalten kannst")],
    ),
    # ---- Strides --------------------------------------------------------
    "run_strides_8x20": RunTemplate(
        id="run_strides_8x20",
        name="Strides — 8×20s",
        category="endurance",
        purpose="Leg speed and mechanics on fresh-enough legs; near-zero fatigue cost.",
        blocks=[
            RunBlock("Easy run", 25 * 60, 2, 3, "Relaxed conversational rhythm", "Entspanntes Tempo, bei dem du dich noch unterhalten kannst"),
            *_reps(
                8,
                RunBlock("Stride", 20, 5, 8, "Fast but relaxed — build to ~mile effort, tall posture", "Schnell, aber locker — Tempo sauber aufbauen, aufrechte Haltung"),
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
                RunBlock("Rep", 90, 5, 9, "~3k–5k effort, quick and controlled", "Zügig und kontrolliert — etwa dein 3–5-km-Renntempo"),
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
                RunBlock("Rep", 180, 5, 9, "5k effort — strong but repeatable", "Etwa 5-km-Tempo — hart, aber wiederholbar"),
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
            RunBlock("Tempo", 20 * 60, 3, 6, "Comfortably hard — short sentences only", "Angenehm hart — nur noch kurze Sätze möglich"),
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
            RunBlock("Threshold", 15 * 60, 4, 7, "Around threshold — controlled discomfort", "An deiner Grenze — kontrolliert unangenehm"),
            _jog(180),
            RunBlock("Threshold", 15 * 60, 4, 7, "Hold the same effort, not more", "Gleiche Anstrengung halten, nicht mehr"),
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
            RunBlock("Easy third", 15 * 60, 2, 3, "Settle in, relaxed", "Locker einfinden, entspannt bleiben"),
            RunBlock("Steady third", 15 * 60, 3, 5, "Lift to comfortably hard", "Auf angenehm hart steigern"),
            RunBlock("Strong third", 12 * 60, 4, 7, "Strong close around threshold", "Starkes Finale nahe deiner Grenze"),
            _cd(180),
        ],
    ),
    # ---- Fartlek / hills — the novelty + strength variety set ------------
    "run_fartlek_40": RunTemplate(
        id="run_fartlek_40",
        name="Fartlek — 40min play",
        category="tempo",
        purpose=(
            "Unstructured speed play: surge when you feel like it, float when "
            "you don't. The highest-novelty run format — trains gear changes "
            "without a stopwatch dictating the day."
        ),
        blocks=[
            _wu(),
            RunBlock(
                "Fartlek play", 24 * 60, 3, 6,
                "8-12 surges of 30s-2min at 'strong', full-feel recoveries — no rules",
                "8–12 Antritte von 30 s bis 2 min nach Gefühl, Pausen wie du magst — keine Regeln",
            ),
            _cd(360),
        ],
    ),
    "run_hill_reps_8x60": RunTemplate(
        id="run_hill_reps_8x60",
        name="Hill Reps — 8×60s",
        category="vo2",
        purpose=(
            "Strength-endurance + VO₂ stimulus at lower impact than track "
            "reps — the gradient does the loading, not the pace."
        ),
        blocks=[
            _wu(),
            *_reps(
                8,
                RunBlock("Hill rep", 60, 5, 8, "Strong uphill drive — tall hips, short steps", "Kraftvoll bergauf — Hüfte hoch, kurze Schritte"),
                _jog(105, "Walk/jog down"),
            ),
            _cd(),
        ],
    ),
    # ---- Long runs ------------------------------------------------------
    "run_long_60": RunTemplate(
        id="run_long_60",
        name="Long Run — 60min",
        category="endurance",
        purpose="Aerobic endurance; the weekly volume anchor.",
        blocks=[RunBlock("Long steady", 60 * 60, 2, 4, "Steady endurance — patient rhythm", "Gleichmäßige Ausdauer — geduldiger Rhythmus")],
    ),
    "run_long_75": RunTemplate(
        id="run_long_75",
        name="Long Run — 75min",
        category="endurance",
        purpose="Extended aerobic endurance; durability for race day.",
        blocks=[RunBlock("Long steady", 75 * 60, 2, 4, "Steady endurance — patient rhythm", "Gleichmäßige Ausdauer — geduldiger Rhythmus")],
    ),
    "run_long_ladder_100": RunTemplate(
        id="run_long_ladder_100",
        name="Long Run Ladder — 100min",
        category="endurance",
        purpose="Long run with tempo touches — race-specific fatigue resistance.",
        blocks=[
            RunBlock("Easy opening", 30 * 60, 2, 3, "Settle into relaxed endurance", "Locker in den Lauf finden"),
            RunBlock("Tempo touch", 8 * 60, 3, 6, "Lift to comfortably hard", "Auf angenehm hart steigern"),
            RunBlock("Float", 7 * 60, 2, 4, "Back to steady endurance", "Zurück ins ruhige Ausdauertempo"),
            RunBlock("Tempo touch", 8 * 60, 3, 6, "Same lift — smooth, not strained", "Gleiche Steigerung — flüssig, nicht verkrampft"),
            RunBlock("Float", 7 * 60, 2, 4, "Back to steady endurance", "Zurück ins ruhige Ausdauertempo"),
            RunBlock("Tempo touch", 8 * 60, 3, 6, "Last lift — hold form", "Letzte Steigerung — Haltung sauber halten"),
            RunBlock("Steady close", 26 * 60, 2, 4, "Bring it home steady", "Gleichmäßig nach Hause laufen"),
            _cd(360),
        ],
    ),
}


# ── Adaptation metadata — populated for EVERY run template ──────────────
# (physiological_target, block_placement, min_readiness, indoor_ok, fun_factor)
_RUN_META: dict[str, tuple[str, RunBlockPlacement, RunMinReadiness, bool, int]] = {
    "run_recovery_25":     ("recovery", "any", "low", True, 1),
    "run_easy_30":         ("aerobic_base", "any", "low", True, 1),
    "run_easy_45":         ("aerobic_base", "any", "low", True, 1),
    "run_strides_8x20":    ("neuromuscular_power", "any", "medium", True, 3),
    "run_vo2_400s":        ("vo2max", "build", "high", True, 2),
    "run_vo2_800s":        ("vo2max", "build", "high", True, 2),
    "run_tempo_20":        ("lactate_threshold", "build", "medium", True, 2),
    "run_tempo_2x15":      ("lactate_threshold", "build", "high", True, 2),
    "run_progression_45":  ("fatigue_resistance", "build", "medium", True, 2),
    "run_fartlek_40":      ("aerobic_power", "any", "medium", True, 3),
    "run_hill_reps_8x60":  ("strength_endurance", "build", "high", True, 3),
    "run_long_60":         ("durability", "base", "medium", True, 2),
    "run_long_75":         ("durability", "base", "medium", True, 2),
    "run_long_ladder_100": ("durability", "build", "medium", False, 2),
}

# ── Localization (de) — populated for EVERY run template ────────────────
# (name_de, purpose_de) — plain, beginner-safe German (no lab jargon), same
# bilingual pattern as message_de/message_en in plan_adaptation_engine.
_RUN_I18N_DE: dict[str, tuple[str, str]] = {
    "run_recovery_25": (
        "Erholungslauf — 25 min",
        "Ganz lockeres Traben — bringt die Beine in Schwung, ohne dich zu ermüden.",
    ),
    "run_easy_30": (
        "Lockerer Lauf — 30 min",
        "Entspanntes Lauftempo, bei dem du dich die ganze Zeit unterhalten könntest.",
    ),
    "run_easy_45": (
        "Lockerer Lauf — 45 min",
        "Lockere Ausdauer-Kilometer, die dich am nächsten Tag nichts kosten.",
    ),
    "run_strides_8x20": (
        "Steigerungsläufe — 8×20 s",
        "Kurze, schnelle, aber lockere Beschleunigungen — machen deinen Laufstil schneller und runder, fast ohne Ermüdung.",
    ),
    "run_vo2_400s": (
        "Schnelle Intervalle — 10×90 s",
        "Viele kurze, schnelle Abschnitte mit Trabpausen — heben dein Tempo-Limit an.",
    ),
    "run_vo2_800s": (
        "Schnelle Intervalle — 5×3 min",
        "Fünf längere schnelle Abschnitte — mehr Zeit im hohen Tempo als bei den kurzen Intervallen.",
    ),
    "run_tempo_20": (
        "Tempolauf — 20 min",
        "20 Minuten angenehm hart am Stück — hebt das Tempo, das du lange halten kannst.",
    ),
    "run_tempo_2x15": (
        "Schwellenlauf — 2×15 min",
        "Zwei kontrollierte harte Abschnitte an deiner Grenze — das Kerntraining für 10 km bis Halbmarathon.",
    ),
    "run_progression_45": (
        "Steigerungslauf — 45 min",
        "Locker starten und Stück für Stück schneller werden — du lernst, auf müden Beinen das Tempo zu halten.",
    ),
    "run_fartlek_40": (
        "Fahrtspiel — 40 min",
        "Tempospiel ohne Regeln: beschleunige, wenn du Lust hast, erhole dich, wenn du magst — der verspielteste Lauf.",
    ),
    "run_hill_reps_8x60": (
        "Bergläufe — 8×60 s",
        "Acht kräftige Anstiege — machen dich stark und schnell, dabei schonender für die Gelenke als Bahntraining.",
    ),
    "run_long_60": (
        "Langer Lauf — 60 min",
        "Der wöchentliche Ausdauer-Anker — gleichmäßig und geduldig laufen.",
    ),
    "run_long_75": (
        "Langer Lauf — 75 min",
        "Verlängerte Ausdauer-Einheit — macht dich haltbar für den Wettkampftag.",
    ),
    "run_long_ladder_100": (
        "Langer Lauf mit Tempo-Akzenten — 100 min",
        "Langer Lauf mit drei zügigeren Abschnitten — trainiert, auch müde noch das Tempo anziehen zu können.",
    ),
}

_run_missing_i18n = set(RUN_TEMPLATES) - set(_RUN_I18N_DE)
assert not _run_missing_i18n, f"run templates missing German localization: {_run_missing_i18n}"
for _tid, (_name_de, _purpose_de) in _RUN_I18N_DE.items():
    _t = RUN_TEMPLATES.get(_tid)
    if _t is not None:
        RUN_TEMPLATES[_tid] = replace(_t, name_de=_name_de, purpose_de=_purpose_de)


_run_missing = set(RUN_TEMPLATES) - set(_RUN_META)
assert not _run_missing, f"run templates missing adaptation metadata: {_run_missing}"
for _tid, (_target, _placement, _readiness, _indoor, _fun) in _RUN_META.items():
    _t = RUN_TEMPLATES.get(_tid)
    if _t is not None:
        RUN_TEMPLATES[_tid] = replace(
            _t,
            physiological_target=_target,
            block_placement=_placement,
            min_readiness=_readiness,
            indoor_ok=_indoor,
            fun_factor=_fun,
        )


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
                "description_de": b.description_de,
            }
            for b in t.blocks
        ]
    }
