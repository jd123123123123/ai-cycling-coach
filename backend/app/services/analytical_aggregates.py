"""Analytical aggregates — the data layer the Claude tool-use loop calls.

Every function:
    - is async and takes an AsyncSession (already RLS-scoped) plus an explicit
      user_id (we never trust user_id from tool_input)
    - returns JSON-serialisable primitives only (dates as ISO strings)
    - degrades gracefully on empty windows — never raises for "no data"
    - reuses existing services (pmc_service, advanced_metrics, training_load)
      so sports-science math lives in one place

Design note: these are PURE aggregation over the user's data. They do NOT call
LLMs, do not apply safety rails, and do not fabricate numbers. Claude reads
their outputs inside `tool_result` blocks and writes the narrative.
"""
from __future__ import annotations

import statistics
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.daily_metric import DailyMetric
from app.services.advanced_metrics import aerobic_decoupling, efficiency_factor
from app.services.pmc_service import compute_user_pmc
from app.services.training_load import calculate_np


# ======================================================================
# Internal helpers
# ======================================================================

SLEEP_TARGET_HOURS = 8.0

# TSB-delta thresholds — classify PMC window movement
_OVERREACHING_TSB_DROP = -8.0     # TSB dropping sharply over the window
_FRESHENING_TSB_RISE = 5.0        # TSB rising meaningfully → taper territory
_BUILDING_CTL_RISE = 1.5          # CTL climbing → fitness accruing
_MAINTAINING_TOLERANCE = 1.0      # within-noise CTL change


def _iso(d: date | datetime | None) -> str | None:
    if d is None:
        return None
    if isinstance(d, datetime):
        return d.astimezone(timezone.utc).isoformat() if d.tzinfo else d.isoformat()
    return d.isoformat()


async def _fetch_athlete_ftp(db: AsyncSession, user_id: int) -> int | None:
    """Pull the athlete's current FTP for watts-based calculations.

    Split out so tests can patch it independently of the whole profile row.
    """
    try:
        result = await db.execute(
            text("SELECT ftp_watts FROM athlete_profiles WHERE user_id = :uid"),
            {"uid": user_id},
        )
        val = result.scalar_one_or_none()
        return int(val) if val else None
    except Exception:
        return None


def _classify_pmc_trend(
    ctl_delta: float,
    atl_delta: float,
    tsb_delta: float,
) -> str:
    """Map per-window deltas to one of:
        - 'overreaching'   : TSB crashing (ATL outpacing CTL)
        - 'freshening'     : TSB rising meaningfully (taper / recovery block)
        - 'building'       : CTL climbing, TSB within normal range
        - 'maintaining'    : CTL flat within tolerance
        - 'insufficient_data' : caller handles separately
    """
    if tsb_delta <= _OVERREACHING_TSB_DROP:
        return "overreaching"
    if tsb_delta >= _FRESHENING_TSB_RISE and ctl_delta <= _BUILDING_CTL_RISE:
        return "freshening"
    if ctl_delta >= _BUILDING_CTL_RISE:
        return "building"
    if abs(ctl_delta) <= _MAINTAINING_TOLERANCE:
        return "maintaining"
    # Falling CTL without TSB rise → unusual; call it maintaining
    return "maintaining"


# ======================================================================
# pmc_window_summary — CTL/ATL/TSB progression for a date range
# ======================================================================

