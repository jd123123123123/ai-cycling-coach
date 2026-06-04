"""Period Report — pure scoring core + DB-backed orchestration.

The top of this module is intentionally DB-free and deterministic so the
scoring logic is unit-tested in isolation. `build_report` at the bottom is
the only async, DB-touching entry point; it assembles two `WindowMetrics`
(current + previous equal window) and feeds them to the pure core.

Scoring philosophy: every axis is a documented 0-100 heuristic where higher
is better. Axes lacking inputs return score=None + insufficient_data=True and
are dropped from the composite, which renormalizes over what's available.
"""
from __future__ import annotations

from dataclasses import dataclass


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return float(max(lo, min(hi, x)))


def _lerp_score(value: float, low: float, high: float) -> float:
    """Map value in [low, high] to [0, 100], clamped. Higher value = higher score."""
    if high == low:
        return 0.0
    return _clamp((value - low) / (high - low) * 100.0)


def _inv_score(value: float, low: float, high: float) -> float:
    """Like _lerp_score but inverted: higher value = lower score (e.g. RHR, decoupling)."""
    return _clamp(100.0 - _lerp_score(value, low, high))


# (letter, inclusive lower bound on composite score)
_GRADE_BANDS: list[tuple[str, float]] = [
    ("A+", 93), ("A", 90), ("A-", 87),
    ("B+", 83), ("B", 80), ("B-", 77),
    ("C+", 73), ("C", 70), ("C-", 63),
    ("D", 0),
]


def letter_for_score(score: float) -> str:
    for letter, lo in _GRADE_BANDS:
        if score >= lo:
            return letter
    return "D"


@dataclass
class WindowMetrics:
    """Aggregated, DB-free numbers for one time window. None = no data."""
    days: int
    pmc_days: int
    avg_ctl: float | None
    ctl_delta: float | None      # within-window: last day CTL - first day CTL
    avg_tsb: float | None
    total_tss: float
    activity_count: int
    training_days: int           # distinct calendar days with >=1 activity
    longest_streak: int          # longest run of consecutive training days
    avg_if: float | None
    avg_ef: float | None
    avg_decoupling: float | None
    grey_pct: float | None       # % of activities classified in the z3 grey zone
    avg_hrv: float | None
    avg_rhr: float | None
    avg_sleep_hours: float | None
    sleep_debt_hours: float | None
    biometric_days: int


# Axis composite weights (re-normalized over available axes).
_AXIS_WEIGHTS = {
    "aerobic": 0.30,
    "recovery": 0.25,
    "consistency": 0.20,
    "intensity": 0.15,
    "durability": 0.10,
}


def _axis(key: str, label: str, score: float | None, detail: str):
    from app.schemas.period_report import RadarAxis
    return RadarAxis(
        key=key, label=label,
        score=None if score is None else round(score, 1),
        insufficient_data=score is None,
        detail=detail,
    )


def _pct_change(cur: float | None, prev: float | None) -> float | None:
    if cur is None or prev is None or prev == 0:
        return None
    return (cur - prev) / abs(prev) * 100.0


