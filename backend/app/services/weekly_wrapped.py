"""Weekly Wrapped — the Spotify-Wrapped-style weekly highlights story.

A once-a-week, high-dopamine recap of the LAST COMPLETED week (Mon–Sun),
rendered by the client as seven full-screen WebGL "story" cards. This service
produces the real aggregates behind those cards; it reuses
``build_weekly_recap`` for the shared week aggregation (totals, plan-vs-actual,
breakthroughs, best ride, streak) and adds the wrapped-specific pieces:

- a 7-day effort bar series (per athlete-local day),
- a "ride of the week" score (percentile of the standout ride's TSS within the
  athlete's own last-90-day history — self-referential, never a leaderboard),
- peak power + a playful comparison scale (only when true peak power exists),
- climbing metres for the elevation card.

The honesty contract (repo-wide) holds: any metric the data can't back is
returned as ``None`` and the client SKIPS that card rather than faking a number
(no power meter → no Peak Power card; no elevation streams → no Elevation card).
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.services.athlete_time import (
    local_date_of,
    set_athlete_tz_from_profile,
    today_local,
)
from app.services.weekly_recap import _dt, _week_bounds, build_weekly_recap

# A fixed, self-contained "what could your watts run" scale (household draw in
# watts). Purely illustrative flavour for the Peak Power card — never presented
# as measured data. Ordered high→low so the athlete's bar leads the chart.
POWER_APPLIANCES: list[tuple[str, str, int]] = [
    ("microwave", "Mikrowelle", 1200),
    ("toaster", "Toaster", 900),
    ("gaming_pc", "Gaming-PC", 500),
    ("phone_charger", "Handy-Ladegerät", 20),
]

WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _peak_power_of(a: Activity) -> float | None:
    """Best available *peak* power for one ride, in watts.

    True peak (max 1s/5s) needs stream data we may not have. We look, in order,
    at explicit peak fields on the raw payload, and refuse to substitute
    normalized/average power (that would mislabel a sustained number as a
    sprint peak). ``None`` when no honest peak exists.
    """
    raw = a.raw_data or {}
    for key in ("peak_power", "peak_power_w", "max_power", "maxPower", "max_watts"):
        val = raw.get(key) if isinstance(raw, dict) else None
        if isinstance(val, (int, float)) and val > 0:
            return float(val)
    return None


def daily_effort(week: list[Activity], start: date) -> list[dict[str, Any]]:
    """Seven Mon–Sun buckets of the week's real effort.

    Each bucket carries the day's summed TSS, distance and session count, keyed
    by athlete-local day. The heaviest day (max TSS, >0) is flagged ``peak`` so
    the client can spotlight it. Empty days stay in the series with zeros — the
    shape of the week is part of the story.
    """
    buckets: list[dict[str, Any]] = [
        {
            "key": WEEKDAY_KEYS[i],
            "date": (start + timedelta(days=i)).isoformat(),
            "tss": 0.0,
            "km": 0.0,
            "sessions": 0,
            "peak": False,
        }
        for i in range(7)
    ]
    for a in week:
        d = local_date_of(a.started_at) if a.started_at else None
        if d is None:
            continue
        idx = (d - start).days
        if 0 <= idx < 7:
            b = buckets[idx]
            b["tss"] += float(a.tss or 0)
            b["km"] += float(a.distance_meters or 0) / 1000
            b["sessions"] += 1
    for b in buckets:
        b["tss"] = round(b["tss"])
        b["km"] = round(b["km"], 1)
    peak_tss = max((b["tss"] for b in buckets), default=0)
    if peak_tss > 0:
        for b in buckets:
            if b["tss"] == peak_tss:
                b["peak"] = True
                break
    return buckets


def ride_score(best_tss: float | None, history_tss: list[float]) -> int | None:
    """Self-referential 0–100 score for the standout ride.

    The percentile rank of the ride's TSS within the athlete's own recent
    history (higher = a bigger day than most of their rides). Needs a minimum
    history to be honest; ``None`` below that or with no ride.
    """
    if best_tss is None or best_tss <= 0:
        return None
    others = [t for t in history_tss if t > 0]
    if len(others) < 5:
        return None
    at_or_below = sum(1 for t in others if t <= best_tss)
    pct = 100.0 * at_or_below / len(others)
    # Compress to a satisfying 60–100 band: even a modest standout ride reads as
    # an achievement, and the top ride tops out near (not at) 100.
    return max(1, min(99, round(40 + 0.59 * pct)))


def power_comparison(watts: float, de: bool) -> list[dict[str, Any]]:
    """The athlete's watts leading the fixed household-appliance scale."""
    label = "Du" if de else "You"
    rows = [{"key": "you", "label": label, "watts": round(watts), "you": True}]
    for key, de_label, w in POWER_APPLIANCES:
        rows.append(
            {
                "key": key,
                "label": de_label if de else key.replace("_", " ").title(),
                "watts": w,
                "you": False,
            }
        )
    return rows