async def pmc_window_summary(
    user_id: int,
    start_date: date,
    end_date: date,
    db: AsyncSession,
) -> dict:
    """Return per-day PMC entries + window aggregate + trend classification.

    Shape:
        {
          "start_date": "YYYY-MM-DD",
          "end_date":   "YYYY-MM-DD",
          "days": [
            {"date": "YYYY-MM-DD", "ctl": 45.2, "atl": 50.1, "tsb": -4.9,
             "daily_tss": 60.0, "zone_hours": null},
            ...
          ],
          "aggregate": {
            "avg_ctl": 45.1, "avg_atl": 49.0, "avg_tsb": -3.9,
            "total_tss": 840.0, "total_hours": 14.0, "ramp_rate": 3.2
          },
          "trend": {
            "ctl_delta": 4.0, "atl_delta": -2.0, "tsb_delta": 6.0,
            "direction": "building"|"maintaining"|"freshening"|"overreaching"|"insufficient_data"
          }
        }

    `zone_hours` is left null for v1 — computing per-day Seiler distribution
    requires re-loading activity rows, which the caller can do via
    `fetch_recent_activities`. Keeping it null keeps this tool fast.
    """
    # Number of days to cover in the compute_user_pmc call. The service works
    # off 'last N days from today' — we request enough to cover start_date
    # and then slice.
    today = date.today()
    days_back = max((today - start_date).days + 1, 7)
    pmc_all = await compute_user_pmc(db, user_id, days=days_back)
    total_series = pmc_all.get("total") or []

    # Slice to [start_date, end_date]
    days_in_window: list[dict] = []
    for entry in total_series:
        d = entry.get("date")
        if isinstance(d, datetime):
            d = d.date()
        if not isinstance(d, date):
            continue
        if d < start_date or d > end_date:
            continue
        days_in_window.append({
            "date": _iso(d),
            "ctl": round(float(entry.get("ctl", 0.0)), 2),
            "atl": round(float(entry.get("atl", 0.0)), 2),
            "tsb": round(float(entry.get("tsb", 0.0)), 2),
            "daily_tss": round(float(entry.get("tss", 0.0)), 1),
            "zone_hours": None,
        })
    days_in_window.sort(key=lambda r: r["date"])

    if not days_in_window:
        return {
            "start_date": _iso(start_date),
            "end_date": _iso(end_date),
            "days": [],
            "aggregate": {
                "avg_ctl": 0,
                "avg_atl": 0,
                "avg_tsb": 0,
                "total_tss": 0,
                "total_hours": 0,
                "ramp_rate": 0,
            },
            "trend": {
                "ctl_delta": 0,
                "atl_delta": 0,
                "tsb_delta": 0,
                "direction": "insufficient_data",
            },
        }

    # Aggregates
    ctls = [d["ctl"] for d in days_in_window]
    atls = [d["atl"] for d in days_in_window]
    tsbs = [d["tsb"] for d in days_in_window]
    tss_values = [d["daily_tss"] for d in days_in_window]

    total_tss = sum(tss_values)
    avg_ctl = statistics.mean(ctls) if ctls else 0.0
    avg_atl = statistics.mean(atls) if atls else 0.0
    avg_tsb = statistics.mean(tsbs) if tsbs else 0.0

    # Hours estimate: 1 TSS per minute at IF=1.0; at IF~0.65 that's ~0.42 TSS/min
    # → we use a rough 1 hr per 50 TSS heuristic. This is a coach-level estimate,
    # not a precise duration total (caller can get exact durations from activity_summary).
    total_hours = round(total_tss / 50.0, 1)

    # Ramp rate: weekly CTL change (per-week) — (last_ctl - first_ctl) / weeks
    weeks = max(len(days_in_window) / 7.0, 0.1)
    ctl_delta = ctls[-1] - ctls[0] if len(ctls) >= 2 else 0.0
    atl_delta = atls[-1] - atls[0] if len(atls) >= 2 else 0.0
    tsb_delta = tsbs[-1] - tsbs[0] if len(tsbs) >= 2 else 0.0
    ramp_rate = round(ctl_delta / weeks, 2)

    # Trend classification — only meaningful with ≥2 days; single-day returns
    # 'maintaining' because deltas are all 0 by construction.
    if len(days_in_window) < 2:
        direction = "maintaining"
    else:
        direction = _classify_pmc_trend(ctl_delta, atl_delta, tsb_delta)

    return {
        "start_date": _iso(start_date),
        "end_date": _iso(end_date),
        "days": days_in_window,
        "aggregate": {
            "avg_ctl": round(avg_ctl, 2),
            "avg_atl": round(avg_atl, 2),
            "avg_tsb": round(avg_tsb, 2),
            "total_tss": round(total_tss, 1),
            "total_hours": total_hours,
            "ramp_rate": ramp_rate,
        },
        "trend": {
            "ctl_delta": round(ctl_delta, 2),
            "atl_delta": round(atl_delta, 2),
            "tsb_delta": round(tsb_delta, 2),
            "direction": direction,
        },
    }


# ======================================================================
# recovery_trend_summary — biometric flags
# ======================================================================

def _extract_sleep_hours(m: Any) -> float | None:
    """Read sleep hours from a DailyMetric's raw_data, tolerating multiple shapes.

    Mirrors advanced_metrics.sleep_debt's extraction logic so the tool and the
    `/coach/brief` snapshot see consistent sleep values.
    """
    raw = m.raw_data if isinstance(m.raw_data, dict) else {}
    sleep = raw.get("sleep") if isinstance(raw.get("sleep"), dict) else {}
    if isinstance(sleep.get("hours"), (int, float)):
        return float(sleep["hours"])
    dto = sleep.get("dailySleepDTO") if isinstance(sleep.get("dailySleepDTO"), dict) else {}
    secs = dto.get("sleepTimeSeconds") if isinstance(dto, dict) else None
    if isinstance(secs, (int, float)) and secs > 0:
        return float(secs) / 3600.0
    return None


