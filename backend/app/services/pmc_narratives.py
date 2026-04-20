"""Per-day PMC narrative generator.

Produces a 1-2 sentence plain-English summary of what happened each day for
the Performance Management Chart hover tooltip. No LLM — pure rule-based
templates, deterministic, fast, cheap.

Two language modes (same rules as Phase 5.2):
  - simple:    No FTP/TSS/CTL/ATL/TSB/EF/VI/NP/Z1-Z7/RPE/Coggan/Banister/etc.
  - technical: Cites CTL/ATL/TSB notation, TSS values, TSS/h intensity.

Intensity is classified from daily TSS + total duration:
  rest      -> 0 TSS
  easy      -> < 45 TSS/h
  moderate  -> 45-75 TSS/h
  hard      -> 75-110 TSS/h
  big       -> > 110 TSS/h OR absolute TSS >= 120

Max narrative length is 140 chars so tooltips stay compact.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

Language = Literal["simple", "technical"]
IntensityLabel = Literal["rest", "easy", "moderate", "hard", "big"]
Sport = Literal["cycling", "running", "gym"]

MAX_NARRATIVE_CHARS = 140


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DayActivity:
    """Compact summary of what an athlete did on a single day.

    `primary_sport` is the sport of the longest single activity that day,
    or None if there were no activities. `intensity_label` is derived from
    total daily TSS divided by total duration via `classify_intensity()`.
    """

    duration_min: float
    primary_sport: Sport | None
    activity_count: int
    intensity_label: IntensityLabel


# ---------------------------------------------------------------------------
# Intensity classification
# ---------------------------------------------------------------------------

def classify_intensity(tss: float, duration_min: float) -> IntensityLabel:
    """Bucket a day into rest/easy/moderate/hard/big from TSS + duration.

    Thresholds match coaching intuition:
      - rest: no training stress at all (TSS == 0)
      - easy: aerobic cruise — less than 45 TSS/h
      - moderate: endurance-to-tempo — 45-75 TSS/h
      - hard: threshold/VO2 work — 75-110 TSS/h
      - big: very hard session OR a very long day — >110 TSS/h, or TSS>=120
    """
    if tss <= 0 or duration_min <= 0:
        return "rest"

    # Absolute TSS ceiling — a very long sub-threshold day still counts as "big".
    if tss >= 120:
        return "big"

    tss_per_hour = tss * 60.0 / duration_min
    if tss_per_hour > 110:
        return "big"
    if tss_per_hour >= 75:
        return "hard"
    if tss_per_hour >= 45:
        return "moderate"
    return "easy"


# ---------------------------------------------------------------------------
# Form (TSB) labels
# ---------------------------------------------------------------------------

def _form_label(tsb: float, language: Language) -> str:
    """Plain-English form label; simple mode uses lay terms."""
    # Technical parentheticals use the same labels but show TSB value alongside.
    if tsb > 15:
        return "fresh"
    if tsb >= 5:
        return "building"
    if tsb >= -10:
        return "balanced"
    if tsb >= -25:
        return "tired"
    return "deep" if language == "technical" else "drained"


def _simple_effort_word(intensity: IntensityLabel) -> str:
    """Lay-friendly word for how hard the session was in simple mode."""
    return {
        "rest": "",
        "easy": "light",
        "moderate": "solid",
        "hard": "hard",
        "big": "huge",
    }[intensity]


def _signed(n: float, decimals: int = 1) -> str:
    """Format number with explicit + or - sign, fixed decimals."""
    if decimals == 0:
        return f"{n:+.0f}"
    return f"{n:+.{decimals}f}"


# ---------------------------------------------------------------------------
# Narrative builder
# ---------------------------------------------------------------------------

def build_pmc_narrative(
    entry: dict,
    prev_entry: dict | None,
    activity: DayActivity | None,
    language: Language,
) -> str:
    """Return a 1-2 sentence per-day summary for the PMC tooltip.

    Args:
        entry: current-day dict with keys {date, ctl, atl, tsb, tss}.
        prev_entry: previous-day dict (same shape) or None for first day.
        activity: summarised activity info for that day, or None for pure rest.
        language: 'simple' or 'technical'.

    Returns:
        A string <= MAX_NARRATIVE_CHARS. Truncated with an ellipsis if the
        template somehow overruns (defensive — templates are designed to fit).
    """
    ctl = float(entry.get("ctl", 0.0))
    atl = float(entry.get("atl", 0.0))
    tsb = float(entry.get("tsb", 0.0))
    tss = float(entry.get("tss", 0.0))

    prev_ctl = float(prev_entry["ctl"]) if prev_entry else ctl
    prev_atl = float(prev_entry["atl"]) if prev_entry else atl
    ctl_delta = round(ctl - prev_ctl, 1)
    atl_delta = round(atl - prev_atl, 1)

    # Default to a rest day if there is no activity record.
    if activity is None:
        intensity: IntensityLabel = "rest"
        duration_min = 0.0
        activity_count = 0
    else:
        intensity = activity.intensity_label
        duration_min = activity.duration_min
        activity_count = activity.activity_count

    d_min = int(round(duration_min))
    tss_per_hour = (tss * 60.0 / duration_min) if duration_min > 0 else 0.0
    form = _form_label(tsb, language)

    if language == "simple":
        body = _simple_template(
            intensity=intensity,
            d_min=d_min,
            ctl_delta=ctl_delta,
            form=form,
        )
    else:
        body = _technical_template(
            intensity=intensity,
            d_min=d_min,
            tss=tss,
            tss_per_hour=tss_per_hour,
            ctl_delta=ctl_delta,
            atl_delta=atl_delta,
            tsb=tsb,
            form=form,
        )

    # Prefix for multi-activity days.
    if activity_count >= 2:
        prefix = "2 sessions — " if language == "simple" else f"({activity_count}x activity) "
        body = prefix + body

    # Defensive truncation — templates are sized to fit but guard anyway.
    if len(body) > MAX_NARRATIVE_CHARS:
        body = body[: MAX_NARRATIVE_CHARS - 1].rstrip() + "…"

    return body


def _simple_template(
    *,
    intensity: IntensityLabel,
    d_min: int,
    ctl_delta: float,
    form: str,
) -> str:
    """Simple-mode templates — never leak FTP/TSS/CTL/ATL/TSB/EF/VI/NP jargon."""
    if intensity == "rest":
        # "Rest day — fitness steady. Form fresh."
        if ctl_delta == 0:
            fitness_phrase = "fitness steady"
        elif ctl_delta > 0:
            fitness_phrase = f"fitness +{ctl_delta:.1f}"
        else:
            fitness_phrase = f"fitness {ctl_delta:.1f}"
        return f"Rest day — {fitness_phrase}. Form {form}."

    delta_str = f"+{ctl_delta:.1f}" if ctl_delta >= 0 else f"{ctl_delta:.1f}"
    effort = _simple_effort_word(intensity)

    if intensity == "easy":
        return f"{d_min} min easy. Fitness {delta_str}. Form {form}."
    if intensity == "moderate":
        return f"{d_min} min {effort} ride. Fitness {delta_str}, still building."
    if intensity == "hard":
        return f"{d_min} min {effort} session — big stimulus today. Fitness {delta_str}."
    # big
    return f"Big day — {d_min} min. Fitness {delta_str} but fatigue stacked. Form {form}."


def _technical_template(
    *,
    intensity: IntensityLabel,
    d_min: int,
    tss: float,
    tss_per_hour: float,
    ctl_delta: float,
    atl_delta: float,
    tsb: float,
    form: str,
) -> str:
    """Technical-mode templates — cite CTL/ATL/TSB and TSS values freely."""
    ctl_s = _signed(ctl_delta)
    atl_s = _signed(atl_delta)
    tsb_s = _signed(tsb)

    if intensity == "rest":
        return f"Rest day (TSS 0). CTL {ctl_s}; TSB {tsb_s} ({form})."
    if intensity == "easy":
        return f"Endurance {d_min}min (TSS {tss:.0f}). CTL {ctl_s}; ATL {atl_s} -> TSB {tsb_s}."
    if intensity == "moderate":
        return (
            f"Tempo/SS {d_min}min (TSS {tss:.0f}, ~{tss_per_hour:.0f} TSS/h). "
            f"CTL {ctl_s}; TSB {tsb_s}."
        )
    if intensity == "hard":
        return (
            f"Threshold/VO2 {d_min}min (TSS {tss:.0f}, ~{tss_per_hour:.0f} TSS/h). "
            f"ATL {atl_s} spike — absorption window."
        )
    # big
    return (
        f"Big TSS day ({tss:.0f}, {d_min}min). CTL {ctl_s}; "
        f"TSB plummets to {tsb_s}. Recovery priority."
    )


# ---------------------------------------------------------------------------
# Activity aggregation (DB helper)
# ---------------------------------------------------------------------------

async def fetch_daily_activity_summaries(
    db: AsyncSession,
    user_id: int,
    since_date: date,
    until_date: date,
) -> dict[date, DayActivity]:
    """Build {date -> DayActivity} for the narrative layer.

    Queries the activities hypertable for the inclusive window, then groups
    per-day:
      - total duration in minutes
      - primary sport (sport of the longest single activity that day)
      - activity count
      - intensity label (from daily total TSS / daily total duration)

    Days with no activities are omitted — the caller treats missing keys as
    rest days.
    """
    # Server-side constants in the WHERE clause; params bind the user_id.
    # started_at is tz-aware; comparing to date boundaries works because
    # PostgreSQL coerces the date to the lower-bound timestamp at the db tz.
    # The upper bound is exclusive of the next day to capture the full day.
    sql = text("""
        SELECT
            date_trunc('day', started_at)::date AS day,
            sport,
            COALESCE(SUM(duration_seconds), 0) AS duration_seconds,
            COALESCE(SUM(tss), 0.0)            AS tss,
            COUNT(*)                            AS activity_count,
            MAX(duration_seconds)              AS longest_activity_seconds
        FROM activities
        WHERE user_id = :user_id
          AND started_at >= :since_ts
          AND started_at <  :until_ts
        GROUP BY 1, 2
        ORDER BY 1, 2
    """)
    since_ts = datetime.combine(since_date, datetime.min.time())
    until_ts = datetime.combine(until_date + timedelta(days=1), datetime.min.time())
    result = await db.execute(
        sql,
        {"user_id": user_id, "since_ts": since_ts, "until_ts": until_ts},
    )
    rows = result.fetchall()

    # Aggregate per-day across sports.
    per_day_duration: dict[date, float] = {}
    per_day_tss: dict[date, float] = {}
    per_day_count: dict[date, int] = {}
    per_day_longest: dict[date, tuple[float, Sport | None]] = {}

    for row in rows:
        day = row.day
        sport_raw = row.sport
        sport: Sport | None = sport_raw if sport_raw in ("cycling", "running", "gym") else None
        duration_sec = float(row.duration_seconds or 0)
        tss_sum = float(row.tss or 0.0)
        count = int(row.activity_count or 0)
        longest_sec = float(row.longest_activity_seconds or 0)

        per_day_duration[day] = per_day_duration.get(day, 0.0) + duration_sec
        per_day_tss[day] = per_day_tss.get(day, 0.0) + tss_sum
        per_day_count[day] = per_day_count.get(day, 0) + count

        prior = per_day_longest.get(day)
        if prior is None or longest_sec > prior[0]:
            per_day_longest[day] = (longest_sec, sport)

    out: dict[date, DayActivity] = {}
    for day, total_sec in per_day_duration.items():
        duration_min = total_sec / 60.0
        daily_tss = per_day_tss.get(day, 0.0)
        intensity = classify_intensity(daily_tss, duration_min)
        primary_sport = per_day_longest.get(day, (0.0, None))[1]
        out[day] = DayActivity(
            duration_min=duration_min,
            primary_sport=primary_sport,
            activity_count=per_day_count.get(day, 0),
            intensity_label=intensity,
        )

    return out


__all__ = [
    "DayActivity",
    "Language",
    "IntensityLabel",
    "MAX_NARRATIVE_CHARS",
    "build_pmc_narrative",
    "classify_intensity",
    "fetch_daily_activity_summaries",
]
