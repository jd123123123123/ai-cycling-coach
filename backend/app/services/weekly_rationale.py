"""Weekly rationale generator — rule-based, deterministic, language-aware.

Produces a 3-5 sentence paragraph explaining WHY a week's plan looks the way it
does. No LLM in Phase 7.0; LLM polish deferred to Phase 7.2.

Language modes (mirror Phase 5.2 discipline):
  - simple:    Plain English. Zero CTL/TSS/TSB/IF/Z1-Z7/Coggan/Seiler/Friel/
               Mujika/Issurin/sweet-spot/threshold/VO2/polarized/pyramidal jargon.
  - technical: Full scientific vocabulary — cites Friel/Issurin/Seiler, uses
               CTL/TSS terminology, labels the TID precisely.

Structure of the paragraph (helpers → filter None → join):
  1. Phase + block context        (_phase_block_sentence)
  2. PMC delta / fitness progress (_pmc_sentence)
  3. TID rationale                (_tid_sentence)
  4. Event-anchored (conditional) (_event_sentence_or_none)
  5. Recovery call-out (conditional) (_recovery_sentence_or_none)

Design rails:
  - 3-5 sentences total (guaranteed by building list of 3 fixed + up to 2 opt.)
  - Never punish rest — recovery-week copy is ALWAYS positive.
  - Simple mode is BANNED from leaking jargon (enforced by tests/services/
    test_weekly_rationale.py parametrized across 36 phase×block combos).
  - Function is pure (no I/O, no randomness) → byte-identical on same inputs.
"""
from __future__ import annotations

import math
from typing import Literal

from app.services.training_periodization import Phase

Language = Literal["simple", "technical"]
BlockPosition = Literal["accumulation", "transmutation", "realization", "recovery"]

# ---------------------------------------------------------------------------
# Sentence 1: Phase + block context
# ---------------------------------------------------------------------------

_PHASE_BLOCK_SIMPLE: dict[tuple[Phase, BlockPosition], str] = {
    # offseason
    ("offseason", "accumulation"):  "Offseason, week {n} — gentle activity to keep moving.",
    ("offseason", "transmutation"): "Offseason, week {n} — keeping the body ticking over.",
    ("offseason", "realization"):   "Offseason, week {n} — light days to recharge.",
    ("offseason", "recovery"):      "Offseason recovery week {n} — rest and enjoy it.",
    # base1
    ("base1", "accumulation"):  "Building your base, week {n} — long easy rides.",
    ("base1", "transmutation"): "Base phase, week {n} — steady work, not much pressure.",
    ("base1", "realization"):   "Base phase, week {n} — wrapping up steady base miles.",
    ("base1", "recovery"):      "Base recovery week {n} — lighter load before the next push.",
    # base2
    ("base2", "accumulation"):  "Building fitness, week {n} — mostly long easy rides.",
    ("base2", "transmutation"): "Fitness building, week {n} — one harder day in the mix.",
    ("base2", "realization"):   "Fitness building, week {n} — the hard week before a rest.",
    ("base2", "recovery"):      "Rest week {n} — the workload comes down so your body catches up.",
    # build1
    ("build1", "accumulation"):  "Building week {n} of {meso_len} — steady, controlled hard work.",
    ("build1", "transmutation"): "Building week {n} — two hard days mixed with easy riding.",
    ("build1", "realization"):   "Peak build week {n} — hardest of the block before recovery.",
    ("build1", "recovery"):      "Recovery week {n} — workload steps back before the next push.",
    # build2
    ("build2", "accumulation"):  "Build phase, week {n} — dialing in fitness with two hard days.",
    ("build2", "transmutation"): "Build phase, week {n} — two quality days, the rest easy.",
    ("build2", "realization"):   "Build peak week {n} — the highest-load week of the block.",
    ("build2", "recovery"):      "Recovery week {n} — the load drops so you come back stronger.",
    # peak
    ("peak", "accumulation"):  "Peak preparation, week {n} — quality over quantity.",
    ("peak", "transmutation"): "Peak phase, week {n} — sharpening with two focused days.",
    ("peak", "realization"):   "Peak week {n} — biggest load before taper begins.",
    ("peak", "recovery"):      "Recovery week {n} — body absorbs the peak block work.",
    # taper
    ("taper", "accumulation"):  "Taper has started, week {n} — the hard work is done.",
    ("taper", "transmutation"): "Taper, week {n} — keeping the legs sharp, volume coming down.",
    ("taper", "realization"):   "Final taper week {n} — almost there, stay fresh.",
    ("taper", "recovery"):      "Taper recovery week {n} — you should feel good by now.",
    # race
    ("race", "accumulation"):  "Race week — short and easy days ahead.",
    ("race", "transmutation"): "Race week — saving energy for what counts.",
    ("race", "realization"):   "Race week — one last wake-up ride, then go get it.",
    ("race", "recovery"):      "Race week — keeping legs fresh for the big day.",
    # maintenance
    ("maintenance", "accumulation"):  "Staying fit and ready, week {n} — easy days with two harder ones.",
    ("maintenance", "transmutation"): "Maintenance week {n} — keeping the engine ticking over.",
    ("maintenance", "realization"):   "Maintenance week {n} — same consistent rhythm.",
    ("maintenance", "recovery"):      "Recovery week {n} — lighter week to keep things balanced.",
}

