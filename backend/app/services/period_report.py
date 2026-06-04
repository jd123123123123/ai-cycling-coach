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

import logging
import statistics
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.daily_metric import DailyMetric
from app.services.advanced_metrics import compute_activity_metrics
from app.services.analytical_aggregates import (
    _activity_if,
    _extract_sleep_hours,
    _fetch_athlete_ftp,
    _zone_from_if,
    pmc_window_summary,
)

from app.config import settings

logger = logging.getLogger(__name__)


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
        detail_bits = []
        if cur.sleep_debt_hours is not None:
            detail_bits.append(f"Sleep debt {round(cur.sleep_debt_hours, 1)}h")
        if hrv_pct is not None:
            detail_bits.append(f"HRV {hrv_pct:+.0f}%")
        if rhr_pct is not None:
            detail_bits.append(f"RHR {rhr_pct:+.0f}%")
        recovery_detail = (", ".join(detail_bits) + ".") if detail_bits else "Recovery signals tracked."
        axes.append(_axis("recovery", "Recovery", score, recovery_detail))

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
    (score, letter) or (None, None) only when the axes list is empty or every
    provided axis has score None. Note: the consistency axis is always computable
    (it requires only training_days and days, which are always populated), so in
    practice (None, None) should not occur from a normal build_radar call."""
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
    improvements: list[tuple[float, DeltaItem]] = []
    weaknesses: list[tuple[float, DeltaItem]] = []
    if prev is None:
        return [], []

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
            sig = abs(delta) / abs(b) * 100.0 / m["threshold"]
        else:
            significant = abs(delta) >= m["threshold"]
            sig = abs(delta) / m["threshold"]
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
        (improvements if is_improvement else weaknesses).append((sig, item))

    improvements.sort(key=lambda t: t[0], reverse=True)
    weaknesses.sort(key=lambda t: t[0], reverse=True)
    return [item for _, item in improvements], [item for _, item in weaknesses]


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


def _longest_streak(training_dates: set[date]) -> int:
    """Longest run of consecutive calendar days in the set."""
    if not training_dates:
        return 0
    ordered = sorted(training_dates)
    best = run = 1
    for prev, cur in zip(ordered, ordered[1:]):
        if (cur - prev).days == 1:
            run += 1
            best = max(best, run)
        else:
            run = 1
    return best


async def _fetch_window_metrics(
    db: AsyncSession, user_id: int, start: date, end: date, ftp: int | None
) -> WindowMetrics:
    """Aggregate one [start, end] window into a WindowMetrics. DB-touching but
    delegates all numeric judgement to the pure core."""
    days = (end - start).days + 1
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end, time.max, tzinfo=timezone.utc)

    # --- PMC (CTL/ATL/TSB) via the existing windowed summary ---
    pmc = await pmc_window_summary(user_id=user_id, start_date=start, end_date=end, db=db)
    pmc_days = len(pmc["days"])
    agg = pmc["aggregate"]
    avg_ctl = agg["avg_ctl"] if pmc_days else None
    avg_tsb = agg["avg_tsb"] if pmc_days else None
    ctl_delta = pmc["trend"]["ctl_delta"] if pmc_days >= 2 else (0.0 if pmc_days else None)

    # --- Activities in the window ---
    a_stmt = (
        select(Activity)
        .where(Activity.user_id == user_id,
               Activity.started_at >= start_dt,
               Activity.started_at <= end_dt)
        .order_by(Activity.started_at.asc())
    )
    activities = list((await db.execute(a_stmt)).scalars().all())

    total_tss = sum(float(a.tss or 0) for a in activities)
    training_dates = {a.started_at.date() for a in activities}
    if_values: list[float] = []
    ef_values: list[float] = []
    dec_values: list[float] = []
    grey = 0
    classified = 0
    for a in activities:
        if_val = _activity_if(a, ftp)
        if if_val is not None:
            if_values.append(if_val)
            classified += 1
            if _zone_from_if(if_val) == "z3":
                grey += 1
        m = compute_activity_metrics(a)
        if m["ef"] is not None:
            ef_values.append(m["ef"])
        if m["decoupling"] is not None:
            dec_values.append(m["decoupling"])

    # --- Biometrics in the window ---
    m_stmt = (
        select(DailyMetric)
        .where(DailyMetric.user_id == user_id,
               DailyMetric.recorded_at >= start_dt,
               DailyMetric.recorded_at <= end_dt)
    )
    metrics = list((await db.execute(m_stmt)).scalars().all())
    hrv_vals = [m.hrv_status for m in metrics if m.hrv_status is not None]
    rhr_vals = [m.resting_hr for m in metrics if m.resting_hr is not None]
    sleep_vals: list[float] = []
    for m in metrics:
        hrs = _extract_sleep_hours(m)  # tolerates Garmin's nested raw_data shapes
        if hrs is not None:
            sleep_vals.append(hrs)
    avg_sleep = statistics.mean(sleep_vals) if sleep_vals else None
    # Sleep debt vs 7.5h target, summed over nights with data.
    sleep_debt = (
        sum(max(0.0, 7.5 - h) for h in sleep_vals) if sleep_vals else None
    )

    return WindowMetrics(
        days=days,
        pmc_days=pmc_days,
        avg_ctl=avg_ctl,
        ctl_delta=ctl_delta,
        avg_tsb=avg_tsb,
        total_tss=round(total_tss, 1),
        activity_count=len(activities),
        training_days=len(training_dates),
        longest_streak=_longest_streak(training_dates),
        avg_if=round(statistics.mean(if_values), 3) if if_values else None,
        avg_ef=round(statistics.mean(ef_values), 3) if ef_values else None,
        avg_decoupling=round(statistics.mean(dec_values), 2) if dec_values else None,
        grey_pct=round(grey / classified * 100.0, 1) if classified else None,
        avg_hrv=round(statistics.mean(hrv_vals), 1) if hrv_vals else None,
        avg_rhr=round(statistics.mean(rhr_vals), 1) if rhr_vals else None,
        avg_sleep_hours=round(avg_sleep, 2) if avg_sleep is not None else None,
        sleep_debt_hours=round(sleep_debt, 1) if sleep_debt is not None else None,
        biometric_days=len(metrics),
    )


def _rule_based_verdict(
    days: int,
    grade_letter: str | None,
    grade_score: float | None,
    top_improvement: str | None,
    top_weakness: str | None,
) -> str:
    """Deterministic 1-2 sentence summary used when Claude is unavailable."""
    if grade_letter is None:
        return (f"Your last {days} days don't have enough data to grade yet — "
                "connect a device or log a few rides to unlock your report.")
    bits = [f"Your last {days} days grade {grade_letter} ({round(grade_score or 0)}/100)."]
    if top_improvement:
        bits.append(f"Biggest win: {top_improvement.lower()}.")
    if top_weakness:
        bits.append(f"Watch: {top_weakness.lower()}.")
    text = " ".join(bits)
    return text[:280]


_VERDICT_SYSTEM = (
    "You are an endurance coach giving an athlete a punchy verdict on their "
    "training window. One or two sentences, plain and direct. Name the grade "
    "and the single most important thing to celebrate or fix. No platitudes, "
    "no emoji, no hedging. Do not exceed 280 characters."
)


async def _ai_verdict(
    days: int,
    grade_letter: str | None,
    grade_score: float | None,
    improvements: list,
    weaknesses: list,
) -> tuple[str, str]:
    """Return (verdict_text, model_used). Falls back to a rule-based string when
    no API key is set or the call fails — mirrors /analytics/summarize."""
    top_imp = improvements[0].label if improvements else None
    top_weak = weaknesses[0].label if weaknesses else None
    fallback = _rule_based_verdict(days, grade_letter, grade_score, top_imp, top_weak)

    if not settings.ANTHROPIC_API_KEY:
        return fallback, "rule-based-fallback"

    user_msg = (
        f"Window: last {days} days\n"
        f"Grade: {grade_letter} ({grade_score}/100)\n"
        f"Improvements: {[i.detail for i in improvements[:4]]}\n"
        f"Weaknesses: {[w.detail for w in weaknesses[:4]]}\n"
    )
    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model=settings.COACH_MODEL,
            max_tokens=160,
            system=[{"type": "text", "text": _VERDICT_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_msg}],
        )
        text = ""
        for block in getattr(response, "content", None) or []:
            block_text = getattr(block, "text", None)
            if block_text:
                text += block_text
        text = text.strip()
        if not text:
            raise RuntimeError("empty Claude response")
        return text[:280], settings.COACH_MODEL
    except Exception as exc:  # noqa: BLE001
        logger.exception("Period-report verdict failed: %s", exc)
        return fallback, "rule-based-fallback"


async def build_report(db: AsyncSession, user_id: int, days: int):
    """Assemble the full PeriodReport for the last `days` days vs the previous
    equal window."""
    from app.schemas.period_report import PeriodReport

    days = max(3, min(int(days), 365))
    today = date.today()
    end = today
    start = today - timedelta(days=days - 1)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)

    ftp = await _fetch_athlete_ftp(db, user_id)
    cur = await _fetch_window_metrics(db, user_id, start, end, ftp)
    prev = await _fetch_window_metrics(db, user_id, prev_start, prev_end, ftp)
    has_baseline = (prev.activity_count > 0 or prev.pmc_days > 0
                    or prev.biometric_days > 0)
    prev_for_calc = prev if has_baseline else None

    radar = build_radar(cur, prev_for_calc)
    grade_score, grade_letter = composite_grade(radar)
    improvements, weaknesses = build_deltas(cur, prev_for_calc)
    milestones = build_milestones(cur)
    verdict, model = await _ai_verdict(
        days, grade_letter, grade_score, improvements, weaknesses
    )

    return PeriodReport(
        days=days,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        prev_start_date=prev_start.isoformat(),
        prev_end_date=prev_end.isoformat(),
        has_baseline=has_baseline,
        grade_letter=grade_letter,
        grade_score=grade_score,
        radar=radar,
        improvements=improvements,
        weaknesses=weaknesses,
        milestones=milestones,
        ai_verdict=verdict,
        ai_model=model,
    )

