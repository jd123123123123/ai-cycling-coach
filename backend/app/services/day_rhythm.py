"""Whole-day intraday rhythm intelligence for the coach.

Distills every intraday data point we actually have into honest, cited
day-rhythm signals the brief/chat LLM can reference ("your stress usually
peaks mid-afternoon — morning is your window").

Real data inventory (verified against the live DB):
    daily_metric_samples hypertable (via intraday_sync_service):
        - "stress"        ~3-min cadence, ~300-430 samples/day (Garmin drops
                          -1/-2 'no reading' rows, so daytime gaps exist)
        - "hrv"           overnight-only readings (~60-110/night)
        - "body_battery"  SPARSE — only ~5-7 samples/day on the free feed,
                          NOT a usable intraday curve; deliberately unused here
    daily_metrics summary rows:
        - steps           running day-total (whole-day count, no hourly series)
        - raw_data.sleep.dailySleepDTO.sleepStartTimestampGMT/-EndTimestampGMT
                          (ms epoch) → sleep onset for bedtime consistency
        - raw_data.heart_rates.heartRateValues  [[ts_ms, bpm], ...] ~2-min
                          cadence → the only intraday HR series we have

Honesty rules:
    - Every field degrades to None when its inputs are sparse/missing.
    - There is NO intraday step series — steps comparisons expose the running
      day total next to a *full-day* median, explicitly labeled as such, and
      the same-hour "quiet morning" comparison is carried by stress (which we
      do have hour-resolved) — never by fabricated hourly steps.
    - best_training_window is labeled "observed pattern", never a prescription.
"""
from __future__ import annotations

import logging
import statistics
from datetime import date as date_type, datetime, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_metric import DailyMetric
from app.models.daily_metric_sample import DailyMetricSample
from app.services import athlete_time

logger = logging.getLogger(__name__)

# How far back the rhythm looks. 21 days ≈ 3 weeks of habit — long enough to
# smooth one-off days, short enough to track a schedule change.
HISTORY_DAYS = 21

# An hour-of-day bucket only counts toward a historical pattern when at least
# this many distinct days contributed samples to it.
MIN_DAYS_PER_HOUR = 3

# Bedtime consistency needs a few nights to be a claim worth making.
MIN_NIGHTS_FOR_BEDTIME = 4

# Sleep shorter than this is treated as a nap, not the main sleep window.
MIN_MAIN_SLEEP_S = 3 * 3600

# Full-day steps median needs this many complete prior days.
MIN_DAYS_FOR_STEPS_BASELINE = 5

# "Today so far" stress comparison needs at least this many post-06:00 samples.
MIN_TODAY_STRESS_SAMPLES = 5

# Waking-hour band used for peak/best-window scans (local hours, inclusive
# start / exclusive end of the last 2h window start).
WAKING_START_H = 6
WAKING_END_H = 22  # windows are [h, h+2), last candidate start is 20


Point = tuple[datetime, float]  # (tz-aware UTC timestamp, value)


# ======================================================================
#  Pure helpers (unit-tested directly with synthetic fixtures)
# ======================================================================


def _minutes_since_noon_local(dt_utc: datetime, tz: ZoneInfo) -> int:
    """Map a UTC instant to minutes-past-12:00 local (0..1439).

    Bedtimes cluster 20:00-03:00 local; anchoring at noon makes that range
    contiguous (480..900) so plain mean/stdev work without circular math.
    """
    loc = dt_utc.astimezone(tz)
    return (loc.hour * 60 + loc.minute - 720) % 1440


def bedtime_stats(
    sleep_onsets_utc: list[datetime], tz: ZoneInfo
) -> tuple[float, str, int] | None:
    """(stddev_min, typical "HH:MM" local, nights_used) or None if < MIN nights."""
    if len(sleep_onsets_utc) < MIN_NIGHTS_FOR_BEDTIME:
        return None
    mins = [_minutes_since_noon_local(dt, tz) for dt in sleep_onsets_utc]
    stddev = statistics.stdev(mins)
    median = statistics.median(mins)
    total = int(round(720 + median)) % 1440
    typical = f"{total // 60:02d}:{total % 60:02d}"
    return (round(stddev, 1), typical, len(mins))


