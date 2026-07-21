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

import asyncio
import logging
import statistics
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import ValidationError

from app.models.activity import Activity
from app.models.daily_metric import DailyMetric
from app.models.period_report_cache import PeriodReportCache
from app.services.advanced_metrics import compute_activity_metrics, why_am_i_tired
from app.services.analytical_aggregates import (
    _activity_if,
    _extract_sleep_hours,
    _fetch_athlete_ftp,
    _zone_from_if,
    pmc_window_summary,
)

from app.config import settings

logger = logging.getLogger(__name__)

MORNING_HOUR = 9


def should_precompute_daily(now_utc: datetime, tz_name: str | None, last_generated_at: datetime | None) -> bool:
    """True when it's at/after MORNING_HOUR in the athlete's local time AND the
    presets weren't already (re)generated at/after this morning's hour today.
    tz_name None or invalid → UTC."""
    try:
        tz = ZoneInfo(tz_name) if tz_name else timezone.utc
    except Exception:  # noqa: BLE001 — unknown IANA name → UTC
        tz = timezone.utc
    local_now = now_utc.astimezone(tz)
    if local_now.hour < MORNING_HOUR:
        return False
    if last_generated_at is None:
        return True
    morning_today = local_now.replace(hour=MORNING_HOUR, minute=0, second=0, microsecond=0)
    return last_generated_at.astimezone(tz) < morning_today


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
    grey_pct: float | None       # % of activities classified in the z2 grey zone
    avg_hrv: float | None
    avg_rhr: float | None
    avg_sleep_hours: float | None
    sleep_debt_hours: float | None
    biometric_days: int
    # Intensity distribution (Seiler 3-zone) by ride count, and the daily TSS
    # series — both feed the new insight blocks. Defaulted so older callers and
    # tests that build WindowMetrics positionally/by-name keep working.
    z1_count: int = 0
    z2_count: int = 0
    z3_count: int = 0
    daily_tss: list[float] = field(default_factory=list)


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


