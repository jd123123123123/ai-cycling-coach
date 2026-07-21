"""Season-trends builder — the data behind GET /analytics/season-trends.

Aggregates four season-long time series that the app already stores but the
Progress surface never had a series for, into monthly buckets for the current
year:

    vo2max         — latest Garmin VO₂max estimate in the month
                     (daily_metric.raw_data, parsed via crew_score._extract_vo2max
                     so the JSON-string tolerance lives in ONE place)
    weight_kg      — mean daily body weight in the month (daily_metric.weight_kg)
    durability_pct — mean aerobic decoupling of the month's rides, lower = holds
                     power deeper (activity_stream.decoupling_pct)
    p20min_w       — best 20-min mean-maximal power in the month
                     (activity_stream.mmp_curve[1200], the best-effort envelope)

Honesty (audit): a metric with no stored data for THIS athlete stays empty —
its summary reads ``n_points == 0`` and every point is ``None``. Nothing is
invented. Buckets span the first month that carries ANY metric through the last,
so the four sparklines share one contiguous x-axis.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.daily_metric import DailyMetric
from app.services.crew_score import _extract_vo2max  # single source of VO₂max parsing

# 20-min mean-maximal power lives at the 1200 s key of the stored MMP curve.
P20_KEY = 1200

_MONTHS = (
    ("Jan", "Jan"), ("Feb", "Feb"), ("Mar", "Mär"), ("Apr", "Apr"),
    ("May", "Mai"), ("Jun", "Jun"), ("Jul", "Jul"), ("Aug", "Aug"),
    ("Sep", "Sep"), ("Oct", "Okt"), ("Nov", "Nov"), ("Dec", "Dez"),
)


# ── Pure assembly ────────────────────────────────────────────────────────────

def build_points(
    year: int,
    vo2_by_month: dict[int, float],
    weight_by_month: dict[int, float],
    durability_by_month: dict[int, float],
    p20_by_month: dict[int, float],
) -> list[dict]:
    """Assemble contiguous monthly buckets. The span runs from the earliest to
    the latest month that carries ANY metric (so the series share one axis); an
    empty athlete yields ``[]``. A metric absent in a month is ``None``."""
    present: set[int] = set()
    for src in (vo2_by_month, weight_by_month, durability_by_month, p20_by_month):
        present.update(src.keys())
    if not present:
        return []
    lo, hi = min(present), max(present)
    points: list[dict] = []
    for mo in range(lo, hi + 1):
        en, de = _MONTHS[mo - 1]
        w = weight_by_month.get(mo)
        p20 = p20_by_month.get(mo)
        points.append({
            "month": f"{year}-{mo:02d}",
            "month_en": en,
            "month_de": de,
            "vo2max": round(vo2_by_month[mo], 1) if mo in vo2_by_month else None,
            "weight_kg": round(w, 1) if w is not None else None,
            "durability_pct": (
                round(durability_by_month[mo], 1) if mo in durability_by_month else None
            ),
            "p20min_w": int(round(p20)) if p20 is not None else None,
        })
    return points


def metric_summary(points: list[dict], key: str, *, lower_is_better: bool = False) -> dict:
    """First-vs-latest non-null read of one metric across the buckets."""
    vals = [(p[key]) for p in points if p.get(key) is not None]
    if not vals:
        return {
            "first": None, "latest": None, "delta": None,
            "n_points": 0, "lower_is_better": lower_is_better,
        }
    first, latest = vals[0], vals[-1]
    delta = round(latest - first, 1)
    # Keep whole numbers whole (p20 W), 1-dp for the rest.
    if key == "p20min_w":
        delta = int(round(latest - first))
    return {
        "first": first,
        "latest": latest,
        "delta": delta,
        "n_points": len(vals),
        "lower_is_better": lower_is_better,
    }


# ── Async composer ───────────────────────────────────────────────────────────

async def compute_season_trends(
    db: AsyncSession, user_id: int, year: int | None = None
) -> dict:
    """Full season-trends view-model for `user_id` over the given calendar year
    (defaults to the current year). RLS-scoped by the caller's db session; every
    query is additionally pinned to `user_id`."""
    if year is None:
        year = date.today().year
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)

    # ── VO₂max — latest Garmin reading per month (raw_data parse reused) ──────
    vo2_rows = await db.execute(
        select(DailyMetric.date, DailyMetric.raw_data)
        .where(
            DailyMetric.user_id == user_id,
            DailyMetric.date >= year_start,
            DailyMetric.date <= year_end,
        )
        .order_by(DailyMetric.date.asc(), DailyMetric.recorded_at.asc())
    )
    vo2_by_month: dict[int, float] = {}
    for d, raw in vo2_rows.all():
        if d is None:
            continue
        v = _extract_vo2max(raw)
        if v is not None:
            vo2_by_month[d.month] = v  # ascending order → keeps the month's latest

    # ── Weight — mean daily weight per month ─────────────────────────────────
    weight_rows = await db.execute(
        select(DailyMetric.date, DailyMetric.weight_kg)
        .where(
            DailyMetric.user_id == user_id,
            DailyMetric.date >= year_start,
            DailyMetric.date <= year_end,
            DailyMetric.weight_kg.isnot(None),
        )
    )
    weight_acc: dict[int, list[float]] = defaultdict(list)
    for d, w in weight_rows.all():
        if d is not None and w is not None:
            weight_acc[d.month].append(float(w))
    weight_by_month = {mo: sum(v) / len(v) for mo, v in weight_acc.items()}

    # ── Rides — decoupling (durability) + best 20-min power per month ────────
    stream_rows = await db.execute(
        select(
            ActivityStream.activity_id,
            ActivityStream.decoupling_pct,
            ActivityStream.mmp_curve,
        ).where(ActivityStream.user_id == user_id)
    )
    streams = stream_rows.all()
    act_ids = [r.activity_id for r in streams]
    started_by_id: dict[int, datetime] = {}
    if act_ids:
        act_res = await db.execute(
            select(Activity.id, Activity.started_at).where(
                Activity.id.in_(act_ids), Activity.sport == "cycling"
            )
        )
        started_by_id = {a.id: a.started_at for a in act_res.all()}

    decouple_acc: dict[int, list[float]] = defaultdict(list)
    p20_by_month: dict[int, float] = {}
    for r in streams:
        started = started_by_id.get(r.activity_id)
        if started is None or started.year != year:
            continue
        mo = started.month
        if r.decoupling_pct is not None:
            decouple_acc[mo].append(float(r.decoupling_pct))
        p20 = (r.mmp_curve or {}).get(str(P20_KEY)) or (r.mmp_curve or {}).get(P20_KEY)
        if p20 is not None:
            try:
                p20f = float(p20)
            except (TypeError, ValueError):
                p20f = None
            if p20f and p20f > 0:
                cur = p20_by_month.get(mo)
                p20_by_month[mo] = p20f if cur is None else max(cur, p20f)
    durability_by_month = {mo: sum(v) / len(v) for mo, v in decouple_acc.items()}

    points = build_points(
        year, vo2_by_month, weight_by_month, durability_by_month, p20_by_month
    )

    return {
        "available": bool(points),
        "year": year,
        "points": points,
        "vo2max": metric_summary(points, "vo2max"),
        "weight_kg": metric_summary(points, "weight_kg", lower_is_better=True),
        "durability_pct": metric_summary(points, "durability_pct", lower_is_better=True),
        "p20min_w": metric_summary(points, "p20min_w"),
    }