def build_radar(cur: WindowMetrics, prev: WindowMetrics | None) -> list:
    """Five 0-100 body-system axes for the current window. `prev` (the previous
    equal window) feeds the recovery trend; absent -> recovery uses sleep only."""
    axes = []

    # --- Aerobic Fitness: CTL level (65%) + within-window ramp (35%) ---
    if cur.pmc_days == 0 or cur.avg_ctl is None:
        axes.append(_axis("aerobic", "Aerobic Fitness", None, "No fitness data in this window."))
    else:
        level = _lerp_score(cur.avg_ctl, 0, 90)            # CTL 90 -> elite -> 100
        ramp_delta = cur.ctl_delta if cur.ctl_delta is not None else 0.0
        ramp = _clamp(50 + ramp_delta * 8)                 # +6 CTL -> ~98, flat -> 50
        score = 0.65 * level + 0.35 * ramp
        trend = "climbing" if ramp_delta >= 0.4 else "holding" if ramp_delta > -0.4 else "detraining"
        axes.append(_axis("aerobic", "Aerobic Fitness", score,
                          f"CTL {round(cur.avg_ctl)}, fitness {trend}."))

    # --- Recovery: sleep debt + HRV trend + RHR trend (mean of available) ---
    parts: list[float] = []
    if cur.sleep_debt_hours is not None:
        parts.append(_inv_score(cur.sleep_debt_hours, 0, 14))
    hrv_pct = _pct_change(cur.avg_hrv, prev.avg_hrv) if prev else None
    if hrv_pct is not None:
        parts.append(_clamp(50 + hrv_pct * 2.5))           # +20% HRV -> 100
    rhr_pct = _pct_change(cur.avg_rhr, prev.avg_rhr) if prev else None
    if rhr_pct is not None:
        parts.append(_clamp(50 - rhr_pct * 5))             # RHR up = worse
    if not parts:
        axes.append(_axis("recovery", "Recovery", None, "No recovery data in this window."))
    else:
        score = sum(parts) / len(parts)
        axes.append(_axis("recovery", "Recovery", score,
                          f"Sleep debt {round(cur.sleep_debt_hours or 0, 1)}h"
                          + (f", HRV {hrv_pct:+.0f}%" if hrv_pct is not None else "") + "."))

    # --- Consistency: training-day ratio (target 0.6) + small streak bonus ---
    ratio = cur.training_days / cur.days if cur.days else 0.0
    base = _lerp_score(ratio, 0, 0.6)
    streak_bonus = _clamp((cur.longest_streak - 1) * 4, 0, 20)
    cons = _clamp(0.85 * base + streak_bonus)
    axes.append(_axis("consistency", "Consistency", cons,
                      f"{cur.training_days}/{cur.days} days trained, "
                      f"best streak {cur.longest_streak}."))

    # --- Intensity Balance: penalize grey-zone (Seiler) ---
    if cur.activity_count == 0 or cur.grey_pct is None:
        axes.append(_axis("intensity", "Intensity Balance", None, "No rides to assess intensity."))
    else:
        score = _clamp(100 - cur.grey_pct * 2.5)           # 20% grey -> 50, 40% -> 0
        axes.append(_axis("intensity", "Intensity Balance", score,
                          f"{round(cur.grey_pct)}% of rides in the grey zone."))

    # --- Durability: aerobic decoupling (lower better) ---
    if cur.avg_decoupling is None:
        axes.append(_axis("durability", "Durability", None,
                          "Not enough sample-stream rides to assess drift."))
    else:
        score = _inv_score(cur.avg_decoupling, 0, 10)      # 0% -> 100, 10%+ -> 0
        axes.append(_axis("durability", "Durability", score,
                          f"Avg Pw:HR drift {cur.avg_decoupling:.1f}%."))

    return axes


def composite_grade(axes: list) -> tuple[float | None, str | None]:
    """Weighted mean over available (scored) axes, renormalized. Returns
    (score, letter) or (None, None) when every axis is insufficient."""
    num = 0.0
    denom = 0.0
    for a in axes:
        if a.score is None:
            continue
        w = _AXIS_WEIGHTS.get(a.key, 0.0)
        num += a.score * w
        denom += w
    if denom == 0:
        return None, None
    score = round(num / denom, 1)
    return score, letter_for_score(score)