async def recovery_trend_summary(
    user_id: int,
    days: int,
    db: AsyncSession,
) -> dict:
    """Return per-day biometric entries + window aggregate + flag list.

    Shape:
        {
          "days": [
            {"date": "YYYY-MM-DD", "sleep_score": 78, "hrv_ms": 55.2,
             "body_battery": 65, "resting_hr": 54, "sleep_hours": 7.2},
            ...
          ],
          "aggregate": {
            "avg_sleep": 7.1, "avg_hrv": 55.2, "hrv_trend_pct": -12.5,
            "sleep_debt_hours": 6.0, "avg_rhr": 54.0, "rhr_trend_pct": 3.5
          },
          "flags": ["low_hrv", "sleep_debt", "rhr_elevated"]
        }

    Flag rules:
        - low_hrv:       7d HRV mean drops ≥10% vs 28d baseline
        - sleep_debt:    ≥5 of last 7 nights <7h sleep
        - rhr_elevated:  7d rHR mean ≥5% above 28d baseline
    """
    days = max(1, int(days))
    baseline_days = max(days, 28)
    since = datetime.now(timezone.utc) - timedelta(days=baseline_days)
    stmt = (
        select(DailyMetric)
        .where(
            DailyMetric.user_id == user_id,
            DailyMetric.recorded_at >= since,
        )
        .order_by(DailyMetric.recorded_at.asc())
    )
    result = await db.execute(stmt)
    metrics = list(result.scalars().all())

    # Slice to 'days'-window for per-day list
    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    recent = [m for m in metrics if m.recorded_at >= recent_cutoff]

    day_rows: list[dict] = []
    for m in recent:
        d = m.date if isinstance(m.date, date) else (
            m.recorded_at.date() if isinstance(m.recorded_at, datetime) else None
        )
        if d is None:
            continue
        day_rows.append({
            "date": _iso(d),
            "sleep_score": m.sleep_score,
            "hrv_ms": round(float(m.hrv_status), 2) if m.hrv_status is not None else None,
            "body_battery": m.body_battery,
            "resting_hr": m.resting_hr,
            "sleep_hours": round(_extract_sleep_hours(m), 2) if _extract_sleep_hours(m) is not None else None,
        })
    day_rows.sort(key=lambda r: r["date"] or "")

    if not metrics:
        return {
            "days": [],
            "aggregate": {
                "avg_sleep": 0,
                "avg_hrv": 0,
                "hrv_trend_pct": 0,
                "sleep_debt_hours": 0,
                "avg_rhr": 0,
                "rhr_trend_pct": 0,
            },
            "flags": [],
        }

    # --- HRV trend (7d vs 28d baseline) ---
    hrv_baseline = [m.hrv_status for m in metrics if m.hrv_status is not None]
    hrv_recent = [m.hrv_status for m in recent if m.hrv_status is not None]
    hrv_base_mean = statistics.mean(hrv_baseline) if hrv_baseline else None
    hrv_recent_mean = statistics.mean(hrv_recent) if hrv_recent else None
    hrv_trend_pct: float | None = None
    if hrv_base_mean is not None and hrv_recent_mean is not None and hrv_base_mean != 0:
        hrv_trend_pct = round((hrv_recent_mean - hrv_base_mean) / hrv_base_mean * 100.0, 2)

    # --- rHR trend ---
    rhr_baseline = [m.resting_hr for m in metrics if m.resting_hr is not None]
    rhr_recent = [m.resting_hr for m in recent if m.resting_hr is not None]
    rhr_base_mean = statistics.mean(rhr_baseline) if rhr_baseline else None
    rhr_recent_mean = statistics.mean(rhr_recent) if rhr_recent else None
    rhr_trend_pct: float | None = None
    if rhr_base_mean is not None and rhr_recent_mean is not None and rhr_base_mean != 0:
        rhr_trend_pct = round((rhr_recent_mean - rhr_base_mean) / rhr_base_mean * 100.0, 2)

    # --- Sleep debt ---
    nightly_recent = [_extract_sleep_hours(m) for m in recent]
    nightly_recent = [h for h in nightly_recent if h is not None]
    avg_sleep = round(statistics.mean(nightly_recent), 2) if nightly_recent else 0.0
    sleep_debt_hours = round(
        sum(max(0.0, SLEEP_TARGET_HOURS - h) for h in nightly_recent), 2
    )
    nights_short = sum(1 for h in nightly_recent if h < 7.0)

    # --- Flags ---
    flags: list[str] = []
    if hrv_trend_pct is not None and hrv_trend_pct <= -10.0:
        flags.append("low_hrv")
    if nights_short >= 5 and len(nightly_recent) >= 5:
        flags.append("sleep_debt")
    if rhr_trend_pct is not None and rhr_trend_pct >= 5.0:
        flags.append("rhr_elevated")

    return {
        "days": day_rows,
        "aggregate": {
            "avg_sleep": avg_sleep,
            "avg_hrv": round(hrv_recent_mean, 2) if hrv_recent_mean is not None else 0,
            "hrv_trend_pct": hrv_trend_pct if hrv_trend_pct is not None else 0,
            "sleep_debt_hours": sleep_debt_hours,
            "avg_rhr": round(rhr_recent_mean, 2) if rhr_recent_mean is not None else 0,
            "rhr_trend_pct": rhr_trend_pct if rhr_trend_pct is not None else 0,
        },
        "flags": flags,
    }