_PHASE_BLOCK_TECHNICAL: dict[tuple[Phase, BlockPosition], str] = {
    # offseason
    ("offseason", "accumulation"):  "Offseason, week {n} — aerobic maintenance at 95/5 easy/hard ratio.",
    ("offseason", "transmutation"): "Offseason, week {n} — polarized base, no intensity target.",
    ("offseason", "realization"):   "Offseason, week {n} — active recovery, CTL target floor ~10.",
    ("offseason", "recovery"):      "Offseason recovery week {n} — full unload, no intensity.",
    # base1
    ("base1", "accumulation"):  "Base 1, week {n} — 90/10 polarized, Friel foundation-phase aerobic base.",
    ("base1", "transmutation"): "Base 1, week {n} — Z2 accumulation, CTL build below aerobic threshold.",
    ("base1", "realization"):   "Base 1, week {n} — realisation block; Issurin loading completed.",
    ("base1", "recovery"):      "Base 1 recovery week {n} — Issurin block 4; TSS drops ~35%.",
    # base2
    ("base2", "accumulation"):  "Base 2, week {n} — 85/15 polarized, threshold sessions entering rotation.",
    ("base2", "transmutation"): "Base 2, week {n} — sweet-spot accumulation, Friel late-base aerobic threshold.",
    ("base2", "realization"):   "Base 2, week {n} — Issurin realization block; peak TSS of this mesocycle.",
    ("base2", "recovery"):      "Base 2 recovery week {n} — Issurin block 4; TSS steps down ~35%.",
    # build1
    ("build1", "accumulation"):  "Build 1, week {n} of {meso_len} — sweet-spot accumulation, 80/20 Seiler split.",
    ("build1", "transmutation"): "Build 1, week {n} — threshold + VO2 transmutation block.",
    ("build1", "realization"):   "Build 1, week {n} — Issurin realization; peak CTL ramp of the build.",
    ("build1", "recovery"):      "Build 1 recovery week {n} — Issurin block 4; TSS drops, CTL consolidates.",
    # build2
    ("build2", "accumulation"):  "Build 2, week {n} — 75/25 polarized, Friel build-phase accumulation.",
    ("build2", "transmutation"): "Build 2, week {n} — threshold/VO2 transmutation; peak hard-session count.",
    ("build2", "realization"):   "Build 2, week {n} — realization block; highest weekly TSS of mesocycle.",
    ("build2", "recovery"):      "Build 2 recovery week {n} — Issurin recovery; ATL flush, CTL hold.",
    # peak
    ("peak", "accumulation"):  "Peak phase, week {n} — 75/25 polarized; quality over volume.",
    ("peak", "transmutation"): "Peak phase, week {n} — VO2max + threshold sharpening.",
    ("peak", "realization"):   "Peak realization, week {n} — highest TSS before Mujika taper.",
    ("peak", "recovery"):      "Peak recovery week {n} — unload; entering Mujika taper window.",
    # taper
    ("taper", "accumulation"):  "Taper, week {n} — 85/15 polarized; volume -30%, intensity preserved.",
    ("taper", "transmutation"): "Taper, week {n} — Mujika protocol; frequency intact, duration cut.",
    ("taper", "realization"):   "Final taper week {n} — race-pace opener; TSB climbing toward +15.",
    ("taper", "recovery"):      "Taper recovery week {n} — TSB target +10 to +20; freshness peak.",
    # race
    ("race", "accumulation"):  "Race week. Volume reduced ~50%, intensity preserved per Mujika protocol; one opener at race pace.",
    ("race", "transmutation"): "Race week. Volume reduced ~50%, intensity preserved per Mujika protocol; one opener at race pace.",
    ("race", "realization"):   "Race week. Volume reduced ~50%, intensity preserved per Mujika protocol; one opener at race pace.",
    ("race", "recovery"):      "Race week. Volume reduced ~50%, intensity preserved per Mujika protocol; one opener at race pace.",
    # maintenance
    ("maintenance", "accumulation"):  "Maintenance — polarized 80/20, no peak target.",
    ("maintenance", "transmutation"): "Maintenance — polarized 80/20; threshold sessions sustain CTL floor.",
    ("maintenance", "realization"):   "Maintenance — polarized 80/20; CTL steady-state.",
    ("maintenance", "recovery"):      "Maintenance recovery week — unload block; CTL hold at baseline.",
}