# Per-metric significance config. Each entry:
#   attr           -> WindowMetrics field
#   label          -> plain verdict noun
#   why            -> one line on why it matters
#   unit           -> display unit
#   threshold      -> minimum |delta| to surface
#   relative       -> threshold is a percent of the previous value
#   higher_is_good -> True if a rise is an improvement
_DELTA_METRICS: list[dict] = [
    {"key": "ctl", "attr": "avg_ctl", "label": "Fitness", "unit": "CTL",
     "threshold": 2.0, "relative": False, "higher_is_good": True,
     "why": "Chronic load is your fitness ceiling — up is fitter."},
    {"key": "tsb", "attr": "avg_tsb", "label": "Form", "unit": "TSB",
     "threshold": 5.0, "relative": False, "higher_is_good": True,
     "why": "Positive form means you're fresher and race-ready."},
    {"key": "tss", "attr": "total_tss", "label": "Training load", "unit": "TSS",
     "threshold": 10.0, "relative": True, "higher_is_good": True,
     "why": "More quality load drives adaptation — if recovery keeps up."},
    {"key": "training_days", "attr": "training_days", "label": "Consistency", "unit": "days",
     "threshold": 1.0, "relative": False, "higher_is_good": True,
     "why": "Frequency beats heroics — more days trained compounds."},
    {"key": "hrv", "attr": "avg_hrv", "label": "HRV", "unit": "ms",
     "threshold": 5.0, "relative": True, "higher_is_good": True,
     "why": "Rising HRV signals your nervous system is adapting well."},
    {"key": "rhr", "attr": "avg_rhr", "label": "Resting HR", "unit": "bpm",
     "threshold": 2.0, "relative": False, "higher_is_good": False,
     "why": "A lower resting heart rate tracks improving aerobic health."},
    {"key": "sleep", "attr": "avg_sleep_hours", "label": "Sleep", "unit": "h",
     "threshold": 0.5, "relative": False, "higher_is_good": True,
     "why": "Sleep is the biggest lever on recovery and adaptation."},
    {"key": "ef", "attr": "avg_ef", "label": "Efficiency", "unit": "W/bpm",
     "threshold": 0.05, "relative": False, "higher_is_good": True,
     "why": "More watts per heartbeat means a stronger aerobic engine."},
    {"key": "decoupling", "attr": "avg_decoupling", "label": "Durability", "unit": "%",
     "threshold": 1.5, "relative": False, "higher_is_good": False,
     "why": "Less Pw:HR drift means you hold power deeper into rides."},
]


def build_deltas(cur: WindowMetrics, prev: WindowMetrics | None):
    """Return (improvements, weaknesses). Only metrics whose change crosses
    their significance threshold surface; everything else is noise."""
    from app.schemas.period_report import DeltaItem
    improvements: list[DeltaItem] = []
    weaknesses: list[DeltaItem] = []
    if prev is None:
        return improvements, weaknesses

    for m in _DELTA_METRICS:
        a = getattr(cur, m["attr"])
        b = getattr(prev, m["attr"])
        if a is None or b is None:
            continue
        delta = a - b
        if m["relative"]:
            if b == 0:
                continue
            significant = abs(delta) / abs(b) * 100.0 >= m["threshold"]
        else:
            significant = abs(delta) >= m["threshold"]
        if not significant or delta == 0:
            continue

        rose = delta > 0
        is_improvement = rose == m["higher_is_good"]
        direction = "up" if rose else "down"
        verb = "improving" if is_improvement else "slipping"
        detail = f"{m['label']}: {b:g} → {a:g} {m['unit']} ({delta:+g})"
        item = DeltaItem(
            key=m["key"],
            label=f"{m['label']} {verb}",
            detail=detail,
            why=m["why"],
            delta=round(delta, 2),
            unit=m["unit"],
            direction=direction,
            is_improvement=is_improvement,
        )
        (improvements if is_improvement else weaknesses).append(item)

    improvements.sort(key=lambda d: abs(d.delta), reverse=True)
    weaknesses.sort(key=lambda d: abs(d.delta), reverse=True)
    return improvements, weaknesses


def build_milestones(cur: WindowMetrics) -> list:
    """Game-y achievement chips for the window. Conservative thresholds so a
    milestone always means something."""
    from app.schemas.period_report import Milestone
    out: list[Milestone] = []

    if cur.longest_streak >= 3:
        out.append(Milestone(
            icon_key="flame",
            label=f"{cur.longest_streak}-day streak",
            detail="Consecutive days trained in this window.",
        ))
    if cur.total_tss >= 700:
        out.append(Milestone(
            icon_key="zap",
            label=f"{round(cur.total_tss)} TSS",
            detail="High training load banked this window.",
        ))
    if cur.training_days >= max(1, int(round(cur.days * 0.7))):
        out.append(Milestone(
            icon_key="trophy",
            label="Iron consistency",
            detail=f"Trained {cur.training_days} of {cur.days} days.",
        ))
    return out