# ======================================================================
# activity_summary — per-activity metrics + aggregates
# ======================================================================

def _activity_if(activity: Any, ftp: int | None) -> float | None:
    """IF = NP / FTP (Coggan). Cycling only — running watts must not be divided
    by cycling FTP (a running activity at ~330 W / 240 W FTP = IF 1.38 → bogus z3).
    Falls back to avg_power/FTP when NP absent."""
    if getattr(activity, "sport", None) != "cycling":
        return None
    if ftp is None or ftp <= 0:
        return None
    np_val = activity.normalized_power or activity.average_power
    if np_val is None:
        return None
    return round(float(np_val) / ftp, 3)


def _zone_from_if(if_val: float | None) -> str:
    """Coarse 3-zone bucket — mirrors zone_distribution heuristic."""
    if if_val is None:
        return "unknown"
    if if_val < 0.77:
        return "z1"
    if if_val <= 1.00:
        return "z2"
    return "z3"


async def activity_summary(
    user_id: int,
    limit: int,
    sport_filter: str | None,
    db: AsyncSession,
) -> dict:
    """Last N activities (optionally filtered by sport) + aggregate stats.

    Shape:
        {
          "activities": [
            {"id": 123, "date": "YYYY-MM-DDTHH:MM:SSZ", "sport": "cycling",
             "duration_min": 60, "tss": 55.0, "if_": 0.75, "np_": 210,
             "decoupling_pct": 4.2, "ef": 1.48, "zone": "z2"},
            ...
          ],
          "aggregate": {
            "total_tss": 500.0, "avg_if": 0.72, "avg_decoupling": 5.1,
            "sport_mix": {"cycling": 8, "running": 2}, "count": 10
          }
        }
    """
    limit = max(1, min(int(limit), 50))

    stmt = select(Activity).where(Activity.user_id == user_id)
    if sport_filter:
        stmt = stmt.where(Activity.sport == sport_filter)
    stmt = stmt.order_by(Activity.started_at.desc()).limit(limit)
    result = await db.execute(stmt)
    activities = list(result.scalars().all())

    ftp = await _fetch_athlete_ftp(db, user_id)

    rows: list[dict] = []
    if_values: list[float] = []
    decoupling_values: list[float] = []

    for a in activities:
        if_val = _activity_if(a, ftp)
        if if_val is not None:
            if_values.append(if_val)

        ef_val = efficiency_factor(a.normalized_power, a.average_hr)
        dec_val: float | None = None
        raw = a.raw_data if isinstance(a.raw_data, dict) else None
        if raw:
            p_samples = raw.get("power_samples")
            h_samples = raw.get("hr_samples")
            if isinstance(p_samples, list) and isinstance(h_samples, list):
                n = min(len(p_samples), len(h_samples))
                if n >= 60:
                    half = n // 2
                    pf = [p for p in p_samples[:half] if isinstance(p, (int, float))]
                    ps = [p for p in p_samples[half:n] if isinstance(p, (int, float))]
                    hf = [h for h in h_samples[:half] if isinstance(h, (int, float)) and h > 0]
                    hs = [h for h in h_samples[half:n] if isinstance(h, (int, float)) and h > 0]
                    if pf and ps and hf and hs:
                        dec_val = aerobic_decoupling(
                            calculate_np(pf), sum(hf) / len(hf),
                            calculate_np(ps), sum(hs) / len(hs),
                        )
        if dec_val is not None:
            decoupling_values.append(dec_val)

        duration_min = int(round((a.duration_seconds or 0) / 60.0))
        rows.append({
            "id": a.id,
            "date": _iso(a.started_at),
            "sport": a.sport,
            "duration_min": duration_min,
            "tss": round(float(a.tss), 1) if a.tss is not None else None,
            "if_": if_val,
            "np_": int(a.normalized_power) if a.normalized_power else None,
            "decoupling_pct": dec_val,
            "ef": ef_val,
            "zone": _zone_from_if(if_val),
        })

    total_tss = sum(float(a.tss or 0) for a in activities)
    sport_counter = Counter(a.sport for a in activities)
    sport_mix = dict(sport_counter)
    # Ensure at least the canonical sports appear (0 if absent) for test determinism
    for sport in ("cycling", "running", "gym"):
        sport_mix.setdefault(sport, 0)

    aggregate = {
        "total_tss": round(total_tss, 1),
        "avg_if": round(statistics.mean(if_values), 3) if if_values else None,
        "avg_decoupling": round(statistics.mean(decoupling_values), 2) if decoupling_values else None,
        "sport_mix": sport_mix,
        "count": len(activities),
    }

    return {"activities": rows, "aggregate": aggregate}