def build_radar(cur: WindowMetrics, prev: WindowMetrics | None, lang: str = "en") -> list:
    """Five 0-100 body-system axes for the current window. `prev` (the previous
    equal window) feeds the recovery trend; absent -> recovery uses sleep only."""
    de = lang == "de"
    axes = []

    # --- Aerobic Fitness: CTL level (65%) + within-window ramp (35%) ---
    aerobic_label = "Aerobe Fitness" if de else "Aerobic Fitness"
    if cur.pmc_days == 0 or cur.avg_ctl is None:
        axes.append(_axis("aerobic", aerobic_label, None,
                          "Keine Fitnessdaten in diesem Zeitraum." if de
                          else "No fitness data in this window."))
    else:
        level = _lerp_score(cur.avg_ctl, 0, 90)            # CTL 90 -> elite -> 100
        ramp_delta = cur.ctl_delta if cur.ctl_delta is not None else 0.0
        ramp = _clamp(50 + ramp_delta * 8)                 # +6 CTL -> ~98, flat -> 50
        score = 0.65 * level + 0.35 * ramp
        if de:
            trend = "steigend" if ramp_delta >= 0.4 else "stabil" if ramp_delta > -0.4 else "nachlassend"
            detail = f"CTL {round(cur.avg_ctl)}, Fitness {trend}."
        else:
            trend = "climbing" if ramp_delta >= 0.4 else "holding" if ramp_delta > -0.4 else "detraining"
            detail = f"CTL {round(cur.avg_ctl)}, fitness {trend}."
        axes.append(_axis("aerobic", aerobic_label, score, detail))

    # --- Recovery: sleep debt + HRV trend + RHR trend (mean of available) ---
    recovery_label = "Erholung" if de else "Recovery"
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
        axes.append(_axis("recovery", recovery_label, None,
                          "Keine Erholungsdaten in diesem Zeitraum." if de
                          else "No recovery data in this window."))
    else:
        score = sum(parts) / len(parts)
        detail_bits = []
        if cur.sleep_debt_hours is not None:
            detail_bits.append((f"Schlafdefizit {round(cur.sleep_debt_hours, 1)} h" if de
                                else f"Sleep debt {round(cur.sleep_debt_hours, 1)}h"))
        if hrv_pct is not None:
            detail_bits.append(f"HRV {hrv_pct:+.0f}%")
        if rhr_pct is not None:
            detail_bits.append(f"RHR {rhr_pct:+.0f}%")
        if detail_bits:
            recovery_detail = ", ".join(detail_bits) + "."
        else:
            recovery_detail = "Erholungssignale erfasst." if de else "Recovery signals tracked."
        axes.append(_axis("recovery", recovery_label, score, recovery_detail))

    # --- Consistency: training-day ratio (target 0.6) + small streak bonus ---
    ratio = cur.training_days / cur.days if cur.days else 0.0
    base = _lerp_score(ratio, 0, 0.6)
    streak_bonus = _clamp((cur.longest_streak - 1) * 4, 0, 20)
    cons = _clamp(0.85 * base + streak_bonus)
    if de:
        cons_detail = (f"{cur.training_days}/{cur.days} Tage trainiert, "
                       f"beste Serie {cur.longest_streak}.")
    else:
        cons_detail = (f"{cur.training_days}/{cur.days} days trained, "
                       f"best streak {cur.longest_streak}.")
    axes.append(_axis("consistency", "Konstanz" if de else "Consistency", cons, cons_detail))

    # --- Intensity Balance: penalize grey-zone (Seiler) ---
    intensity_label = "Intensitäts-Balance" if de else "Intensity Balance"
    if cur.activity_count == 0 or cur.grey_pct is None:
        axes.append(_axis("intensity", intensity_label, None,
                          "Keine Fahrten zur Intensitätsbewertung." if de
                          else "No rides to assess intensity."))
    else:
        score = _clamp(100 - cur.grey_pct * 2.5)           # 20% grey -> 50, 40% -> 0
        axes.append(_axis("intensity", intensity_label, score,
                          (f"{round(cur.grey_pct)}% der Fahrten in der grauen Zone." if de
                           else f"{round(cur.grey_pct)}% of rides in the grey zone.")))

    # --- Durability: aerobic decoupling (lower better) ---
    if cur.avg_decoupling is None:
        axes.append(_axis("durability", "Durability", None,
                          "Zu wenige Fahrten mit Streamdaten für die Drift-Bewertung." if de
                          else "Not enough sample-stream rides to assess drift."))
    else:
        score = _inv_score(cur.avg_decoupling, 0, 10)      # 0% -> 100, 10%+ -> 0
        axes.append(_axis("durability", "Durability", score,
                          (f"Ø Pw:HF-Drift {cur.avg_decoupling:.1f}%." if de
                           else f"Avg Pw:HR drift {cur.avg_decoupling:.1f}%.")))

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
     "why": "Chronic load is your fitness ceiling — up is fitter.",
     "label_de": "Fitness",
     "why_de": "Die chronische Last ist deine Fitness-Obergrenze — mehr heißt fitter."},
    {"key": "tsb", "attr": "avg_tsb", "label": "Form", "unit": "TSB",
     "threshold": 5.0, "relative": False, "higher_is_good": True,
     "why": "Positive form means you're fresher and race-ready.",
     "label_de": "Form",
     "why_de": "Positive Form heißt frischer und rennbereit."},
    {"key": "tss", "attr": "total_tss", "label": "Training load", "unit": "TSS",
     "threshold": 10.0, "relative": True, "higher_is_good": True,
     "why": "More quality load drives adaptation — if recovery keeps up.",
     "label_de": "Trainingslast",
     "why_de": "Mehr Qualitätslast treibt die Anpassung — solange die Erholung mithält."},
    {"key": "training_days", "attr": "training_days", "label": "Consistency", "unit": "days",
     "threshold": 1.0, "relative": False, "higher_is_good": True,
     "why": "Frequency beats heroics — more days trained compounds.",
     "label_de": "Konstanz", "unit_de": "Tage",
     "why_de": "Frequenz schlägt Heldentaten — mehr Trainingstage summieren sich."},
    {"key": "hrv", "attr": "avg_hrv", "label": "HRV", "unit": "ms",
     "threshold": 5.0, "relative": True, "higher_is_good": True,
     "why": "Rising HRV signals your nervous system is adapting well.",
     "label_de": "HRV",
     "why_de": "Steigende HRV zeigt, dass sich dein Nervensystem gut anpasst."},
    {"key": "rhr", "attr": "avg_rhr", "label": "Resting HR", "unit": "bpm",
     "threshold": 2.0, "relative": False, "higher_is_good": False,
     "why": "A lower resting heart rate tracks improving aerobic health.",
     "label_de": "Ruhepuls",
     "why_de": "Ein niedrigerer Ruhepuls spricht für bessere aerobe Gesundheit."},
    {"key": "sleep", "attr": "avg_sleep_hours", "label": "Sleep", "unit": "h",
     "threshold": 0.5, "relative": False, "higher_is_good": True,
     "why": "Sleep is the biggest lever on recovery and adaptation.",
     "label_de": "Schlaf",
     "why_de": "Schlaf ist der größte Hebel für Erholung und Anpassung."},
    {"key": "ef", "attr": "avg_ef", "label": "Efficiency", "unit": "W/bpm",
     "threshold": 0.05, "relative": False, "higher_is_good": True,
     "why": "More watts per heartbeat means a stronger aerobic engine.",
     "label_de": "Effizienz",
     "why_de": "Mehr Watt pro Herzschlag heißt ein stärkerer aerober Motor."},
    {"key": "decoupling", "attr": "avg_decoupling", "label": "Durability", "unit": "%",
     "threshold": 1.5, "relative": False, "higher_is_good": False,
     "why": "Less Pw:HR drift means you hold power deeper into rides.",
     "label_de": "Durability",
     "why_de": "Weniger Pw:HF-Drift heißt, du hältst die Leistung länger durch."},
]


def build_deltas(cur: WindowMetrics, prev: WindowMetrics | None, lang: str = "en"):
    """Return (improvements, weaknesses). Only metrics whose change crosses
    their significance threshold surface; everything else is noise."""
    from app.schemas.period_report import DeltaItem
    de = lang == "de"
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
        label_txt = m["label_de"] if de else m["label"]
        unit_txt = m.get("unit_de", m["unit"]) if de else m["unit"]
        why_txt = m["why_de"] if de else m["why"]
        if de:
            verb = "verbessert" if is_improvement else "nachlassend"
        else:
            verb = "improving" if is_improvement else "slipping"
        detail = f"{label_txt}: {b:g} → {a:g} {unit_txt} ({delta:+g})"
        item = DeltaItem(
            key=m["key"],
            label=f"{label_txt} {verb}",
            detail=detail,
            why=why_txt,
            delta=round(delta, 2),
            prev_value=round(b, 2),
            curr_value=round(a, 2),
            unit=unit_txt,
            direction=direction,
            is_improvement=is_improvement,
        )
        (improvements if is_improvement else weaknesses).append((sig, item))

    improvements.sort(key=lambda t: t[0], reverse=True)
    weaknesses.sort(key=lambda t: t[0], reverse=True)
    return [item for _, item in improvements], [item for _, item in weaknesses]