def hourly_stats(points: list[Point], tz: ZoneInfo) -> dict[int, tuple[float, int, int]]:
    """Bucket points by local hour → {hour: (mean, n_samples, n_distinct_days)}."""
    agg: dict[int, tuple[float, int, set]] = {}
    for dt_utc, v in points:
        loc = dt_utc.astimezone(tz)
        s, n, days = agg.get(loc.hour, (0.0, 0, set()))
        days.add(loc.date())
        agg[loc.hour] = (s + v, n + 1, days)
    return {h: (s / n, n, len(days)) for h, (s, n, days) in agg.items() if n > 0}


def _band_mean(
    stats: dict[int, tuple[float, int, int]], start_h: int, end_h: int
) -> float | None:
    """Sample-weighted mean over local hours [start_h, end_h); None when the
    band has too few contributing days."""
    total, n, max_days = 0.0, 0, 0
    for h in range(start_h, end_h):
        if h in stats:
            mean, cnt, days = stats[h]
            total += mean * cnt
            n += cnt
            max_days = max(max_days, days)
    if n == 0 or max_days < MIN_DAYS_PER_HOUR:
        return None
    return round(total / n, 1)


def _peak_window(
    stats: dict[int, tuple[float, int, int]],
    min_days: int = MIN_DAYS_PER_HOUR,
    min_samples_per_hour: int = 1,
) -> str | None:
    """Highest-mean contiguous 2h waking window, e.g. '14-16h'. Both hours
    must have >= min_days days and >= min_samples_per_hour samples."""
    best_h, best_mean = None, None
    for h in range(WAKING_START_H, WAKING_END_H - 1):
        pair = [stats.get(h), stats.get(h + 1)]
        if any(p is None or p[2] < min_days or p[1] < min_samples_per_hour for p in pair):
            continue
        mean = (pair[0][0] + pair[1][0]) / 2.0
        if best_mean is None or mean > best_mean:
            best_h, best_mean = h, mean
    if best_h is None:
        return None
    return f"{best_h}-{best_h + 2}h"


def stress_curve(
    history_points: list[Point], today_points: list[Point], tz: ZoneInfo
) -> dict | None:
    """Morning/afternoon/evening mean stress + historical & today peak windows.

    History and today are pooled for the band means / historical peak (today is
    part of the observed pattern); today's peak comes from today's samples only.
    """
    pooled = history_points + today_points
    if not pooled:
        return None
    stats = hourly_stats(pooled, tz)
    today_stats = hourly_stats(today_points, tz)
    curve = {
        "morning_mean": _band_mean(stats, 6, 12),
        "afternoon_mean": _band_mean(stats, 12, 18),
        "evening_mean": _band_mean(stats, 18, 23),
        "peak_window_local": _peak_window(stats),
        # Today only needs itself: 1 day, but demand a few samples per hour so
        # a single 3-min reading can't crown a "peak".
        "today_peak_window_local": _peak_window(
            today_stats, min_days=1, min_samples_per_hour=3
        ),
        "days_used": len({p[0].astimezone(tz).date() for p in pooled}),
    }
    if all(v is None for k, v in curve.items() if k != "days_used"):
        return None
    return curve


