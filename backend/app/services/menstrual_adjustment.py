"""Menstrual-cycle-phase training adjustment.

For athletes who track their cycle, hormonal phase shifts modulate training
capacity and recovery. The evidence base is individual and effect sizes are
modest (McNulty et al. 2020 meta-analysis, Sports Med — "the effect of the
menstrual cycle on exercise performance"), so this module applies a *small,
bounded* readiness nudge and a guidance note — never an override.

Phase model (default 28-day cycle, day 1 = first day of menses):
  * menstrual    (d1–5)   — symptoms can sap readiness; otherwise neutral.
  * follicular   (d6–13)  — rising estrogen; favorable for high-intensity and
                            strength work. Slight positive nudge.
  * ovulatory    (d14)    — peak estrogen; still good for intensity, but some
                            data flag higher ligament laxity → neutral.
  * early_luteal (d15–23) — neutral.
  * late_luteal  (d24–end)— elevated progesterone → higher core temp, higher
                            RPE, greater thermoregulatory strain; PMS symptoms
                            common. Negative nudge, scaled by symptom severity.

Symptom severity is a self-reported 0–3 scale (0 none … 3 severe); values above
3 are clamped. The total readiness delta is bounded to [-10, +3].

Pure module: no DB, no Garmin.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Phase = Literal["menstrual", "follicular", "ovulatory", "early_luteal", "late_luteal"]

_MIN_DELTA = -10
_MAX_DELTA = 3


def cycle_phase_from_day(cycle_day: int | None, cycle_length: int = 28) -> Phase | None:
    """Map a 1-indexed cycle day to a phase. Returns None for missing/invalid days."""
    if cycle_day is None or cycle_day < 1 or cycle_day > cycle_length:
        return None
    if cycle_day <= 5:
        return "menstrual"
    if cycle_day <= 13:
        return "follicular"
    if cycle_day <= 14:
        return "ovulatory"
    # Split the luteal phase: last ~5 days are "late luteal".
    if cycle_day <= cycle_length - 5:
        return "early_luteal"
    return "late_luteal"


@dataclass(frozen=True)
class MenstrualAdjustment:
    phase: Phase | None
    readiness_delta: int   # bounded points to add to the readiness score
    intensity_note: str


def menstrual_adjustment(
    cycle_day: int | None,
    cycle_length: int = 28,
    symptom_severity: int = 0,
) -> MenstrualAdjustment:
    """Bounded readiness nudge + guidance from the athlete's cycle phase."""
    phase = cycle_phase_from_day(cycle_day, cycle_length)
    if phase is None:
        return MenstrualAdjustment(phase=None, readiness_delta=0, intensity_note="")

    sev = max(0, min(3, symptom_severity))

    if phase == "follicular":
        delta, note = 3, "Estrogen-dominant phase — a strong window for VO2 and strength work."
    elif phase == "ovulatory":
        delta, note = 1, "Good capacity for intensity; some athletes feel mild joint laxity."
    elif phase == "menstrual":
        delta = -2 * sev
        note = (
            "Train to feel — symptoms vary. If cramping/fatigue is high, keep it easy."
            if sev else "Often a normal training window once flow settles."
        )
    elif phase == "early_luteal":
        delta, note = 0, "Neutral phase — train to plan."
    else:  # late_luteal
        delta = -3 - 2 * sev
        note = (
            "Pre-menstrual phase — higher core temp and perceived effort. Favor "
            "aerobic volume over hard intervals, hydrate, and don't chase numbers."
        )

    delta = max(_MIN_DELTA, min(_MAX_DELTA, delta))
    return MenstrualAdjustment(phase=phase, readiness_delta=delta, intensity_note=note)
