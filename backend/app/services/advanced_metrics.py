"""Tier-1 advanced endurance metrics that no consumer training app surfaces well.

These are the metrics the research called out as commercially absent (see
.planning/research/athlete-pain-points.md §3 and .planning/research/training-frameworks.md §2):

    - Aerobic decoupling (Pw:HR drift)        — Friel "most important aerobic metric"
    - Efficiency Factor (NP / avg HR)         — Friel aerobic-adaptation signal
    - Durability index (fatigued vs fresh NP) — 2025 PMC study differentiator
    - HRV / rHR / sleep trend analysis        — Altini's raw-data critique
    - Zone distribution + grey-zone creep     — Seiler polarized framework
    - "Why am I tired?" synthesizer           — cross-references all of the above

All the pure functions at the top of this module have NO DB access — they operate on
primitives/lists. The db-backed helpers at the bottom take an AsyncSession (already
RLS-scoped by get_db_for_user) and a user_id, and return plain dicts.

The frontend has its own src/lib/advanced-metrics.ts for chart-side computation on the
dashboard; backend and frontend are intentionally independent to avoid a shared-code
dependency across the wire.
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.daily_metric import DailyMetric
from app.services.pmc_service import compute_user_pmc
from app.services.training_load import calculate_np

# Sleep target (hours) used for sleep-debt calculation.
# 8h is the generally-accepted recommendation for endurance athletes training >10h/week
# (see Walker "Why We Sleep"; endurance-specific: Samuels 2008).
# AASM / Sleep Foundation: healthy adult range is 7–9h. The previous 8h
# target produced false-positive "short on sleep" flags for athletes
# averaging 7.5h who feel fine. 7.5h matches the modal "good night" in
# adult sleep literature and is the floor the endurance research
# (Halson 2008, Watson 2017) ties to performance preservation.
SLEEP_TARGET_HOURS = 7.5

# Seiler grey-zone creep threshold: >20% in the 3-zone middle (LT1–LT2) is the flag
# for "junk miles" (Seiler & Tonnessen 2009; reinforced in 2024 meta-analysis).
GREY_ZONE_FLAG_PCT = 20.0

# TSB form thresholds (TrainingPeaks convention)
TSB_FRESH_THRESHOLD = 25.0        # above = fresh/detrained territory
TSB_OPTIMAL_MIN = -10.0           # -10..+5 is the "optimal form" band
TSB_OPTIMAL_MAX = 5.0
TSB_RISK_THRESHOLD = -30.0        # below = overreach / high-injury-risk territory


# ======================================================================
#  Pure functions — no DB, no async, deterministic
# ======================================================================

def aerobic_decoupling(
    first_half_np: float,
    first_half_hr: float,
    second_half_np: float,
    second_half_hr: float,
) -> float | None:
    """Percentage Pw:HR decoupling between the first and second half of a ride.

    Uses the TrainingPeaks/Friel formula:
        decoupling = (second_half_pw_hr / first_half_pw_hr - 1) * 100
    where pw_hr = power / heart_rate (W/bpm).

    Interpretation:
        < 5%  — excellent aerobic base (Friel benchmark)
        5–10% — adequate; base could be extended
        > 10% — significant cardiac drift; base deficit

    Returns None when any input is zero or missing — this is not a failure
    but a "can't compute; caller should drop the sample" signal.
    """
    if first_half_hr <= 0 or second_half_hr <= 0:
        return None
    if first_half_np <= 0 or second_half_np <= 0:
        return None
    first_pw_hr = first_half_np / first_half_hr
    second_pw_hr = second_half_np / second_half_hr
    if first_pw_hr == 0:
        return None
    return round((second_pw_hr / first_pw_hr - 1.0) * 100.0, 2)


def efficiency_factor(normalized_power: float | None, avg_hr: float | None) -> float | None:
    """Efficiency Factor = NP / avgHR (W/bpm).

    Rising EF over 4–6 weeks at the same training stimulus is the classic
    aerobic-adaptation signal (Friel). Returns None when inputs are missing
    or HR is zero.
    """
    if normalized_power is None or avg_hr is None:
        return None
    if avg_hr <= 0:
        return None
    return round(normalized_power / avg_hr, 3)


def durability_index(fresh_np: float | None, fatigued_np: float | None) -> float | None:
    """Ratio of late-ride power to fresh power (0..1).

    Per 2025 PMC durability study (PMC12116599): successful amateurs hold ~0.935
    (only 6.5% drop after 1000 kJ) vs <0.875 for less-successful athletes.

    Returns None when inputs are missing or fresh_np is zero.
    """
    if fresh_np is None or fatigued_np is None:
        return None
    if fresh_np <= 0:
        return None
    return round(fatigued_np / fresh_np, 3)


def compute_activity_metrics(activity: Activity) -> dict[str, float | None]:
    """Derive decoupling / EF / durability from a single activity.

    Expects the activity to have `raw_data` containing optional `power_samples`
    and `hr_samples` arrays (second-by-second). When only summary fields are
    available (normalized_power / average_hr on the ORM), we can still compute
    EF but not decoupling/durability — those require the sample streams.

    Returns a dict with keys:
        decoupling: float | None   — percent drift
        ef:         float | None   — W/bpm
        durability: float | None   — ratio 0..1
    """
    out: dict[str, float | None] = {"decoupling": None, "ef": None, "durability": None}

    # EF from summary fields is always available when both NP and avg HR are recorded
    out["ef"] = efficiency_factor(activity.normalized_power, activity.average_hr)

    raw = activity.raw_data if isinstance(activity.raw_data, dict) else None
    if not raw:
        return out

    power_samples = raw.get("power_samples")
    hr_samples = raw.get("hr_samples")
    if not isinstance(power_samples, list) or not isinstance(hr_samples, list):
        return out

    n = min(len(power_samples), len(hr_samples))
    if n < 60:
        # Too short for split-half analysis — decoupling is meaningless.
        return out

    half = n // 2
    p_first = [p for p in power_samples[:half] if isinstance(p, (int, float))]
    p_second = [p for p in power_samples[half:n] if isinstance(p, (int, float))]
    h_first = [h for h in hr_samples[:half] if isinstance(h, (int, float)) and h > 0]
    h_second = [h for h in hr_samples[half:n] if isinstance(h, (int, float)) and h > 0]

    if p_first and p_second and h_first and h_second:
        np_first = calculate_np(p_first)
        np_second = calculate_np(p_second)
        hr_first = sum(h_first) / len(h_first)
        hr_second = sum(h_second) / len(h_second)
        out["decoupling"] = aerobic_decoupling(np_first, hr_first, np_second, hr_second)

        # Durability requires the ride be "long enough to fatigue" — approximated as
        # >=90min and a >=1000 kJ kJ threshold. We use the split-half NP's if the
        # activity meets the long-ride criterion.
        duration_s = activity.duration_seconds or 0
        avg_p = activity.average_power or (sum(p_first + p_second) / (len(p_first) + len(p_second)))
        est_kj = avg_p * duration_s / 1000.0
        if duration_s >= 90 * 60 and est_kj >= 1000:
            out["durability"] = durability_index(np_first, np_second)

    return out


# ======================================================================
#  DB-backed helpers — async, accept RLS-scoped session
# ======================================================================


def _trend_direction(current: float, baseline: float) -> str:
    """Label a trend relative to its 28d baseline. 3pp hysteresis avoids flapping."""
    if current is None or baseline is None:
        return "unknown"
    if current > baseline * 1.03:
        return "up"
    if current < baseline * 0.97:
        return "down"
    return "stable"


async def _fetch_daily_metrics(
    db: AsyncSession, user_id: int, days: int
) -> list[DailyMetric]:
    """Pull last N days of daily_metrics (RLS already scopes to user)."""
    since = datetime.now().astimezone() - timedelta(days=days)
    stmt = (
        select(DailyMetric)
        .where(
            DailyMetric.user_id == user_id,
            DailyMetric.recorded_at >= since,
        )
        .order_by(DailyMetric.recorded_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def hrv_trend(db: AsyncSession, user_id: int, days: int = 7) -> dict:
    """7-day mean HRV vs 28-day baseline with direction + delta %.

    Research grounding (Altini, HRV4Training):
        - Acute suppression > 10% vs baseline = reduce intensity
        - Chronic suppression (3+ days) = likely overreaching

    Returns:
        {
            "current_mean":      float | None,   # mean of last `days` readings
            "baseline_28d_mean": float | None,   # mean of last 28 days
            "delta_pct":         float | None,   # (current - baseline) / baseline * 100
            "samples_n":         int,            # how many readings in `days`
            "latest_age_days":   int | None,     # whole days since the newest reading
            "direction":         'up'|'down'|'stable'|'unknown',
        }

    `latest_age_days` exists so downstream copy can tell "measured this
    morning" from "measured five days ago". The 7-day `samples_n` window
    already stops readings older than a week from being described in the
    present tense, but says nothing about days 1–6: an athlete whose watch
    last synced on Tuesday still got "Deine Erholungswerte liegen in deinem
    normalen Bereich" on Friday, present tense, off Tuesday's numbers.
    """
    # 28-day pull covers both the current window and the baseline.
    metrics_28 = await _fetch_daily_metrics(db, user_id, max(28, days))
    hrv_values = [m.hrv_status for m in metrics_28 if m.hrv_status is not None]

    current_cutoff = datetime.now().astimezone() - timedelta(days=days)
    current_values = [
        m.hrv_status for m in metrics_28
        if m.hrv_status is not None and m.recorded_at >= current_cutoff
    ]

    current_mean = statistics.mean(current_values) if current_values else None
    baseline_mean = statistics.mean(hrv_values) if hrv_values else None

    delta_pct: float | None = None
    if current_mean is not None and baseline_mean is not None and baseline_mean != 0:
        delta_pct = round((current_mean - baseline_mean) / baseline_mean * 100.0, 2)

    return {
        "current_mean": round(current_mean, 2) if current_mean is not None else None,
        "baseline_28d_mean": round(baseline_mean, 2) if baseline_mean is not None else None,
        "delta_pct": delta_pct,
        "samples_n": len(current_values),
        "latest_age_days": _latest_hrv_age_days(metrics_28),
        "direction": _trend_direction(current_mean, baseline_mean),
    }


def _latest_hrv_age_days(metrics: list) -> int | None:
    """Whole athlete-local days since the newest row that carries an HRV
    reading. 0 = measured today, 1 = yesterday, None = no reading at all.

    Deliberately measured off the calendar `date` column rather than the
    `recorded_at` timestamp: a sync that lands at 04:00 and one that lands at
    23:00 describe the same night, and an hours-based age would flip the
    "is this today's reading" answer purely on sync timing.
    """
    from app.services.athlete_time import today_local

    days = [
        (getattr(m, "date", None)
         or (m.recorded_at.date() if getattr(m, "recorded_at", None) is not None else None))
        for m in metrics
        if m.hrv_status is not None
    ]
    days = [d for d in days if d is not None]
    if not days:
        return None
    return max(0, (today_local() - max(days)).days)


async def rhr_trend(db: AsyncSession, user_id: int, days: int = 7) -> dict:
    """Same shape as hrv_trend but for resting HR. Lower rHR = better recovery."""
    metrics_28 = await _fetch_daily_metrics(db, user_id, max(28, days))
    rhr_values = [m.resting_hr for m in metrics_28 if m.resting_hr is not None]

    current_cutoff = datetime.now().astimezone() - timedelta(days=days)
    current_values = [
        m.resting_hr for m in metrics_28
        if m.resting_hr is not None and m.recorded_at >= current_cutoff
    ]

    current_mean = statistics.mean(current_values) if current_values else None
    baseline_mean = statistics.mean(rhr_values) if rhr_values else None

    delta_pct: float | None = None
    if current_mean is not None and baseline_mean is not None and baseline_mean != 0:
        delta_pct = round((current_mean - baseline_mean) / baseline_mean * 100.0, 2)

    # For rHR the *semantics* of direction flip: lower = better. We still report
    # up/down relative to baseline; the coach layer interprets direction contextually.
    return {
        "current_mean": round(current_mean, 2) if current_mean is not None else None,
        "baseline_28d_mean": round(baseline_mean, 2) if baseline_mean is not None else None,
        "delta_pct": delta_pct,
        "samples_n": len(current_values),
        "direction": _trend_direction(current_mean, baseline_mean),
    }


async def sleep_debt(db: AsyncSession, user_id: int, days: int = 14) -> dict:
    """Cumulative sleep shortfall vs 8h target over the last N nights.

    daily_metrics.sleep_score is Garmin's 0-100 composite — we proxy actual sleep
    HOURS by reading raw_data.sleep.dailySleepDTO.sleepTimeSeconds when available,
    falling back to body_battery-derived estimates when not. For robustness we
    accept the raw_data.sleep.hours shape if any upstream mapper provides it.

    Returns:
        {
            "total_debt_hours":   float,
            "avg_nightly_debt":   float,
            "nights_short":       int,     # nights under target
            "nights_healthy":     int,     # nights at or above target
            "samples_n":          int,
            "target_hours":       float,
        }
    """
    metrics = await _fetch_daily_metrics(db, user_id, days)

    def _extract_hours(m: DailyMetric) -> float | None:
        raw = m.raw_data if isinstance(m.raw_data, dict) else {}
        sleep = raw.get("sleep") if isinstance(raw.get("sleep"), dict) else {}

        # Shape A: our internal mapper may have set {"hours": 7.5}
        if isinstance(sleep.get("hours"), (int, float)):
            return float(sleep["hours"])

        # Shape B: Garmin's dailySleepDTO.sleepTimeSeconds
        dto = sleep.get("dailySleepDTO") if isinstance(sleep.get("dailySleepDTO"), dict) else {}
        secs = dto.get("sleepTimeSeconds") if isinstance(dto, dict) else None
        if isinstance(secs, (int, float)) and secs > 0:
            return float(secs) / 3600.0

        # Shape C: sleep_score with no duration — too noisy to proxy, skip.
        return None

    nightly = [h for h in (_extract_hours(m) for m in metrics) if h is not None]

    if not nightly:
        return {
            "total_debt_hours": 0.0,
            "avg_nightly_debt": 0.0,
            "nights_short": 0,
            "nights_healthy": 0,
            "samples_n": 0,
            "target_hours": SLEEP_TARGET_HOURS,
        }

    debts = [max(0.0, SLEEP_TARGET_HOURS - h) for h in nightly]
    total_debt = sum(debts)
    nights_short = sum(1 for h in nightly if h < SLEEP_TARGET_HOURS)
    nights_healthy = sum(1 for h in nightly if h >= SLEEP_TARGET_HOURS)

    return {
        "total_debt_hours": round(total_debt, 2),
        "avg_nightly_debt": round(total_debt / len(nightly), 2),
        "nights_short": nights_short,
        "nights_healthy": nights_healthy,
        "samples_n": len(nightly),
        "target_hours": SLEEP_TARGET_HOURS,
    }


async def zone_distribution(
    db: AsyncSession, user_id: int, days: int = 28
) -> dict:
    """Seiler 3-zone % time distribution across last N days of CYCLING activities.

    Classification is power-based when NP is available (mapped to % of FTP via
    the athlete's profile) OR approximated by a coarse IF proxy when only
    summary fields exist. We use the following IF → 3-zone mapping:

        IF < 0.77  → Z1 (easy, below LT1)
        0.77-1.00  → Z2 (moderate, LT1–LT2)
        > 1.00     → Z3 (hard, above LT2)

    Because activity-level IF is a duration-weighted proxy (not per-second),
    we treat each activity's whole duration as falling in one zone bucket —
    this is less precise than streaming zone analysis but honest: it's the
    same heuristic every other app uses at the "training overview" level and
    the research (Seiler 2009) shows session-level classification correlates
    strongly with detailed second-by-second TID at > 90% agreement.

    Returns:
        {
            "z1_pct": float, "z2_pct": float, "z3_pct": float,
            "total_hours": float,
            "grey_zone_flag": bool,   # z2 > 20%
            "samples_n": int,          # activities counted
        }
    """
    since = datetime.now().astimezone() - timedelta(days=days)
    stmt = (
        select(Activity)
        .where(
            Activity.user_id == user_id,
            Activity.sport == "cycling",
            Activity.started_at >= since,
        )
    )
    result = await db.execute(stmt)
    activities = list(result.scalars().all())

    # Pull FTP from the athlete profile (needed for IF when NP is present).
    ftp: int | None = None
    try:
        ftp_row = await db.execute(
            text("SELECT ftp_watts FROM athlete_profiles WHERE user_id = :uid"),
            {"uid": user_id},
        )
        ftp_val = ftp_row.scalar_one_or_none()
        ftp = int(ftp_val) if ftp_val else None
    except Exception:
        ftp = None

    z_seconds: dict[str, float] = {"z1": 0.0, "z2": 0.0, "z3": 0.0}
    counted = 0

    for a in activities:
        duration = a.duration_seconds or 0
        if duration <= 0:
            continue

        intensity_factor: float | None = None
        if a.normalized_power and ftp and ftp > 0:
            intensity_factor = a.normalized_power / ftp
        elif a.average_power and ftp and ftp > 0:
            intensity_factor = a.average_power / ftp
        else:
            # No power-to-FTP ratio — skip this activity rather than misclassify.
            continue

        if intensity_factor < 0.77:
            z_seconds["z1"] += duration
        elif intensity_factor <= 1.00:
            z_seconds["z2"] += duration
        else:
            z_seconds["z3"] += duration
        counted += 1

    total_s = sum(z_seconds.values())
    if total_s <= 0:
        return {
            "z1_pct": 0.0, "z2_pct": 0.0, "z3_pct": 0.0,
            "total_hours": 0.0,
            "grey_zone_flag": False,
            "samples_n": 0,
        }

    z1_pct = round(z_seconds["z1"] / total_s * 100.0, 1)
    z2_pct = round(z_seconds["z2"] / total_s * 100.0, 1)
    z3_pct = round(z_seconds["z3"] / total_s * 100.0, 1)

    return {
        "z1_pct": z1_pct,
        "z2_pct": z2_pct,
        "z3_pct": z3_pct,
        "total_hours": round(total_s / 3600.0, 2),
        "grey_zone_flag": z2_pct > GREY_ZONE_FLAG_PCT,
        "samples_n": counted,
    }


async def ctl_atl_tsb_snapshot(db: AsyncSession, user_id: int) -> dict:
    """Current CTL/ATL/TSB + 7-day deltas + categorical form status.

    form_status thresholds (TrainingPeaks convention, validated in Phase 1):
        TSB > +25   → 'fresh'   (possibly detrained if sustained)
        -10..+5     → 'optimal'
        < -10       → 'grey'    (productive fatigue zone)
        < -30       → 'risk'    (overreach / injury-risk territory)

    Rebased on the window-invariant PMC (usability audit P0-5): the EWMA always
    runs from the athlete's first activity, so this snapshot and /training-load
    /pmc can never disagree on today's CTL/ATL/TSB regardless of window length.
    """
    pmc = await compute_user_pmc(db, user_id, days=60)
    total = pmc.get("total") or []
    if not total:
        return {
            "ctl": 0.0, "atl": 0.0, "tsb": 0.0,
            "ctl_7d_delta": 0.0, "tsb_7d_delta": 0.0,
            "form_status": "unknown",
        }

    today = total[-1]
    week_ago = total[-8] if len(total) >= 8 else total[0]

    ctl = float(today["ctl"])
    atl = float(today["atl"])
    tsb = float(today["tsb"])
    ctl_7d_delta = round(ctl - float(week_ago["ctl"]), 1)
    tsb_7d_delta = round(tsb - float(week_ago["tsb"]), 1)

    if tsb < TSB_RISK_THRESHOLD:
        form_status = "risk"
    elif tsb > TSB_FRESH_THRESHOLD:
        form_status = "fresh"
    elif TSB_OPTIMAL_MIN <= tsb <= TSB_OPTIMAL_MAX:
        form_status = "optimal"
    else:
        form_status = "grey"

    return {
        "ctl": ctl,
        "atl": atl,
        "tsb": tsb,
        "ctl_7d_delta": ctl_7d_delta,
        "tsb_7d_delta": tsb_7d_delta,
        "form_status": form_status,
    }


async def why_am_i_tired(db: AsyncSession, user_id: int, lang: str = "en") -> dict:
    """Cross-reference causal synthesizer: WHY does the athlete feel tired today?

    Closes pain-point #1 from .planning/research/athlete-pain-points.md (Section 4):
    no mainstream app produces a causal chain like "HRV down 12%, sleep debt 4h,
    TSB -28 → reduce intensity today".

    Returns ordered list of suspected causes, highest severity first:
        {"causes": [{"label": str, "severity": 'low'|'med'|'high', "evidence": str}, ...]}

    ``lang`` localizes the label/evidence text ("de" → German). Defaults to
    English so existing callers (Today/coach paths) are unaffected — only the
    period report opts into localization.
    """
    de = str(lang).lower().startswith("de")
    hrv = await hrv_trend(db, user_id, days=7)
    rhr = await rhr_trend(db, user_id, days=7)
    sleep = await sleep_debt(db, user_id, days=14)
    pmc = await ctl_atl_tsb_snapshot(db, user_id)
    zones = await zone_distribution(db, user_id, days=28)

    causes: list[dict[str, Any]] = []

    # HRV suppression — acute > 10% (Altini/HRV4Training threshold)
    if hrv["delta_pct"] is not None and hrv["delta_pct"] <= -10:
        severity = "high" if hrv["delta_pct"] <= -15 else "med"
        causes.append({
            "label": "HRV unterdrückt" if de else "HRV suppressed",
            "severity": severity,
            "evidence": (
                (
                    f"HRV liegt {abs(hrv['delta_pct'])}% unter deiner 28-Tage-Basislinie "
                    f"({hrv['current_mean']} vs. {hrv['baseline_28d_mean']} ms)."
                ) if de else (
                    f"HRV is {abs(hrv['delta_pct'])}% below your 28-day baseline "
                    f"({hrv['current_mean']} vs {hrv['baseline_28d_mean']} ms)."
                )
            ),
        })

    # Elevated rHR (rHR *up* = worse; 5% elevation is meaningful)
    if rhr["delta_pct"] is not None and rhr["delta_pct"] >= 5:
        severity = "high" if rhr["delta_pct"] >= 10 else "med"
        causes.append({
            "label": "Ruhepuls erhöht" if de else "Resting HR elevated",
            "severity": severity,
            "evidence": (
                (
                    f"Ruhepuls liegt {rhr['delta_pct']}% über der Basislinie "
                    f"({rhr['current_mean']} vs. {rhr['baseline_28d_mean']} bpm)."
                ) if de else (
                    f"Resting HR is {rhr['delta_pct']}% above baseline "
                    f"({rhr['current_mean']} vs {rhr['baseline_28d_mean']} bpm)."
                )
            ),
        })

    # Sleep debt — flag only when the shortfall is BIG and SUSTAINED, not a
    # few minutes per night. Two gates:
    #   1. avg_nightly_debt >= 0.75h (~45min/night below 7.5h, i.e. averaging
    #      <6.75h — genuinely under-slept by sport-science standards)
    #   2. nights_short >= max(3, 0.5 * samples_n) — at least half the logged
    #      nights, and never on a single bad night.
    # Together these stop "you slept 7.5h, you're short" false positives that
    # earlier hard-target logic produced.
    avg_debt = float(sleep.get("avg_nightly_debt") or 0.0)
    nights_short = int(sleep.get("nights_short") or 0)
    samples_n = int(sleep.get("samples_n") or 0)
    sustained = nights_short >= max(3, samples_n // 2)
    if avg_debt >= 0.75 and sustained:
        severity = "high" if avg_debt >= 1.5 else "med"
        causes.append({
            "label": "Schlafdefizit aufgebaut" if de else "Sleep debt accumulated",
            "severity": severity,
            "evidence": (
                (
                    f"Im Schnitt {sleep.get('target_hours', SLEEP_TARGET_HOURS) - avg_debt:.1f}h "
                    f"über {samples_n} erfasste Nächte ({nights_short} unter dem Ziel). "
                    f"Ziel {sleep.get('target_hours', SLEEP_TARGET_HOURS)}h."
                ) if de else (
                    f"Averaging {sleep.get('target_hours', SLEEP_TARGET_HOURS) - avg_debt:.1f}h "
                    f"across {samples_n} logged nights ({nights_short} under target). "
                    f"Target {sleep.get('target_hours', SLEEP_TARGET_HOURS)}h."
                )
            ),
        })

    # Overreach (TSB deep-negative) — this is the strongest overtraining predictor
    if pmc["tsb"] <= TSB_RISK_THRESHOLD:
        causes.append({
            "label": "Überlastung (TSB stark negativ)" if de else "Overreach (TSB deep-negative)",
            "severity": "high",
            "evidence": (
                (
                    f"TSB liegt bei {pmc['tsb']} (unter -30 = Überlastungsbereich). "
                    f"CTL {pmc['ctl']:.1f}, ATL {pmc['atl']:.1f}."
                ) if de else (
                    f"TSB is {pmc['tsb']} (below -30 = overreach territory). "
                    f"CTL {pmc['ctl']:.1f}, ATL {pmc['atl']:.1f}."
                )
            ),
        })
    elif pmc["tsb"] < -10:
        causes.append({
            "label": "Produktive Ermüdung" if de else "Carrying productive fatigue",
            "severity": "low",
            "evidence": (
                f"TSB liegt bei {pmc['tsb']} — normal für einen harten Block, für sich genommen kein Warnsignal."
                if de else
                f"TSB is {pmc['tsb']} — normal for a hard block, not a red flag on its own."
            ),
        })

    # Grey-zone creep — suggests quality of recent training is poor
    if zones["grey_zone_flag"] and zones["samples_n"] >= 5:
        causes.append({
            "label": "Grauzonen-Drift" if de else "Grey-zone creep",
            "severity": "med",
            "evidence": (
                (
                    f"{zones['z2_pct']}% der jüngsten Radzeit liegt im moderaten "
                    f"(Seiler-Z2-)Bereich — über der 20%-Junk-Miles-Schwelle."
                ) if de else (
                    f"{zones['z2_pct']}% of recent cycling time is in the moderate "
                    f"(Seiler Z2) band — above the 20% junk-miles threshold."
                )
            ),
        })

    # Severity ordering: high → med → low
    severity_order = {"high": 0, "med": 1, "low": 2}
    causes.sort(key=lambda c: severity_order.get(c["severity"], 3))

    return {"causes": causes}