def build_milestones(cur: WindowMetrics, lang: str = "en") -> list:
    """Game-y achievement chips for the window. Conservative thresholds so a
    milestone always means something."""
    from app.schemas.period_report import Milestone
    de = lang == "de"
    out: list[Milestone] = []

    if cur.longest_streak >= 3:
        out.append(Milestone(
            icon_key="flame",
            label=(f"{cur.longest_streak}-Tage-Serie" if de else f"{cur.longest_streak}-day streak"),
            detail=("Aufeinanderfolgende Trainingstage in diesem Zeitraum." if de
                    else "Consecutive days trained in this window."),
        ))
    if cur.total_tss >= 700:
        out.append(Milestone(
            icon_key="zap",
            label=f"{round(cur.total_tss)} TSS",
            detail=("Hohe Trainingslast in diesem Zeitraum gesammelt." if de
                    else "High training load banked this window."),
        ))
    if cur.training_days >= max(1, int(round(cur.days * 0.7))):
        out.append(Milestone(
            icon_key="trophy",
            label="Eiserne Konstanz" if de else "Iron consistency",
            detail=(f"{cur.training_days} von {cur.days} Tagen trainiert." if de
                    else f"Trained {cur.training_days} of {cur.days} days."),
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
    z1_count = z2_count = z3_count = 0
    for a in activities:
        if_val = _activity_if(a, ftp)
        if if_val is not None:
            if_values.append(if_val)
            classified += 1
            zone = _zone_from_if(if_val)
            if zone == "z1":
                z1_count += 1
            elif zone == "z2":
                z2_count += 1
                grey += 1
            elif zone == "z3":
                z3_count += 1
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
        z1_count=z1_count,
        z2_count=z2_count,
        z3_count=z3_count,
        daily_tss=[float(d.get("daily_tss", 0.0)) for d in pmc["days"]],
    )


def _rule_based_verdict(
    days: int,
    grade_letter: str | None,
    grade_score: float | None,
    top_improvement: str | None,
    top_weakness: str | None,
    lang: str = "en",
) -> str:
    """Deterministic 1-2 sentence summary used when Claude is unavailable."""
    de = lang == "de"
    if grade_letter is None:
        if de:
            return (f"Deine letzten {days} Tage haben noch nicht genug Daten für eine "
                    "Bewertung — verbinde ein Gerät oder logge ein paar Fahrten, um "
                    "deinen Report freizuschalten.")
        return (f"Your last {days} days don't have enough data to grade yet — "
                "connect a device or log a few rides to unlock your report.")
    if de:
        bits = [f"Deine letzten {days} Tage werden mit {grade_letter} "
                f"({round(grade_score or 0)}/100) bewertet."]
        if top_improvement:
            bits.append(f"Größter Gewinn: {top_improvement.lower()}.")
        if top_weakness:
            bits.append(f"Achtung: {top_weakness.lower()}.")
    else:
        bits = [f"Your last {days} days grade {grade_letter} ({round(grade_score or 0)}/100)."]
        if top_improvement:
            bits.append(f"Biggest win: {top_improvement.lower()}.")
        if top_weakness:
            bits.append(f"Watch: {top_weakness.lower()}.")
    text = " ".join(bits)
    return text[:280]


def _percentile(value: float, population: list[float]) -> int | None:
    """Percent of `population` <= `value`, 0-100. None when population empty.
    Used for 'Top X% vs your recent history'."""
    if not population:
        return None
    n_le = sum(1 for p in population if p <= value)
    return round(n_le / len(population) * 100)


def build_evidence(cur: WindowMetrics, prev: WindowMetrics | None, lang: str = "en") -> list:
    """Compact metric chips for under the verdict — CoachBrief style. Level
    chips (CTL/TSB) always show; trend chips (HRV/RHR) only with a baseline."""
    from app.schemas.period_report import EvidenceChip
    de = lang == "de"
    chips: list[EvidenceChip] = []

    if cur.avg_ctl is not None:
        chips.append(EvidenceChip(label="CTL", value=str(round(cur.avg_ctl)), tone="neutral"))
    if cur.avg_tsb is not None:
        tsb = round(cur.avg_tsb)
        tone = "good" if tsb > 5 else "bad" if tsb < -20 else "neutral"
        chips.append(EvidenceChip(label="TSB", value=f"{tsb:+d}", tone=tone))
    if cur.total_tss:
        chips.append(EvidenceChip(label="TSS", value=str(round(cur.total_tss)), tone="neutral"))

    hrv_pct = _pct_change(cur.avg_hrv, prev.avg_hrv) if prev else None
    if hrv_pct is not None:
        chips.append(EvidenceChip(label="HRV", value=f"{hrv_pct:+.0f}%",
                                  tone="good" if hrv_pct >= 0 else "bad"))
    if cur.sleep_debt_hours is not None and cur.sleep_debt_hours >= 0.5:
        chips.append(EvidenceChip(label="Schlafdefizit" if de else "Sleep debt",
                                  value=f"{cur.sleep_debt_hours:.1f}h",
                                  tone="bad" if cur.sleep_debt_hours >= 4 else "neutral"))
    if cur.grey_pct is not None and cur.grey_pct >= 20:
        chips.append(EvidenceChip(label="Graue Zone" if de else "Grey zone",
                                  value=f"{round(cur.grey_pct)}%", tone="bad"))
    return chips


# Human-readable German names for the TID model machine keys.
_TID_MODEL_DE = {
    "polarized": "polarisiert",
    "pyramidal": "pyramidal",
    "threshold": "schwellenlastig",
    "high_intensity": "hochintensiv",
}


def build_intensity(cur: WindowMetrics, phase: str | None, lang: str = "en"):
    """Seiler 3-zone intensity distribution vs the phase target. Returns None
    when no ride could be classified into a zone."""
    from app.schemas.period_report import IntensityMix
    from app.services.tid_optimizer import assess_tid

    de = lang == "de"
    sample = cur.z1_count + cur.z2_count + cur.z3_count
    if sample == 0:
        return None

    a = assess_tid(cur.z1_count, cur.z2_count, cur.z3_count, phase)
    if de:
        model_name = _TID_MODEL_DE.get(a.model, a.model.replace("_", " "))
        verdict = (
            f"{a.z1_pct:.0f}% locker / {a.z2_pct:.0f}% moderat / {a.z3_pct:.0f}% hart — "
            f"ein {model_name}es Profil."
        )
        if a.aligned:
            fix = None
        elif a.target == "polarized":
            fix = ("Zu viel Grauzonen-Arbeit zum Schärfen. Polarisiere: lockere Tage "
                   "wirklich locker (unter LT1), harte Tage richtig hart (VO2), und "
                   "reduziere das Tempo-/Schwellen-Volumen.")
        else:
            fix = ("Baue eine breitere aerobe Basis: halte das meiste Volumen locker und "
                   "lass die Schwellenarbeit in den harten Anteil auslaufen — ein "
                   "pyramidales Profil.")
    else:
        verdict = (
            f"{a.z1_pct:.0f}% easy / {a.z2_pct:.0f}% moderate / {a.z3_pct:.0f}% hard — "
            f"a {a.model.replace('_', ' ')} shape."
        )
        fix = None if a.aligned else a.recommendation
    return IntensityMix(
        z1_pct=a.z1_pct, z2_pct=a.z2_pct, z3_pct=a.z3_pct,
        model=a.model, target_model=a.target, aligned=a.aligned,
        verdict=verdict,
        fix=fix,
        sample_rides=sample,
    )


def build_load_dynamics(cur: WindowMetrics, lang: str = "en"):
    """Foster monotony/strain + weekly CTL ramp over the window. Returns None
    when there are too few training days to read a pattern."""
    from app.schemas.period_report import LoadDynamics

    de = lang == "de"
    if cur.training_days < 4 or not cur.daily_tss:
        return None

    daily = cur.daily_tss
    weeks = cur.days / 7.0 if cur.days else 1.0
    ramp = round(cur.ctl_delta / weeks, 1) if cur.ctl_delta is not None and weeks else None

    mean = statistics.mean(daily)
    sd = statistics.pstdev(daily) if len(daily) > 1 else 0.0
    # Foster: monotony = mean/SD (high = every day alike → poor recovery contrast).
    monotony = round(mean / sd, 2) if sd > 0 else None
    weekly_load = mean * 7.0
    strain = round(weekly_load * monotony) if monotony is not None else None

    flag = "ok"
    if ramp is not None and ramp >= 6.0:
        flag = "ramping"
        if de:
            note = (f"Die Fitness steigt schnell (+{ramp:g} CTL/Woche). Halte den "
                    "wöchentlichen Lastanstieg unter ~8 % und plane bald eine "
                    "Erholungswoche, um die Gewinne zu sichern.")
        else:
            note = (f"Fitness is ramping fast (+{ramp:g} CTL/week). Keep the weekly load "
                    "rise under ~8% and bank a recovery week soon to lock it in.")
    elif monotony is not None and monotony >= 2.0:
        flag = "monotonous"
        if de:
            note = (f"Jeder Tag sieht gleich aus (Monotonie {monotony:g}). Baue echte "
                    "lockere Tage und einen richtig harten Tag ein — Kontrast treibt "
                    "Anpassung und Erholung.")
        else:
            note = (f"Every day looks alike (monotony {monotony:g}). Add true easy days and "
                    "one genuinely hard day — contrast is what drives adaptation and recovery.")
    elif sd == 0 or (ramp is not None and ramp <= 0.3 and mean < 40):
        flag = "flat"
        note = ("Die Last ist flach — füge eine Einheit oder eine längere Fahrt hinzu, "
                "um weiter anzupassen." if de
                else "Load is flat — add a session or a longer ride to keep adapting.")
    else:
        bits = []
        if ramp is not None:
            bits.append((f"Anstieg +{ramp:g} CTL/Woche" if de else f"ramp +{ramp:g} CTL/week"))
        if monotony is not None:
            bits.append((f"Monotonie {monotony:g}" if de else f"monotony {monotony:g}"))
        if de:
            note = "Gesunde Last" + (" — " + ", ".join(bits) + "." if bits else ".")
        else:
            note = "Healthy load" + (" — " + ", ".join(bits) + "." if bits else ".")

    return LoadDynamics(
        ramp_per_week=ramp, monotony=monotony, strain=strain, flag=flag, note=note,
    )


async def build_trajectory(db: AsyncSession, user_id: int, phase: str | None, lang: str = "en"):
    """Race-day trajectory via the ONE producer (`compute_goal_trajectory`) —
    identical goals normalization and plan simulation as the coach's
    /goal-trajectory endpoint, so the period report can never disagree with
    the live coach (the 271-vs-294 fork, usability audit P0-5).

    Returns None on hard failure OR when the projection basis is 'none'
    (no target event / not enough history) — an honest omitted panel beats a
    fabricated zero."""
    from app.models.athlete_profile import AthleteProfile
    from app.schemas.period_report import Trajectory
    from app.services.goal_trajectory import compute_goal_trajectory

    try:
        profile = (
            await db.execute(
                select(AthleteProfile).where(AthleteProfile.user_id == user_id)
            )
        ).scalar_one_or_none()
        payload = await compute_goal_trajectory(db, user_id, profile, lang=lang)
        if payload is None or payload.get("projection_basis") == "none":
            return None
        # 'unknown' is a machine filler, not a fact — emit null so the UI
        # renders an honest '—' instead of the English word "unknown" under
        # Peak-Form ETA (usability audit P1-6).
        taper = payload["taper_window"]
        return Trajectory(
            days_to_goal=payload["days_to_goal"],
            ctl_now=payload["ctl_now"],
            ctl_7d_delta=payload["ctl_7d_delta"],
            ctl_projected_at_goal=payload["ctl_projected_at_goal"],
            ctl_target=payload["ctl_target"],
            tsb_projected_at_goal=payload["tsb_projected_at_goal"],
            taper_window=None if taper == "unknown" else taper,
            on_track=payload["on_track"],
            weekly_tss_required=payload["weekly_tss_required"],
            weekly_tss_actual=payload["weekly_tss_actual"],
            narrative=payload["narrative_hook"],
        )
    except Exception:  # noqa: BLE001
        logger.exception("build_trajectory failed for user %s", user_id)
        return None


def build_prescriptions(
    grade_score: float | None,
    cur: WindowMetrics,
    causes: list,
    intensity=None,
    load_dynamics=None,
    trajectory=None,
    lang: str = "en",
) -> list:
    """Ranked, concrete actions for the coming window. Safety always leads: a
    high-severity cause or deep-negative form means back off, and while
    recovering we never prescribe adding load. Otherwise we surface the most
    valuable changes — trajectory gap, intensity mix, consistency, ramp, sleep —
    capped at four, each with the expected effect."""
    from app.schemas.period_report import Prescription

    de = lang == "de"
    high = any(getattr(c, "severity", None) == "high" for c in causes)
    deep_neg_form = cur.avg_tsb is not None and cur.avg_tsb < -20
    recovering = high or deep_neg_form
    ratio = cur.training_days / cur.days if cur.days else 0.0
    ramp = cur.ctl_delta if cur.ctl_delta is not None else 0.0

    out: list = []

    if recovering:
        out.append(Prescription(
            priority=0,
            headline="Zurückschalten und erholen" if de else "Back off and recover",
            icon_key="rest", tone="bad",
            detail=("Deine Erholungssignale blinken. Nimm 2-3 lockere Tage oder einen "
                    "Ruhetag, bevor du wieder hart fährst." if de
                    else "Your recovery signals are flashing. Take 2-3 easy days or a rest day "
                    "before any hard efforts."),
            effect=("Lässt die Anpassung aufholen — du wächst, wenn du Last verarbeitest, "
                    "nicht wenn du sie anhäufst." if de
                    else "Lets adaptation catch up — you grow when you absorb load, not when you pile it on."),
        ))

    # Trajectory gap — only when we're not actively recovering.
    if not recovering and trajectory is not None:
        gap = trajectory.weekly_tss_required - trajectory.weekly_tss_actual
        if trajectory.on_track in {"behind", "at_risk"} and gap > max(20.0, 0.05 * trajectory.weekly_tss_actual):
            if de:
                effect = (f"Schließt die Fitness-Lücke Richtung CTL {round(trajectory.ctl_target)}."
                          if trajectory.ctl_target else "Hält deine Fitness auf den Renntag ausgerichtet.")
            else:
                effect = (f"Closes the fitness gap toward CTL {round(trajectory.ctl_target)}."
                          if trajectory.ctl_target else "Keeps your fitness pointed at race day.")
            out.append(Prescription(
                priority=0,
                headline="Wochenlast anheben, um auf Kurs zu bleiben" if de else "Lift weekly load to stay on track",
                icon_key="build", tone="caution",
                detail=(f"Füge ~{round(gap)} TSS/Woche hinzu, um dein Ziel bis zum Renntag zu "
                        f"erreichen (jetzt ~{round(trajectory.weekly_tss_actual)}, "
                        f"nötig ~{round(trajectory.weekly_tss_required)})." if de
                        else f"Add ~{round(gap)} TSS/week to reach your target by event day "
                        f"(now ~{round(trajectory.weekly_tss_actual)}, need ~{round(trajectory.weekly_tss_required)})."),
                effect=effect,
            ))

    # Consistency.
    if ratio < 0.3:
        out.append(Prescription(
            priority=0,
            headline="Erst die Gewohnheit aufbauen" if de else "Build the habit first",
            icon_key="build", tone="caution",
            detail=(f"Du hast {cur.training_days} von {cur.days} Tagen trainiert. Konstanz "
                    "kommt zuerst — plane eine weitere kurze Einheit, bevor du die großen "
                    "Tage jagst." if de
                    else f"You trained {cur.training_days} of {cur.days} days. Consistency comes "
                    "first — aim for one more short session before chasing big days."),
            effect=("Konstanz schlägt Intensität — Frequenz baut die aerobe Basis." if de
                    else "Consistency beats intensity — frequency is what builds the aerobic base."),
        ))

    # Intensity mix.
    if intensity is not None and not intensity.aligned and intensity.fix:
        out.append(Prescription(
            priority=0,
            headline="Intensitäts-Mix korrigieren" if de else "Fix your intensity mix",
            icon_key="balance", tone="caution",
            detail=intensity.fix,
            effect=("Mehr passende Anpassung pro Stunde — weniger sinnlose Tempo-Kilometer." if de
                    else "More of the right adaptation per hour — fewer junk-tempo miles."),
        ))

    # Load shape.
    if not recovering and load_dynamics is not None:
        if load_dynamics.flag == "monotonous":
            out.append(Prescription(
                priority=0,
                headline="Lockere und harte Tage abwechseln" if de else "Vary easy and hard days",
                icon_key="balance", tone="neutral",
                detail=load_dynamics.note,
                effect=("Der Tag-zu-Tag-Kontrast senkt die Monotonie und ermöglicht bessere "
                        "Erholung." if de
                        else "Day-to-day contrast lowers monotony and unlocks better recovery."),
            ))
        elif load_dynamics.flag == "ramping" or (not recovering and ramp >= 4.0):
            out.append(Prescription(
                priority=0,
                headline="Anstieg halten, dann erholen" if de else "Hold the ramp, then recover",
                icon_key="build", tone="good",
                detail=("Die Fitness steigt schnell. Halte den Reiz, aber deckle den "
                        "wöchentlichen Lastanstieg nahe 8 % (Friel) und plane eine "
                        "Erholungswoche." if de
                        else "Fitness is climbing fast. Keep the stimulus but cap the weekly load "
                        "rise near 8% (Friel) and plan a recovery week."),
                effect=("Sichert die Gewinne, statt ein Ermüdungsloch zu graben." if de
                        else "Locks in the gains instead of digging a fatigue hole."),
            ))

    # Sleep debt.
    if cur.sleep_debt_hours is not None and cur.sleep_debt_hours >= 4.0:
        out.append(Prescription(
            priority=0,
            headline="Schlafdefizit abbauen" if de else "Pay down sleep debt",
            icon_key="sleep", tone="caution",
            detail=(f"Du schleppst {cur.sleep_debt_hours:.0f} h Schlafdefizit mit dir herum. "
                    "Schütze in den nächsten Nächten 7,5 h+." if de
                    else f"You're carrying {cur.sleep_debt_hours:.0f}h of sleep debt. Protect "
                    "7.5h+ for the next few nights."),
            effect=("Im Schlaf erholen sich HRV und Anpassung — die günstigsten Gewinne "
                    "überhaupt." if de
                    else "Sleep is where HRV and adaptation rebound — the cheapest gains you'll get."),
        ))

    # Closers — always have at least one forward action.
    if not out or (not recovering and len(out) < 2):
        if grade_score is not None and grade_score >= 80:
            out.append(Prescription(
                priority=0,
                headline="Weiter so, was funktioniert" if de else "Keep doing what works",
                icon_key="arrow", tone="good",
                detail=("Ausgewogener, produktiver Zeitraum. Wiederhole die Struktur und hebe "
                        "die Qualität einer Einheit leicht an." if de
                        else "Balanced, productive window. Repeat the structure and nudge one session's quality up."),
                effect=("Stetige, wiederholbare Progression — schütze deinen Schlaf und deine "
                        "lockeren Tage." if de
                        else "Steady, repeatable progression — protect your sleep and easy days."),
            ))
        else:
            out.append(Prescription(
                priority=0,
                headline="Stabil bleiben und schärfen" if de else "Hold steady and sharpen",
                icon_key="arrow", tone="neutral",
                detail=("Solide Basis. Füge etwas mehr polarisierte Intensität hinzu — harte "
                        "Tage hart, lockere Tage locker — und halte das Grauzonen-Tempo im "
                        "Griff." if de
                        else "Solid base. Add a touch more polarized intensity — hard days hard, "
                        "easy days easy — and keep grey-zone tempo in check."),
                effect=("Bringt Fortschritt, ohne Ermüdung aufzubauen." if de
                        else "Moves the needle without adding fatigue."),
            ))

    # Dedupe by headline, cap at 4, assign 1-based priority.
    seen: set[str] = set()
    ranked: list = []
    for p in out:
        if p.headline in seen:
            continue
        seen.add(p.headline)
        ranked.append(p)
        if len(ranked) == 4:
            break
    for i, p in enumerate(ranked):
        p.priority = i + 1
    return ranked


def _next_step_from(prescriptions: list) -> object:
    """Mirror the top prescription into a NextStep for back-compat consumers."""
    from app.schemas.period_report import NextStep
    top = prescriptions[0]
    return NextStep(headline=top.headline, detail=top.detail, tone=top.tone)


def build_next_step(grade_score: float | None, cur: WindowMetrics, causes: list, lang: str = "en") -> object:
    """Back-compat single recommendation — the top of the ranked prescriptions."""
    return _next_step_from(build_prescriptions(grade_score, cur, causes, lang=lang))


async def _historical_composites(
    db: AsyncSession, user_id: int, days: int, ftp: int | None,
    n_samples: int = 8, step_days: int = 7,
) -> list[float]:
    """Composite grade for `n_samples` trailing windows stepped back weekly,
    oldest→newest. Powers the percentile rank and the hero sparkline. Windows
    are fetched concurrently to bound latency."""
    today = date.today()
    starts_ends = []
    for i in range(n_samples - 1, -1, -1):  # oldest first
        end = today - timedelta(days=i * step_days)
        start = end - timedelta(days=days - 1)
        starts_ends.append((start, end))

    metrics = await asyncio.gather(
        *[_fetch_window_metrics(db, user_id, s, e, ftp) for s, e in starts_ends]
    )
    scores: list[float] = []
    for wm in metrics:
        score, _ = composite_grade(build_radar(wm, None))
        if score is not None:
            scores.append(round(score, 1))
    return scores


_VERDICT_SYSTEM = (
    "You are an elite endurance coach writing an athlete's training-window review. "
    "Write 3-4 sentences, plain and direct, second person. Open with the headline "
    "verdict, cite 2-3 REAL numbers from the data, name the single biggest win and "
    "the single biggest risk, and end with the one thing to do next. "
    "STRICT: use ONLY the numbers given in the data block — never invent, round "
    "differently, or infer figures that aren't provided. Do NOT claim how many days "
    "ago a session happened or imply sessions were consecutive unless the data says "
    "so. No platitudes, no emoji, no hedging, no bullet lists. Under 600 characters."
)

_VERDICT_SYSTEM_DE = (
    "Du bist ein Elite-Ausdauer-Coach und schreibst den Trainingszeitraum-Review "
    "eines Athleten. Schreibe 3-4 Sätze, schlicht und direkt, in der Du-Form. "
    "Beginne mit dem Kernurteil, nenne 2-3 ECHTE Zahlen aus den Daten, benenne den "
    "einzigen größten Gewinn und das einzige größte Risiko und schließe mit der einen "
    "Sache, die als Nächstes zu tun ist. STRIKT: Verwende NUR die im Datenblock "
    "gegebenen Zahlen — erfinde nichts, runde nicht anders und leite keine Werte ab, "
    "die nicht vorliegen. Behaupte nicht, vor wie vielen Tagen eine Einheit war, und "
    "unterstelle keine aufeinanderfolgenden Einheiten, außer die Daten sagen es. "
    "Keine Floskeln, keine Emojis, kein Herumdrucksen, keine Aufzählungen. Antworte "
    "auf Deutsch. Unter 600 Zeichen."
)


async def _ai_verdict(
    days: int,
    grade_letter: str | None,
    grade_score: float | None,
    improvements: list,
    weaknesses: list,
    evidence: list | None = None,
    next_step: object | None = None,
    lang: str = "en",
) -> tuple[str, str]:
    """Return (verdict_text, model_used). Falls back to a rule-based string when
    no API key is set or the call fails — mirrors /analytics/summarize."""
    de = lang == "de"
    top_imp = improvements[0].label if improvements else None
    top_weak = weaknesses[0].label if weaknesses else None
    fallback = _rule_based_verdict(days, grade_letter, grade_score, top_imp, top_weak, lang)
    if next_step is not None:
        nxt = (f" Als Nächstes: {next_step.headline.lower()}." if de
               else f" Next: {next_step.headline.lower()}.")
        fallback = (fallback + nxt)[:600]

    if not settings.ANTHROPIC_API_KEY:
        return fallback, "rule-based-fallback"

    ev = ", ".join(f"{c.label} {c.value}" for c in (evidence or [])) or "n/a"
    step = f"{next_step.headline} — {next_step.detail}" if next_step is not None else "n/a"
    user_msg = (
        f"Window: last {days} days\n"
        f"Grade: {grade_letter} ({grade_score}/100)\n"
        f"Evidence: {ev}\n"
        f"Improvements: {[i.detail for i in improvements[:4]]}\n"
        f"Weaknesses: {[w.detail for w in weaknesses[:4]]}\n"
        f"Recommended next step: {step}\n"
    )
    try:
        # Claude (primary) → OpenAI (fallback) → the rule-based return below.
        from app.services.llm_client import complete_text

        result = await complete_text(
            system=_VERDICT_SYSTEM_DE if de else _VERDICT_SYSTEM,
            user=user_msg,
            max_tokens=320,
            model=settings.COACH_MODEL,
            # temperature=0 → stable wording across reloads for the same data, so
            # the verdict stops "changing between page loads" and is less prone to
            # fabricating numbers. (Sonnet accepts it; OpenAI ignores it.)
            temperature=0,
        )
        return result.text[:600], result.model
    except Exception as exc:  # noqa: BLE001
        logger.exception("Period-report verdict failed: %s", exc)
        return fallback, "rule-based-fallback"


# Refresh-on-demand: a report regenerates only on a Garmin sync that lands new
# activities (which deletes today's cached windows) or an explicit refresh — not
# from elapsed time. Effectively-infinite TTL so time alone never rebuilds it.
PERIOD_REPORT_TTL_HOURS = 24 * 365
PRESET_WINDOWS = (7, 14, 30)


async def _upsert_report(db: AsyncSession, user_id: int, days: int, report) -> None:
    """Insert or replace the cached row for (user, days) atomically, stamping
    generated_at. ON CONFLICT avoids a select-then-insert race when two callers
    miss the same window concurrently."""
    now = datetime.now(timezone.utc)
    payload = report.model_dump(mode="json")
    stmt = pg_insert(PeriodReportCache).values(
        user_id=user_id, days=days, report=payload, generated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "days"],
        set_={"report": payload, "generated_at": now},
    )
    await db.execute(stmt)
    await db.commit()
    report.generated_at = now