def _phase_block_sentence(
    phase: Phase,
    block_position: BlockPosition,
    block_index_in_meso: int,
    language: Language,
) -> str:
    """Sentence 1: phase + block position, week counter."""
    n = block_index_in_meso + 1  # 1-based for user-facing display
    meso_len = 4  # standard Issurin 4-block mesocycle
    mapping = _PHASE_BLOCK_TECHNICAL if language == "technical" else _PHASE_BLOCK_SIMPLE
    template = mapping.get(
        (phase, block_position),
        # Fallback for any unexpected combination
        "Training week {n} of {meso_len}." if language == "technical"
        else "Training week {n} — structured work this week.",
    )
    return template.format(n=n, meso_len=meso_len)


# ---------------------------------------------------------------------------
# Sentence 2: PMC delta / fitness progress
# ---------------------------------------------------------------------------

def _pmc_sentence(
    ctl_delta_7d: float,
    ctl_now: float,
    language: Language,
) -> str:
    """Sentence 2: describe the CTL/fitness trend this past week."""
    delta = round(ctl_delta_7d, 1)
    ctl = round(ctl_now, 1)

    if language == "technical":
        delta_int = round(abs(delta))
        ctl_int = round(ctl)
        if delta > 0:
            delta_pos = round(delta)
            return f"CTL has grown +{delta_pos} over 7 days; we're inside Friel's 8% ramp cap."
        elif delta < -0.5:
            return f"CTL eased back {delta_int} over 7 days — intentional recovery or life-load."
        else:
            return f"CTL held steady at {ctl_int} — load matched absorption perfectly."
    else:
        # Simple mode: no CTL/TSS/ramp/Friel
        if delta > 1.0:
            return "Your fitness has climbed nicely this week; we're keeping the increase manageable."
        elif delta > 0:
            return "Fitness is ticking up steadily — solid progress without overdoing it."
        elif delta < -0.5:
            return "Fitness has stepped back slightly this week — that's a planned reset."
        else:
            return "Fitness held steady this week — the body is absorbing recent work."


# ---------------------------------------------------------------------------
# Sentence 3: TID rationale
# ---------------------------------------------------------------------------

def _tid_sentence(
    phase: Phase,
    block_position: BlockPosition,
    seiler_z3_pct: float,
    language: Language,
) -> str:
    """Sentence 3: intensity distribution rationale."""
    z3_pct_int = int(round(seiler_z3_pct * 100))
    z1_z2_pct_int = 100 - z3_pct_int

    if phase == "race":
        if language == "technical":
            return "Race week — all sessions below threshold; one quality opener at race pace."
        else:
            return "Most days are short and easy; one quick wake-up the day before the event."

    if language == "technical":
        if z3_pct_int <= 10:
            split_label = "pyramidal-polarized"
        elif z3_pct_int <= 20:
            split_label = "polarized"
        else:
            split_label = "high-intensity"
        return (
            f"{z1_z2_pct_int}/{z3_pct_int} {split_label} split — "
            f"Seiler principle: accumulate aerobic base, keep high-intensity sparing."
        )
    else:
        if z3_pct_int <= 10:
            return "Mostly easy riding with one focused harder effort — that's how the body actually adapts."
        elif z3_pct_int <= 20:
            return "Two hard days, the rest easy — this balance is what builds fitness without burning out."
        else:
            return "More hard days this week — the plan calls for a bigger challenge before backing off."


# ---------------------------------------------------------------------------
# Sentence 4 (conditional): Event-anchored
# ---------------------------------------------------------------------------