def best_training_window(
    stress_stats: dict[int, tuple[float, int, int]],
    hr_stats: dict[int, tuple[float, int, int]],
) -> dict | None:
    """Observed-pattern 2h window where the athlete is usually active (elevated
    HR) and life-stress is historically low. Never prescriptive — the caller
    must surface it as an observed pattern only.

    Scoring per candidate window [h, h+2), h in 6..19:
        + normalized HR elevation  (they usually move/train then)
        + (1 - normalized stress)  (historically calm hours)
    When BOTH channels have coverage, only windows observable on both are
    candidates — otherwise a stress-only hour with zero activity evidence
    could outscore the genuinely-observed pattern. A wholly-absent channel
    drops out and the other carries the score alone.
    """
    def _window_mean(stats: dict[int, tuple[float, int, int]], h: int) -> float | None:
        pair = [stats.get(h), stats.get(h + 1)]
        if any(p is None or p[2] < MIN_DAYS_PER_HOUR for p in pair):
            return None
        return (pair[0][0] + pair[1][0]) / 2.0

    stress_w: dict[int, float] = {}
    hr_w: dict[int, float] = {}
    for h in range(WAKING_START_H, WAKING_END_H - 1):
        s = _window_mean(stress_stats, h)
        a = _window_mean(hr_stats, h)
        if s is not None:
            stress_w[h] = s
        if a is not None:
            hr_w[h] = a

    use_stress, use_hr = bool(stress_w), bool(hr_w)
    if use_stress and use_hr:
        hours = sorted(set(stress_w) & set(hr_w))
    elif use_stress:
        hours = sorted(stress_w)
    elif use_hr:
        hours = sorted(hr_w)
    else:
        return None
    if len(hours) < 3:
        return None  # too little of the day observed to call a pattern

    def _normalize(w: dict[int, float]) -> dict[int, float]:
        vals = [w[h] for h in hours if h in w]
        if not vals:
            return {}
        lo, hi = min(vals), max(vals)
        if hi - lo < 1e-9:
            return {h: 0.5 for h in hours if h in w}
        return {h: (w[h] - lo) / (hi - lo) for h in hours if h in w}

    stress_norm = _normalize(stress_w) if use_stress else {}
    hr_norm = _normalize(hr_w) if use_hr else {}

    best_h, best_score = None, None
    for h in hours:
        score, parts = 0.0, 0
        if h in stress_norm:
            score += 1.0 - stress_norm[h]
            parts += 1
        if h in hr_norm:
            score += hr_norm[h]
            parts += 1
        score /= parts
        if best_score is None or score > best_score:
            best_h, best_score = h, score

    if best_h is None:
        return None
    used_stress = best_h in stress_norm
    used_hr = best_h in hr_norm
    if used_stress and used_hr:
        basis = "usually active (elevated HR) with historically low stress in this window"
    elif used_hr:
        basis = "the athlete is usually active (elevated HR) in this window"
    else:
        basis = "historically the calmest waking hours"
    days_pool = [
        stats[h][2]
        for stats, used in ((stress_stats, used_stress), (hr_stats, used_hr))
        if used
        for h in (best_h, best_h + 1)
        if h in stats
    ]
    return {
        "start_hour_local": best_h,
        "end_hour_local": best_h + 2,
        "window_label": f"{best_h}-{best_h + 2}h",
        "label": "observed pattern",
        "basis": basis,
        "days_used": min(days_pool) if days_pool else 0,
    }


def today_so_far(
    today_stress: list[Point],
    history_stress: list[Point],
    steps_today: int | None,
    prior_day_steps: list[int],
    now_utc: datetime,
    tz: ZoneInfo,
) -> dict | None:
    """Today-vs-baseline snapshot at the current local time.

    Stress: mean of today's samples between 06:00 local and now, against the
    mean of historical samples in the SAME local time-of-day band (an honest
    same-hours baseline). Steps: running day total next to a full-day median
    — explicitly NOT hour-adjusted, because no intraday step series exists.
    """
    now_local = now_utc.astimezone(tz)
    as_of = f"{now_local.hour:02d}:{now_local.minute:02d}"
    now_mod = now_local.hour * 60 + now_local.minute  # minutes since local midnight

    def _in_band(dt_utc: datetime) -> bool:
        loc = dt_utc.astimezone(tz)
        mod = loc.hour * 60 + loc.minute
        return 6 * 60 <= mod <= now_mod

    stress_so_far = None
    typical_same_hours = None
    vs_pct = None
    todays_band = [v for dt, v in today_stress if _in_band(dt)]
    if len(todays_band) >= MIN_TODAY_STRESS_SAMPLES:
        hist_band = [v for dt, v in history_stress if _in_band(dt)]
        hist_days = len({dt.astimezone(tz).date() for dt, v in history_stress if _in_band(dt)})
        stress_so_far = round(statistics.fmean(todays_band), 1)
        if hist_band and hist_days >= MIN_DAYS_PER_HOUR:
            typical_same_hours = round(statistics.fmean(hist_band), 1)
            if typical_same_hours > 0:
                vs_pct = round(
                    (stress_so_far - typical_same_hours) / typical_same_hours * 100.0, 1
                )

    typical_full_day_steps = None
    if len(prior_day_steps) >= MIN_DAYS_FOR_STEPS_BASELINE:
        typical_full_day_steps = int(statistics.median(prior_day_steps))

    if stress_so_far is None and steps_today is None:
        return None
    return {
        "as_of_local": as_of,
        "stress_so_far_mean": stress_so_far,
        "typical_same_hours_stress": typical_same_hours,
        "stress_vs_typical_pct": vs_pct,
        "steps_today": steps_today,
        "typical_full_day_steps": typical_full_day_steps,
        "steps_note": (
            "steps_today is the running day total; the baseline is a FULL-DAY "
            "median (no intraday step series exists) — do not compare them "
            "hour-for-hour"
        ),
    }


# ======================================================================
#  Extraction from daily_metrics raw_data
# ======================================================================


