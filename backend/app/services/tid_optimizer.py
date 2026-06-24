"""Training Intensity Distribution (TID) optimizer.

Classifies an athlete's recent 3-zone (Seiler) intensity distribution into one
of the canonical models and judges it against the phase-appropriate target.

Models (zone fractions: z1 = easy/below-LT1, z2 = grey/threshold, z3 = hard/
above-LT2):
  * polarized     — lots of easy, little grey, a meaningful hard slice (z3 ≥ z2).
  * pyramidal     — easy-dominant with grey > hard (z1 > z2 > z3).
  * threshold     — grey-zone heavy (the classic "always moderately hard" trap).
  * high_intensity — not enough easy volume; too much z3.

Evidence: Seiler 2010; Stöggl & Sperlich 2015 (Front Physiol) showed polarized
beats threshold/HIT for trained athletes in a build/peak; Rosenblat et al. 2019
meta-analysis found polarized and pyramidal both effective in base, with
polarized edging ahead nearer competition. So we target *pyramidal in base* and
*polarized in build/peak*.

Pure module: no DB, no Garmin.
"""
from __future__ import annotations

from dataclasses import dataclass

# Phases that should run a polarized distribution (sharpening toward an event).
_POLARIZED_PHASES = {"build1", "build2", "peak", "taper", "race"}


def _normalize(z1: float, z2: float, z3: float) -> tuple[float, float, float]:
    total = z1 + z2 + z3
    if total <= 0:
        return 0.0, 0.0, 0.0
    return z1 / total, z2 / total, z3 / total


def classify_tid(z1: float, z2: float, z3: float) -> str:
    """Classify a 3-zone distribution. Accepts fractions or percentages."""
    z1, z2, z3 = _normalize(z1, z2, z3)
    if z1 >= 0.65 and z3 >= z2 and z2 <= 0.15:
        return "polarized"
    if z1 >= 0.60 and z2 >= z3:
        return "pyramidal"
    if z2 >= 0.35:
        return "threshold"
    return "high_intensity"


@dataclass(frozen=True)
class TIDAssessment:
    model: str
    target: str
    aligned: bool
    z1_pct: float
    z2_pct: float
    z3_pct: float
    recommendation: str


def _target_for_phase(phase: str | None) -> str:
    return "polarized" if (phase or "").lower() in _POLARIZED_PHASES else "pyramidal"


def assess_tid(z1: float, z2: float, z3: float, phase: str | None) -> TIDAssessment:
    """Classify the distribution and compare it to the phase-appropriate target."""
    model = classify_tid(z1, z2, z3)
    target = _target_for_phase(phase)
    aligned = model == target
    n1, n2, n3 = _normalize(z1, z2, z3)

    if aligned:
        rec = f"Distribution is {model} — on target for this phase. Hold it."
    elif target == "polarized":
        rec = (
            "Too much grey-zone work to sharpen. Polarize: push the easy days "
            "truly easy (below LT1) and make the hard days genuinely hard (VO2), "
            "cutting tempo/threshold volume."
        )
    else:
        rec = (
            "Build a broader aerobic base: keep most volume easy and let "
            "threshold work taper into the hard slice — a pyramidal shape."
        )

    return TIDAssessment(
        model=model,
        target=target,
        aligned=aligned,
        z1_pct=round(n1 * 100, 1),
        z2_pct=round(n2 * 100, 1),
        z3_pct=round(n3 * 100, 1),
        recommendation=rec,
    )