# ======================================================================
# ftp_progression_summary — FTP history + deltas
# ======================================================================

async def ftp_progression_summary(
    user_id: int,
    db: AsyncSession,
) -> dict:
    """Return FTP history with 30d / 90d deltas + a plain-English trend label.

    Shape:
        {
          "entries": [
            {"date": "YYYY-MM-DD", "ftp_w": 275, "source": "manual"},
            ...
          ],
          "current": 275,
          "delta_30d_pct": 3.7,
          "delta_90d_pct": 7.9,
          "trend": "improving"|"stable"|"declining"
        }
    """
    result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()

    entries: list[dict] = []
    current: int | None = None
    if profile and isinstance(profile.ftp_history, list):
        for h in profile.ftp_history:
            if not isinstance(h, dict):
                continue
            ftp_w = h.get("ftp_watts")
            measured_at = h.get("measured_at")
            if ftp_w is None:
                continue
            # measured_at may be an ISO string or a datetime
            date_str: str | None = None
            if isinstance(measured_at, str):
                date_str = measured_at
            elif isinstance(measured_at, (date, datetime)):
                date_str = _iso(measured_at)
            entries.append({
                "date": date_str,
                "ftp_w": int(ftp_w),
                "source": h.get("source", "manual"),
            })
    if profile and profile.ftp_watts is not None:
        current = int(profile.ftp_watts)
    elif entries:
        current = entries[-1]["ftp_w"]

    # Compute deltas — find the closest-to-30d-ago and 90d-ago historical values.
    today = date.today()

    def _ftp_at_or_before(cutoff: date) -> int | None:
        best: tuple[date, int] | None = None
        for e in entries:
            d_str = e.get("date")
            if not d_str:
                continue
            try:
                d = date.fromisoformat(d_str[:10])
            except (ValueError, TypeError):
                continue
            if d > cutoff:
                continue
            if best is None or d > best[0]:
                best = (d, e["ftp_w"])
        return best[1] if best else None

    past_30 = _ftp_at_or_before(today - timedelta(days=30))
    past_90 = _ftp_at_or_before(today - timedelta(days=90))

    delta_30d_pct = (
        round((current - past_30) / past_30 * 100.0, 2)
        if current is not None and past_30 is not None and past_30 > 0
        else None
    )
    delta_90d_pct = (
        round((current - past_90) / past_90 * 100.0, 2)
        if current is not None and past_90 is not None and past_90 > 0
        else None
    )

    # Trend: 30d delta drives the label; 90d is informational.
    if delta_30d_pct is None:
        trend = "stable"
    elif delta_30d_pct >= 2.0:
        trend = "improving"
    elif delta_30d_pct <= -2.0:
        trend = "declining"
    else:
        trend = "stable"

    return {
        "entries": entries,
        "current": current,
        "delta_30d_pct": delta_30d_pct,
        "delta_90d_pct": delta_90d_pct,
        "trend": trend,
    }