def _event_sentence_or_none(
    days_to_event: int | None,
    target_event_type: str | None,
    language: Language,
) -> str | None:
    """Sentence 4: event context — None when not applicable."""
    # No event set, or maintenance mode
    if days_to_event is None or target_event_type in ("maintenance", None):
        return None

    # Race week handled entirely in sentence 1 + 3
    if days_to_event <= 7:
        return None

    # Very distant event (>16 weeks) — don't mention it prominently
    if days_to_event > 112:
        return None

    # Zone into Friel phases based on distance
    weeks = math.ceil(days_to_event / 7)

    if language == "technical":
        event_label = {
            "race": "A-race",
            "fondo": "gran fondo",
            "audax": "audax target",
        }.get(str(target_event_type or ""), "goal event")
        if days_to_event <= 49:
            return f"{days_to_event} days to your {event_label} — Mujika taper window opens soon; protect the build."
        return f"{days_to_event} days ({weeks} weeks) to your {event_label}; this week is the build heart."
    else:
        event_label = {
            "race": "race",
            "fondo": "big ride",
            "audax": "long challenge",
        }.get(str(target_event_type or ""), "goal")
        if days_to_event <= 49:
            return f"Your {event_label} is {days_to_event} days away — we're in the final build before easing off."
        return f"Your {event_label} is {days_to_event} days away; this week is the heart of building."


# ---------------------------------------------------------------------------
# Sentence 5 (conditional): Recovery-week call-out
# ---------------------------------------------------------------------------