async def get_or_build_report(db: AsyncSession, user_id: int, days: int, lang: str = "en"):
    """Read-through cache around build_report. Returns a fresh cached PeriodReport
    when one exists within the TTL AND matches the requested locale, else builds,
    upserts, and returns it. The report carries its language so a locale switch
    rebuilds instead of serving stale English (or vice-versa)."""
    from app.schemas.period_report import PeriodReport

    cutoff = datetime.now(timezone.utc) - timedelta(hours=PERIOD_REPORT_TTL_HOURS)
    result = await db.execute(
        select(PeriodReportCache).where(
            PeriodReportCache.user_id == user_id,
            PeriodReportCache.days == days,
            PeriodReportCache.generated_at >= cutoff,
        )
    )
    row = result.scalar_one_or_none()
    if row is not None and (row.report or {}).get("lang", "en") == lang:
        try:
            return PeriodReport.model_validate({**row.report, "generated_at": row.generated_at})
        except ValidationError:
            logger.warning("Discarding malformed cached report user=%s days=%s", user_id, days)
    report = await build_report(db, user_id, days, lang)
    await _upsert_report(db, user_id, days, report)
    return report


async def precompute_preset_reports(db: AsyncSession, user_id: int, lang: str = "en") -> None:
    """Build + cache the preset windows. One window failing logs and continues."""
    for days in PRESET_WINDOWS:
        try:
            report = await build_report(db, user_id, days, lang)
            await _upsert_report(db, user_id, days, report)
        except Exception as exc:  # noqa: BLE001 — best-effort cache warming
            logger.warning("precompute_preset_reports failed user=%s days=%s: %s", user_id, days, exc)