def _extract_sleep_onsets(daily_rows: list) -> list[datetime]:
    """Main-sleep onset instants (UTC) from raw_data.sleep.dailySleepDTO."""
    onsets: list[datetime] = []
    for row in daily_rows:
        raw = getattr(row, "raw_data", None)
        if not isinstance(raw, dict):
            continue
        dto = ((raw.get("sleep") or {}).get("dailySleepDTO")) or {}
        start_ms = dto.get("sleepStartTimestampGMT")
        total_s = dto.get("sleepTimeSeconds")
        if not isinstance(start_ms, (int, float)):
            continue
        if not isinstance(total_s, (int, float)) or total_s < MIN_MAIN_SLEEP_S:
            continue  # nap or untracked night — not a bedtime
        try:
            onsets.append(datetime.fromtimestamp(start_ms / 1000.0, tz=timezone.utc))
        except (OverflowError, OSError, ValueError):
            continue
    return onsets


def _extract_hr_points(daily_rows: list) -> list[Point]:
    """~2-min intraday HR from raw_data.heart_rates.heartRateValues."""
    points: list[Point] = []
    for row in daily_rows:
        raw = getattr(row, "raw_data", None)
        if not isinstance(raw, dict):
            continue
        hr = raw.get("heart_rates") or {}
        values = hr.get("heartRateValues") if isinstance(hr, dict) else None
        for pair in values or []:
            if not isinstance(pair, (list, tuple)) or len(pair) < 2:
                continue
            ts_ms, bpm = pair[0], pair[1]
            if ts_ms is None or bpm is None:
                continue
            try:
                points.append(
                    (datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc), float(bpm))
                )
            except (OverflowError, OSError, ValueError, TypeError):
                continue
    return points


# ======================================================================
#  Entry point
# ======================================================================


async def compute_day_rhythm(
    db: AsyncSession,
    user_id: int,
    *,
    target_date: date_type | None = None,
    tz: ZoneInfo | None = None,
    now_utc: datetime | None = None,
    history_days: int = HISTORY_DAYS,
) -> dict | None:
    """Compute the athlete's whole-day rhythm signals.

    Returns None when there is no intraday data at all; otherwise a dict whose
    individual fields are None wherever the inputs are too sparse. Two queries:
    (1) stress samples for the window, (2) daily_metrics rows for the window.
    """
    tz = tz or athlete_time.athlete_tz()  # bound athlete tz (Berlin fallback)
    now_utc = now_utc or datetime.now(timezone.utc)
    target_date = target_date or now_utc.astimezone(tz).date()
    window_start_local = datetime.combine(
        target_date - timedelta(days=history_days), dtime.min, tzinfo=tz
    )
    window_start_utc = window_start_local.astimezone(timezone.utc)

    # Query 1 — intraday stress samples (the only dense daytime channel).
    sample_q = await db.execute(
        select(DailyMetricSample)
        .where(
            DailyMetricSample.user_id == user_id,
            DailyMetricSample.metric_type == "stress",
            DailyMetricSample.recorded_at >= window_start_utc,
        )
        .order_by(DailyMetricSample.recorded_at.asc())
    )
    stress_points: list[Point] = []
    for row in sample_q.scalars().all():
        dt = row.recorded_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        stress_points.append((dt, float(row.value)))

    # Query 2 — daily summary rows (sleep windows, steps, intraday HR).
    daily_q = await db.execute(
        select(DailyMetric)
        .where(
            DailyMetric.user_id == user_id,
            DailyMetric.date >= target_date - timedelta(days=history_days),
            DailyMetric.date <= target_date,
        )
        .order_by(DailyMetric.date.asc())
    )
    daily_rows = list(daily_q.scalars().all())

    if not stress_points and not daily_rows:
        return None  # nothing observed — say nothing rather than guess

    today_stress = [p for p in stress_points if p[0].astimezone(tz).date() == target_date]
    history_stress = [p for p in stress_points if p[0].astimezone(tz).date() != target_date]

    sleep_onsets = _extract_sleep_onsets(daily_rows)
    hr_points = _extract_hr_points(daily_rows)

    bedtime = bedtime_stats(sleep_onsets, tz)
    curve = stress_curve(history_stress, today_stress, tz)
    window = best_training_window(
        hourly_stats(history_stress + today_stress, tz),
        hourly_stats(hr_points, tz),
    )

    steps_today: int | None = None
    prior_day_steps: list[int] = []
    for row in daily_rows:
        row_date = getattr(row, "date", None)
        row_steps = getattr(row, "steps", None)
        if row_date == target_date:
            steps_today = row_steps if isinstance(row_steps, int) else None
        elif isinstance(row_steps, int) and row_steps > 0:
            prior_day_steps.append(row_steps)

    so_far = today_so_far(
        today_stress, history_stress, steps_today, prior_day_steps, now_utc, tz
    )

    channels: list[str] = []
    if stress_points:
        channels.append("stress (3-min intraday)")
    if hr_points:
        channels.append("heart_rate (2-min intraday)")
    if sleep_onsets:
        channels.append("sleep windows")
    if steps_today is not None or prior_day_steps:
        channels.append("steps (day totals)")

    return {
        "bedtime_consistency_min": bedtime[0] if bedtime else None,
        "bedtime_typical_onset_local": bedtime[1] if bedtime else None,
        "bedtime_nights_used": bedtime[2] if bedtime else 0,
        "stress_curve": curve,
        "best_training_window": window,
        "today_so_far": so_far,
        "history_days": history_days,
        "channels_used": channels,
    }