def _recovery_sentence_or_none(
    block_position: BlockPosition,
    weekly_tss_target: int,
    language: Language,
    phase: Phase,
) -> str | None:
    """Sentence 5: positive recovery framing — only emitted on recovery blocks."""
    if block_position != "recovery":
        return None
    # Race week already handled above — no second recovery sentence
    if phase == "race":
        return None

    if language == "technical":
        # TSS drop percentage relative to a typical build week
        drop_pct = 35  # standard Issurin 35% step-down on recovery weeks
        return (
            f"Recovery week — TSS drops to ~{weekly_tss_target}, "
            f"a {drop_pct}% step-down so the next Issurin block lands harder."
        )
    else:
        return (
            "The workload steps back so your body absorbs the training "
            "and comes back ready for the next block."
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _de_preface(
    phase: Phase,
    block_position: BlockPosition,
    block_index_in_meso: int,
    ctl_delta_7d: float,
    days_to_event: int | None,
    target_event_type: str | None,
    seiler_z3_pct: float,
) -> str:
    """German 2-3 sentence preface (du-form). Used when locale='de'.

    Avoids the full rule-based English templates being re-translated by hand;
    instead emits a tight phrase set covering phase, fitness trend, intensity
    distribution, and optional event countdown. The brief LLM still writes the
    rich daily prose in German via its own prompt; this is the lightweight
    weekly framing for the Train tab header.
    """
    week_n = block_index_in_meso + 1
    phase_label = {
        "base1": "Grundlage 1", "base2": "Grundlage 2",
        "build1": "Aufbau 1", "build2": "Aufbau 2",
        "peak": "Peak", "taper": "Taper", "race": "Wettkampfwoche",
        "offseason": "Nebensaison", "maintenance": "Erhaltung",
    }.get(phase, phase.capitalize())
    # Humanized block-position clause — never the raw Issurin labels
    # ("Akkumulation"/"Transmutation") in athlete-facing copy.
    position_clause = {
        "accumulation": "die Belastung wächst gerade Schritt für Schritt",
        "transmutation": "die gesammelte Arbeit wird jetzt in gezielte Härte übersetzt",
        "realization": "die anspruchsvollste Woche des Blocks, bevor es wieder leichter wird",
        "recovery": "eine bewusst leichtere Woche, damit dein Körper das Training verarbeitet",
    }.get(block_position, "strukturierte Arbeit diese Woche")

    if phase == "race":
        sentences = [
            "Wettkampfwoche — kein hartes Training, kein neuer Reiz.",
            "Ein kurzer Race-Pace-Eröffner am Tag vor dem Event hält die Beine wach.",
        ]
    else:
        s1 = f"Du bist in {phase_label}, Woche {week_n} — {position_clause}."
        if ctl_delta_7d > 1.0:
            s2 = "Die Fitness steigt diese Woche solide — wir halten den Aufbau überschaubar."
        elif ctl_delta_7d > 0:
            s2 = "Die Fitness zieht stetig an — gleichmäßig, ohne zu übertreiben."
        elif ctl_delta_7d < -0.5:
            s2 = "Die Fitness ist leicht zurückgegangen — geplante Entlastung."
        else:
            s2 = "Die Fitness bleibt stabil — der Körper verarbeitet die letzten Einheiten."
        z3_pct = int(round(seiler_z3_pct * 100))
        if z3_pct <= 10:
            s3 = "Vor allem ruhige Fahrten mit einem fokussierten harten Tag — so passt sich der Körper wirklich an."
        elif z3_pct <= 20:
            s3 = "Zwei harte Tage, der Rest ruhig — die Balance, die Fitness baut, ohne auszubrennen."
        else:
            s3 = "Mehr harte Tage diese Woche — bewusster Reiz vor der nächsten Entlastung."
        sentences = [s1, s2, s3]

    if days_to_event is not None and 7 < days_to_event <= 112 and target_event_type not in (None, "maintenance"):
        weeks = (days_to_event + 6) // 7
        event_label = {
            "race": "Rennen", "fondo": "Marathon", "audax": "Brevet",
        }.get(target_event_type or "", "Event")
        sentences.append(f"Noch {weeks} Woche{'n' if weeks != 1 else ''} bis zum {event_label}.")

    return " ".join(sentences)


def build_weekly_rationale(
    *,
    phase: Phase,
    block_position: BlockPosition,
    block_index_in_meso: int,
    weekly_tss_target: int,
    ctl_now: float,
    ctl_delta_7d: float,
    days_to_event: int | None,
    target_event_type: str | None,
    seiler_z3_pct: float,
    language: Language,
    locale: str = "en",
) -> str:
    """Return a 3-5 sentence paragraph explaining why this week looks like it does.

    Args:
        phase:               Friel training phase (from training_periodization.Phase).
        block_position:      Issurin mesocycle block ('accumulation' | 'transmutation' |
                             'realization' | 'recovery').
        block_index_in_meso: 0-based index within the mesocycle (0..3).
        weekly_tss_target:   Planned weekly TSS for this week.
        ctl_now:             Current CTL (chronic training load).
        ctl_delta_7d:        Change in CTL over the past 7 days (+ve = fitness gained).
        days_to_event:       Days until target event. None = maintenance/no event.
        target_event_type:   'race' | 'fondo' | 'audax' | 'maintenance' | None.
        seiler_z3_pct:       Fraction of training time in high-intensity (0.0-1.0).
        language:            'simple' or 'technical'.

    Returns:
        3-5 sentences as a single paragraph (no newlines). The result is
        deterministic — same inputs always produce the same string.

    Language discipline:
        Simple mode contains ZERO: CTL, TSS, TSB, IF, Z1-Z7, Seiler, Mujika,
        Issurin, Friel, Coggan, sweet-spot, threshold, VO2, polarized, pyramidal.
        Technical mode may freely cite all of the above.
    """
    # Early-return for German: emit a focused 2-3 sentence du-form preface
    # via the dedicated builder. Skips the rich English-only sentence
    # templates so the Train tab reads naturally in German.
    if locale == "de":
        return _de_preface(
            phase=phase,
            block_position=block_position,
            block_index_in_meso=block_index_in_meso,
            ctl_delta_7d=ctl_delta_7d,
            days_to_event=days_to_event,
            target_event_type=target_event_type,
            seiler_z3_pct=seiler_z3_pct,
        )

    # Sentence 1: always present
    s1 = _phase_block_sentence(phase, block_position, block_index_in_meso, language)

    # Sentence 2: PMC delta (always present)
    s2 = _pmc_sentence(ctl_delta_7d, ctl_now, language)

    # Sentence 3: TID rationale (always present, but for race week merges into s1)
    s3 = _tid_sentence(phase, block_position, seiler_z3_pct, language)

    # Sentence 4: conditional event anchor
    s4 = _event_sentence_or_none(days_to_event, target_event_type, language)

    # Sentence 5: conditional recovery call-out
    s5 = _recovery_sentence_or_none(block_position, weekly_tss_target, language, phase)

    sentences = [s for s in [s1, s2, s3, s4, s5] if s is not None]

    # Guarantee the sentence ends with a period so join is clean
    def _ensure_period(s: str) -> str:
        s = s.strip()
        if s and s[-1] not in ".!?":
            s += "."
        return s

    sentences = [_ensure_period(s) for s in sentences]
    return " ".join(sentences)


__all__ = [
    "Language",
    "BlockPosition",
    "build_weekly_rationale",
]