async def build_report(db: AsyncSession, user_id: int, days: int, lang: str = "en"):
    """Assemble the full PeriodReport for the last `days` days vs the previous
    equal window, enriched with evidence, causes, a forward next-step, a
    historical composite trend, and a richer coach verdict."""
    from app.schemas.period_report import PeriodReport

    lang = "de" if str(lang).lower().startswith("de") else "en"
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

    radar = build_radar(cur, prev_for_calc, lang)
    grade_score, grade_letter = composite_grade(radar)

    # Grade delta vs previous equal window
    grade_delta = None
    if has_baseline and grade_score is not None:
        prev_score, _ = composite_grade(build_radar(prev, None))
        if prev_score is not None:
            grade_delta = round(grade_score - prev_score, 1)

    # Historical composite series → percentile + sparkline
    trend = await _historical_composites(db, user_id, days, ftp)
    grade_percentile = (
        _percentile(grade_score, trend) if grade_score is not None and trend else None
    )

    improvements, weaknesses = build_deltas(cur, prev_for_calc, lang)
    milestones = build_milestones(cur, lang)
    evidence = build_evidence(cur, prev_for_calc, lang)

    # Causes (why am I dragging) — reuse the today-anchored synthesizer.
    causes: list = []
    try:
        from app.schemas.period_report import Cause
        wt = await why_am_i_tired(db, user_id, lang=lang)
        for c in (wt.get("causes") or [])[:4]:
            causes.append(Cause(label=c["label"], severity=c["severity"], evidence=c["evidence"]))
    except Exception:  # noqa: BLE001
        logger.exception("why_am_i_tired failed in period report")

    # --- Richer insight blocks (each isolated so one failure can't sink the
    # report). Phase drives both the intensity target and the trajectory. ---
    intensity = load_dynamics = trajectory = None
    prescriptions: list = []
    try:
        from app.models.athlete_profile import AthleteProfile
        from app.services.training_periodization import (
            default_target_ctl,
            detect_training_phase,
        )

        profile = (
            await db.execute(
                select(AthleteProfile).where(AthleteProfile.user_id == user_id)
            )
        ).scalar_one_or_none()

        goal_date_obj: date | None = None
        target_ctl: float | None = None
        if profile is not None:
            goals_dict = profile.goals if isinstance(profile.goals, dict) else {}
            # First-class column BEATS the JSONB copy (2a3ecb1) — the JSONB
            # date can be stale (live-observed 2026-07-05 vs real 2026-12-05).
            if profile.target_event_date:
                goal_date_obj = profile.target_event_date
            else:
                te = goals_dict.get("target_event")
                if isinstance(te, dict) and te.get("date"):
                    try:
                        goal_date_obj = date.fromisoformat(te["date"])
                    except (ValueError, TypeError):
                        goal_date_obj = None
            raw_target = goals_dict.get("target_ctl")
            if isinstance(raw_target, (int, float)):
                target_ctl = float(raw_target)
            elif profile.target_event_type is not None:
                target_ctl = default_target_ctl(
                    profile.target_event_type, profile.target_priority
                )

        phase = detect_training_phase(
            goal_date_obj, float(cur.avg_ctl or 0.0), target_ctl=target_ctl
        )
    except Exception:  # noqa: BLE001
        logger.exception("period report: phase detection failed")
        phase = None

    try:
        intensity = build_intensity(cur, phase, lang)
    except Exception:  # noqa: BLE001
        logger.exception("period report: build_intensity failed")
    try:
        load_dynamics = build_load_dynamics(cur, lang)
    except Exception:  # noqa: BLE001
        logger.exception("period report: build_load_dynamics failed")
    trajectory = await build_trajectory(db, user_id, phase, lang)

    prescriptions = build_prescriptions(
        grade_score, cur, causes, intensity, load_dynamics, trajectory, lang=lang
    )
    next_step = _next_step_from(prescriptions)

    verdict, model = await _ai_verdict(
        days, grade_letter, grade_score, improvements, weaknesses,
        evidence=evidence, next_step=next_step, lang=lang,
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
        grade_delta=grade_delta,
        grade_percentile=grade_percentile,
        composite_trend=trend,
        radar=radar,
        improvements=improvements,
        weaknesses=weaknesses,
        milestones=milestones,
        evidence=evidence,
        causes=causes,
        next_step=next_step,
        prescriptions=prescriptions,
        intensity=intensity,
        load_dynamics=load_dynamics,
        trajectory=trajectory,
        ai_verdict=verdict,
        ai_model=model,
        lang=lang,
    )