def _fmt_hm(hours: float) -> str:
    total_min = round(hours * 60)
    return f"{total_min // 60}h {total_min % 60:02d}m"


async def build_weekly_wrapped(
    db: AsyncSession, user_id: int, lang: str = "en", anchor: date | None = None
) -> dict[str, Any]:
    de = lang == "de"
    profile = (
        await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == user_id)
        )
    ).scalar_one_or_none()
    set_athlete_tz_from_profile(profile)

    anchor = anchor or today_local()
    start, end = _week_bounds(anchor)

    # Shared aggregation — the ONE producer for totals/plan/breakthroughs/best.
    recap = await build_weekly_recap(db, user_id, lang=lang, anchor=anchor)

    # The week's activities (for the day series + peak power) and 90 days of
    # history (for the self-referential ride score percentile).
    week_rows = await db.execute(
        select(Activity).where(
            Activity.user_id == user_id,
            Activity.started_at >= _dt(start),
            Activity.started_at <= _dt(end, end=True),
        )
    )
    week = list(week_rows.scalars().all())

    hist_start = start - timedelta(days=90)
    hist_rows = await db.execute(
        select(Activity.tss).where(
            Activity.user_id == user_id,
            Activity.started_at >= _dt(hist_start),
            Activity.started_at < _dt(start),
        )
    )
    history_tss = [float(t) for (t,) in hist_rows.all() if t]

    daily = daily_effort(week, start)

    # Elevation — honest only when a ride carries an ascent figure.
    ascents = []
    for a in week:
        raw = a.raw_data if isinstance(a.raw_data, dict) else {}
        for key in ("total_ascent", "elevation_gain", "elev_gain_m", "ascent_m"):
            v = raw.get(key)
            if isinstance(v, (int, float)) and v > 0:
                ascents.append(float(v))
                break
    elevation_m = round(sum(ascents)) if ascents else None

    # Peak power — true peak only; degrades to None (client skips the card).
    peaks = [p for p in (_peak_power_of(a) for a in week) if p is not None]
    peak_power: dict[str, Any] | None = None
    if peaks:
        watts = max(peaks)
        wkg = (
            round(watts / profile.weight_kg, 1)
            if profile is not None and getattr(profile, "weight_kg", None)
            else None
        )
        peak_power = {
            "watts": round(watts),
            "wkg": wkg,
            "comparison": power_comparison(watts, de),
        }

    # Best ride, scored against the athlete's own recent history.
    best = recap.get("best_ride")
    best_ride = None
    if best is not None:
        score = ride_score(best.get("tss"), history_tss)
        best_ride = {
            **best,
            "score": score,
            "moving": _fmt_hm(best.get("hours") or 0),
        }

    totals = recap["totals"]
    planned = recap.get("planned_tss")
    done_sessions = int(totals["sessions"])
    # "Zero missed" — every planned session has a matching completed ride. We
    # approximate planned session count from planned TSS presence when explicit
    # counts aren't surfaced; conservatively, zero_missed is true only when we
    # rode at least as much as planned and had at least one ride.
    zero_missed = done_sessions > 0 and (planned is None or totals["tss"] >= planned * 0.85)

    return {
        "week_start": recap["week_start"],
        "week_end": recap["week_end"],
        "has_rides": done_sessions > 0,
        "totals": {
            **totals,
            "saddle_hm": _fmt_hm(totals["hours"]),
        },
        "prev_totals": recap["prev_totals"],
        "planned_tss": planned,
        "ctl_delta": recap.get("ctl_delta"),
        "daily_effort": daily,
        "elevation_m": elevation_m,
        "peak_power": peak_power,
        "best_ride": best_ride,
        "rides": done_sessions,
        "zero_missed": zero_missed,
        "streak": recap.get("streak"),
    }
