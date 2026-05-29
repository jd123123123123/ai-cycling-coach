"""Multi-factor readiness score — 0-100 with per-component breakdown.

Replaces the binary `intensity_ceiling` rail with a smooth dial that
combines six independent biological + load signals. The caller maps the
final 0-100 score back to a coarse ceiling category for downstream code
that still expects rest/easy/moderate/push.

Why a composite instead of more if-statements:
    The single-signal rail cascade (HRV<-10 OR TSB<-30 OR injury) is
    brittle — it fires identically for an athlete with sleep_score=95,
    HRV stable, RHR low, fresh legs, low ACWR vs. an athlete with the
    same TSB but every other signal screaming red. Combining the signals
    into one continuous score lets nuanced states (e.g. "everything fine
    except sleep was bad") produce nuanced answers ("moderate today,
    not push, not easy"). Plews et al. 2013 made the case for HRV-guided
    training; we extend that to multi-signal-guided training.

Components (each scored 0-100, then weighted):
    * hrv_score      — 7d HRV mean vs 28d baseline + coefficient of
                       variation. Plews 2013 / Plews 2017 — slope > point.
    * rhr_score      — 7d RHR mean vs 28d baseline. Elevation predicts
                       infection + overreach (Hedelin 2000, Buchheit 2014).
    * sleep_score    — last night's quality + nightly debt over 14d.
                       Halson 2008; Watson 2017 (Br J Sports Med).
    * tsb_score      — Banister TSB band. Cap at -10 / -30 / -40 per
                       Coggan/Allen + Banister 1991.
    * acwr_score     — Acute:Chronic Workload Ratio (Bourdon 2017 IJSPP).
                       Sweet-spot 0.8-1.3; >1.5 raises injury risk 2-4×.
    * body_battery   — Garmin's productized Banister TRIMP proxy. Wake
                       value < 30 = poor recovery overnight.

Weights are tuned conservatively — sleep + HRV + TSB carry the most
weight because they're the most-evidence-backed signals. Body battery
weighted lightest because its computation is a vendor black box.

References:
    Plews DJ et al. Sports Med 2013, 43:773-781.
    Halson SL. Sports Med 2008, 38:861-872.
    Watson AM. Br J Sports Med 2017, 51:1395-1399.
    Bourdon PC et al. IJSPP 2017, 12:S2-161-S2-170.
    Banister EW. Modeling elite athletic performance. 1991.
    Hedelin R et al. Med Sci Sports Exerc 2000, 32:1480-1484.
    Buchheit M. Front Physiol 2014, 5:73.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


Ceiling = Literal["rest", "easy", "moderate", "push"]


@dataclass(frozen=True)
class ReadinessInputs:
    """Every signal the score consumes — all optional, defaulting to neutral.

    Missing signals (None) are skipped and the remaining weights renormalized,
    so a new athlete with only TSB available still gets a useful score.
    """
    # HRV (rMSSD ms or composite, 7d window)
    hrv_7d_mean: float | None = None
    hrv_28d_baseline: float | None = None
    hrv_cv_pct: float | None = None  # coefficient of variation, 7d

    # Resting heart rate
    rhr_7d_mean: float | None = None
    rhr_28d_baseline: float | None = None

    # Sleep
    sleep_score_last_night: int | None = None  # Garmin 0-100
    avg_nightly_debt_h: float | None = None    # hours below 7.5h target

    # Training-load context
    tsb: float | None = None
    ctl: float | None = None
    atl: float | None = None

    # Garmin wake-time body battery (0-100)
    body_battery_wake: int | None = None


@dataclass
class ComponentScore:
    name: str
    score: float | None  # 0-100, or None if input missing
    weight: float
    note: str = ""


@dataclass
class ReadinessReport:
    overall: int                       # 0-100
    ceiling: Ceiling                   # mapped category
    components: list[ComponentScore] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


# ----------------------------------------------------------------------
# Component scorers — each returns 0-100 or None when the input is absent
# ----------------------------------------------------------------------


def _hrv_component(inputs: ReadinessInputs) -> tuple[float | None, str]:
    """HRV vs baseline. Being *at* baseline is a green light, not a "meh" —
    Plews HRV-guided training: train hard when HRV is at or above baseline.
    So 0% Δ anchors at 70, not 50. Above baseline ramps to 100 by +10%;
    below baseline falls off steeply (suppression is the danger signal) and
    hits 0 by -10%.

    The CV (Plews) penalty kicks in when day-to-day variability spikes —
    a sign of accumulating stress that the mean smooths over.
    """
    if inputs.hrv_7d_mean is None or inputs.hrv_28d_baseline is None or inputs.hrv_28d_baseline <= 0:
        return None, "no HRV history"
    delta_pct = (inputs.hrv_7d_mean - inputs.hrv_28d_baseline) / inputs.hrv_28d_baseline * 100.0
    if delta_pct >= 0:
        base = min(100.0, 70.0 + delta_pct * 3.0)   # +10% → 100
    else:
        base = max(0.0, 70.0 + delta_pct * 7.0)     # -10% → 0
    base = max(0.0, min(100.0, base))
    # CV penalty: above 7% CV = -15 points, above 10% = -30 points
    cv = inputs.hrv_cv_pct
    if cv is not None:
        if cv >= 10:
            base = max(0.0, base - 30.0)
        elif cv >= 7:
            base = max(0.0, base - 15.0)
    return base, f"Δ {delta_pct:+.1f}% vs 28d" + (f", CV {cv:.1f}%" if cv is not None else "")


def _rhr_component(inputs: ReadinessInputs) -> tuple[float | None, str]:
    """Lower RHR vs baseline = better. At baseline is fine (anchors at 70, not
    50, same logic as HRV); a 5% drop is excellent (→100); a 5% rise is a
    fatigue/illness flag (→0)."""
    if inputs.rhr_7d_mean is None or inputs.rhr_28d_baseline is None or inputs.rhr_28d_baseline <= 0:
        return None, "no RHR history"
    delta_pct = (inputs.rhr_7d_mean - inputs.rhr_28d_baseline) / inputs.rhr_28d_baseline * 100.0
    if delta_pct <= 0:
        score = min(100.0, 70.0 - delta_pct * 6.0)   # -5% → 100
    else:
        score = max(0.0, 70.0 - delta_pct * 14.0)    # +5% → 0
    score = max(0.0, min(100.0, score))
    return score, f"Δ {delta_pct:+.1f}% vs 28d"


def _sleep_component(inputs: ReadinessInputs) -> tuple[float | None, str]:
    """Blend last night's Garmin sleep score (0-100) with chronic debt.

    Chronic debt penalty: 0h debt = no penalty; 1h debt = -10; 2h+ = -25.
    The literature (Halson 2008, Watson 2017) is unambiguous that chronic
    short sleep matters more than a single rough night for performance.
    """
    last_night = inputs.sleep_score_last_night
    debt = inputs.avg_nightly_debt_h
    if last_night is None and debt is None:
        return None, "no sleep data"

    score = float(last_night) if last_night is not None else 70.0
    note_parts: list[str] = []
    if last_night is not None:
        note_parts.append(f"last night {last_night}")
    if debt is not None:
        if debt >= 2.0:
            score -= 25.0
        elif debt >= 1.0:
            score -= 10.0
        elif debt >= 0.5:
            score -= 5.0
        note_parts.append(f"debt {debt:.1f}h")
    score = max(0.0, min(100.0, score))
    return score, ", ".join(note_parts)


def _tsb_component(inputs: ReadinessInputs) -> tuple[float | None, str]:
    """TSB readiness bands, calibrated for athletes who *train* rather than
    perpetually taper. TSB -10..-22 is normal productive-training fatigue —
    the state build blocks are meant to be ridden in — so it scores "good",
    not "borderline". The cap only bites in genuine functional overreach
    (-22..-30) and overreach risk (<-30); the hard `easy` rail in
    safety_rails handles the danger zone below -30.

       > +20  → 65  (too fresh / detraining — the productive zone is +10..-22)
       +20..+5 → 85
       +5..-10 → 80  (optimal training balance)
       -10..-22 → 72 (productive fatigue — train normally, quality included)
       -22..-30 → 52 (functional overreach — still trainable, watch it)
       < -30  → 25  (overreach risk)
    """
    if inputs.tsb is None:
        return None, "no TSB"
    tsb = inputs.tsb
    if tsb > 20:
        score = 65.0
    elif tsb > 5:
        score = 85.0
    elif tsb > -10:
        score = 80.0
    elif tsb > -22:
        score = 72.0
    elif tsb > -30:
        score = 52.0
    else:
        score = 25.0
    return score, f"TSB {tsb:.1f}"


def _acwr_component(inputs: ReadinessInputs) -> tuple[float | None, str]:
    """ACWR ratio (Bourdon et al. 2017 IJSPP — "Monitoring Athlete Training
    Loads: Consensus Statement"). ATL/CTL with 7d:28d windows.

    Sweet-spot: 0.8-1.3. Above 1.5 → 2-4× injury/illness risk relative to
    sweet-spot. Below 0.8 → detraining risk. Above 2.0 = strong red flag.

    CTL < 20 floor: Lolli et al. 2019 (BJSM) showed ACWR is mathematically
    unstable at low chronic loads — the ratio amplifies for any spike when
    the denominator is small. We skip the component (return None) below
    CTL 20 rather than letting a meaningless ratio drag the score down.
    """
    if inputs.atl is None or inputs.ctl is None or inputs.ctl <= 0:
        return None, "no ACWR (low CTL)"
    if inputs.ctl < 20.0:
        return None, f"ACWR suppressed (CTL {inputs.ctl:.1f} < 20)"
    acwr = inputs.atl / inputs.ctl
    if acwr <= 0.8:
        score = 60.0  # detraining tail
    elif acwr <= 1.3:
        score = 95.0  # sweet spot
    elif acwr <= 1.5:
        score = 70.0  # caution
    elif acwr <= 1.8:
        score = 40.0  # injury risk doubling
    elif acwr <= 2.0:
        score = 20.0
    else:
        score = 5.0
    return score, f"ACWR {acwr:.2f}"


def _body_battery_component(inputs: ReadinessInputs) -> tuple[float | None, str]:
    if inputs.body_battery_wake is None:
        return None, "no body battery"
    bb = max(0, min(100, inputs.body_battery_wake))
    # Garmin's wake-time scale aligns roughly 1:1 with readiness, but we
    # lean a touch optimistic — wake battery 50 = score 60 — because
    # Garmin's algorithm is conservative by design (Banister TRIMP-based).
    score = 30.0 + (bb / 100.0) * 70.0
    return score, f"wake {bb}"


# ----------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------


# Weights sum to 1.0 when all components present. Sleep + HRV + TSB lead
# because they're the most-evidence-backed individual signals.
_COMPONENT_DEFS = [
    ("sleep",        _sleep_component,        0.25),
    ("hrv",          _hrv_component,          0.22),
    ("tsb",          _tsb_component,          0.20),
    ("acwr",         _acwr_component,         0.15),
    ("rhr",          _rhr_component,          0.10),
    ("body_battery", _body_battery_component, 0.08),
]


def _ceiling_from_score(score: float) -> Ceiling:
    """Map 0-100 readiness → categorical intensity ceiling.

    Calibrated so a *recovered athlete with markers at baseline* clears the
    "push" bar — being at your normal HRV/RHR and carrying ordinary build-block
    fatigue is a green light, not a "moderate" day. ~68+ → push; 45-67 →
    moderate (something real is off — short sleep, mild HRV dip); 30-44 → easy;
    <30 → rest. The hard rails in safety_rails still pre-empt this for acute
    danger signals (HRV < -10%, TSB < -30, ACWR spikes, injury).
    """
    if score >= 68:
        return "push"
    if score >= 45:
        return "moderate"
    if score >= 30:
        return "easy"
    return "rest"


def compute_readiness(inputs: ReadinessInputs) -> ReadinessReport:
    """Pure function — combine all available signals into a 0-100 readiness
    score and a categorical intensity ceiling. Components with missing
    inputs are dropped from the weighted average (weights renormalize)."""
    components: list[ComponentScore] = []
    weighted_sum = 0.0
    weight_total = 0.0
    flags: list[str] = []

    for name, scorer, weight in _COMPONENT_DEFS:
        score, note = scorer(inputs)
        components.append(ComponentScore(name=name, score=score, weight=weight, note=note))
        if score is not None:
            weighted_sum += score * weight
            weight_total += weight

    if weight_total == 0:
        overall = 50.0
        flags.append("no signals available — default neutral readiness")
    else:
        overall = weighted_sum / weight_total

    # Severity flags for the UI / brief copy.
    for c in components:
        if c.score is None:
            continue
        if c.name == "acwr" and c.score <= 40:
            flags.append(f"ACWR red flag: {c.note}")
        if c.name == "tsb" and c.score <= 52:
            # fires in functional-overreach territory (TSB < -22) and deeper
            flags.append(f"TSB deep negative: {c.note}")
        if c.name == "hrv" and c.score <= 25:
            flags.append(f"HRV suppressed: {c.note}")
        if c.name == "sleep" and c.score <= 35:
            flags.append(f"Sleep deficit: {c.note}")

    overall_int = int(round(overall))
    return ReadinessReport(
        overall=overall_int,
        ceiling=_ceiling_from_score(overall),
        components=components,
        flags=flags,
    )