# ======================================================================
#  Prompt rendering — appended to the brief/chat user message
# ======================================================================


def render_day_rhythm_context(day_rhythm: dict | None) -> str | None:
    """Render the day-rhythm dict as a prompt context block, or None when
    there is nothing evidenced to say. Only fields with real data appear."""
    if not isinstance(day_rhythm, dict):
        return None
    lines: list[str] = []

    if day_rhythm.get("bedtime_consistency_min") is not None:
        lines.append(
            "Sleep onset: typically {} local, night-to-night variation ±{:.0f} min "
            "({} nights observed).".format(
                day_rhythm.get("bedtime_typical_onset_local") or "?",
                float(day_rhythm["bedtime_consistency_min"]),
                day_rhythm.get("bedtime_nights_used") or 0,
            )
        )

    curve = day_rhythm.get("stress_curve")
    if isinstance(curve, dict):
        parts = []
        for key, label in (
            ("morning_mean", "morning"),
            ("afternoon_mean", "afternoon"),
            ("evening_mean", "evening"),
        ):
            if curve.get(key) is not None:
                parts.append(f"{label} avg {curve[key]:.0f}")
        segs = []
        if parts:
            segs.append("Stress curve (observed): " + ", ".join(parts))
        if curve.get("peak_window_local"):
            segs.append(f"usually peaks {curve['peak_window_local']} local")
        if curve.get("today_peak_window_local"):
            segs.append(f"today's peak so far {curve['today_peak_window_local']}")
        if segs:
            lines.append("; ".join(segs) + ".")

    window = day_rhythm.get("best_training_window")
    if isinstance(window, dict) and window.get("window_label"):
        lines.append(
            "Best training window (observed pattern, not a rule): "
            f"{window['window_label']} local — {window.get('basis', 'observed pattern')}."
        )

    so_far = day_rhythm.get("today_so_far")
    if isinstance(so_far, dict):
        bits = []
        if so_far.get("stress_so_far_mean") is not None:
            s = f"stress avg {so_far['stress_so_far_mean']:.0f}"
            if so_far.get("typical_same_hours_stress") is not None:
                s += f" vs {so_far['typical_same_hours_stress']:.0f} typical for this time of day"
                if so_far.get("stress_vs_typical_pct") is not None:
                    s += f" ({so_far['stress_vs_typical_pct']:+.0f}%)"
            bits.append(s)
        if so_far.get("steps_today") is not None:
            s = f"{so_far['steps_today']} steps so far"
            if so_far.get("typical_full_day_steps") is not None:
                s += (
                    f" (typical FULL day ~{so_far['typical_full_day_steps']} — "
                    "day still in progress, not an hourly comparison)"
                )
            bits.append(s)
        if bits:
            lines.append(
                f"Today so far (as of {so_far.get('as_of_local', '?')} local): "
                + "; ".join(bits)
                + "."
            )

    if not lines:
        return None
    header = (
        "--- Day rhythm (observed intraday patterns, last "
        f"{day_rhythm.get('history_days', HISTORY_DAYS)} days) ---"
    )
    footer = (
        "Reference these as observed patterns (e.g. 'your stress usually peaks "
        "mid-afternoon — the morning is your window'), never as prescriptive "
        "certainty. Skip anything not listed above — missing means unobserved."
    )
    return "\n".join([header, *lines, footer])
