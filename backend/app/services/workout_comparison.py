"""Same-workout progression — pure scoring core + DB entry points.

The top of this module is DB-free and deterministic (unit-tested in isolation):
title normalization, per-rep metric extraction, trend math, headline selection,
and grouping. The two `*_workout_*` coroutines at the bottom are the only
DB-touching entry points.
"""
from __future__ import annotations

import re
from collections import Counter

from app.schemas.workout_progression import (
    Headline, WorkoutGroupDetail, WorkoutGroupSummary, WorkoutRep, WorkoutTrend,
)

_PLATFORM_PREFIX = re.compile(
    r"^(zwift|rouvy|wahoo|trainerroad|mywhoosh|indievelo|peloton)\s*-\s*", re.IGNORECASE
)
_TRAILING_COUNTER = re.compile(r"\s*\(\d+\)\s*$")


def normalize_title(title: str | None) -> str | None:
    """Grouping key: lowercase, collapse whitespace, strip a leading platform
    prefix and a trailing ' (n)' counter. None/blank → None (ungroupable)."""
    if not title or not title.strip():
        return None
    t = " ".join(title.strip().split()).lower()
    t = _PLATFORM_PREFIX.sub("", t)
    t = _TRAILING_COUNTER.sub("", t)
    t = t.strip()
    return t or None


def _efficiency_factor(np: float | None, avg_power: float | None, avg_hr: int | None) -> float | None:
    p = np if np else avg_power
    if not p or not avg_hr or avg_hr <= 0:
        return None
    return round(p / avg_hr, 3)


def _pace_s_per_km(duration_s: int | None, distance_m: float | None) -> float | None:
    if not duration_s or not distance_m or distance_m <= 0:
        return None
    return round(duration_s / (distance_m / 1000.0), 1)


def rep_from_activity(act) -> WorkoutRep:
    return WorkoutRep(
        activity_id=act.id,
        date=act.started_at.date().isoformat(),
        duration_s=act.duration_seconds,
        distance_m=act.distance_meters,
        tss=act.tss,
        avg_power=act.average_power,
        normalized_power=act.normalized_power,
        avg_hr=act.average_hr,
        max_hr=act.max_hr,
        efficiency_factor=_efficiency_factor(act.normalized_power, act.average_power, act.average_hr),
        pace_s_per_km=_pace_s_per_km(act.duration_seconds, act.distance_meters),
    )


def build_trend(metric: str, values: list, improving_up: bool) -> WorkoutTrend:
    vals = [float(v) for v in values if v is not None]
    if len(vals) < 2:
        return WorkoutTrend(
            metric=metric, series=vals,
            first=(vals[0] if vals else None), last=(vals[-1] if vals else None),
        )
    first, last = vals[0], vals[-1]
    delta = round(last - first, 3)
    pct = round(delta / first * 100, 1) if first else None
    improving = (delta > 0) if improving_up else (delta < 0)
    return WorkoutTrend(metric=metric, series=vals, first=first, last=last,
                        delta=delta, pct=pct, improving=improving)


def _trends_for(reps: list[WorkoutRep]) -> list[WorkoutTrend]:
    specs = [
        ("efficiency", [r.efficiency_factor for r in reps], True),
        ("avg_power", [r.avg_power for r in reps], True),
        ("np", [r.normalized_power for r in reps], True),
        ("avg_hr", [r.avg_hr for r in reps], False),
        ("pace", [r.pace_s_per_km for r in reps], False),
        ("tss", [r.tss for r in reps], True),
    ]
    return [build_trend(m, vals, up) for (m, vals, up) in specs]


def _fmt_pace(s: float) -> str:
    m, sec = divmod(int(round(s)), 60)
    return f"{m}:{sec:02d}"


def pick_headline(trends: list[WorkoutTrend], count: int) -> Headline:
    by = {t.metric: t for t in trends}
    eff = by.get("efficiency")
    if eff and eff.pct is not None and eff.improving is not None:
        return Headline(text=f"Efficiency {eff.pct:+.0f}%", tone="good" if eff.improving else "bad")
    pw = next((by[m] for m in ("avg_power", "np") if by.get(m) and by[m].delta is not None), None)
    if pw and pw.first is not None and pw.improving is not None:
        return Headline(text=f"Avg power {pw.first:.0f}→{pw.last:.0f} W",
                        tone="good" if pw.improving else "bad")
    pace = by.get("pace")
    if pace and pace.first is not None and pace.improving is not None:
        return Headline(text=f"Pace {_fmt_pace(pace.first)}→{_fmt_pace(pace.last)} /km",
                        tone="good" if pace.improving else "bad")
    return Headline(text=f"{count}× logged", tone="neutral")


def group_activities(acts: list) -> dict[str, list]:
    groups: dict[str, list] = {}
    for a in acts:
        k = normalize_title(a.title)
        if k is None:
            continue
        groups.setdefault(k, []).append(a)
    return groups


def _title_and_sport(acts: list) -> tuple[str, str]:
    titles = Counter(a.title for a in acts if a.title)
    sports = Counter(a.sport for a in acts if a.sport)
    title = titles.most_common(1)[0][0] if titles else "untitled"
    sport = sports.most_common(1)[0][0] if sports else "unknown"
    return title, sport


def build_group_summary(key: str, acts: list) -> WorkoutGroupSummary:
    acts_sorted = sorted(acts, key=lambda a: a.started_at)
    reps = [rep_from_activity(a) for a in acts_sorted]
    trends = _trends_for(reps)
    title, sport = _title_and_sport(acts_sorted)
    return WorkoutGroupSummary(
        key=key, title=title, sport=sport, count=len(acts_sorted),
        first_date=acts_sorted[0].started_at.date().isoformat(),
        last_date=acts_sorted[-1].started_at.date().isoformat(),
        headline=pick_headline(trends, len(acts_sorted)),
    )


def build_group_detail(key: str, acts: list) -> WorkoutGroupDetail:
    acts_sorted = sorted(acts, key=lambda a: a.started_at)
    reps = [rep_from_activity(a) for a in acts_sorted]
    title, sport = _title_and_sport(acts_sorted)
    return WorkoutGroupDetail(key=key, title=title, sport=sport,
                              reps=reps, trends=_trends_for(reps))


# ── DB entry points (Task 2 adds the API that calls these) ────────────────────

async def list_workout_groups(db, user_id: int) -> list[WorkoutGroupSummary]:
    from sqlalchemy import select
    from app.models.activity import Activity

    result = await db.execute(
        select(Activity).where(Activity.user_id == user_id).order_by(Activity.started_at)
    )
    acts = list(result.scalars())
    summaries = [build_group_summary(k, v) for k, v in group_activities(acts).items() if len(v) >= 2]
    summaries.sort(key=lambda s: (s.count, s.last_date), reverse=True)
    return summaries


async def get_workout_group(db, user_id: int, key: str) -> WorkoutGroupDetail | None:
    from sqlalchemy import select
    from app.models.activity import Activity

    result = await db.execute(
        select(Activity).where(Activity.user_id == user_id).order_by(Activity.started_at)
    )
    acts = list(result.scalars())
    match = group_activities(acts).get(key)
    if not match or len(match) < 2:
        return None
    return build_group_detail(key, match)
