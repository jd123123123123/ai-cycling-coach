"""W′-balance trace — the "anaerobic battery" draining/refilling across a ride.

Picks the athlete's most-depleting recent ride and returns a downsampled
W′-balance trajectory for charting. Built on `w_balance.w_prime_balance` + the
per-ride CP/W′ stored on `activity_streams`.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.services.w_balance import w_prime_balance

TRACE_POINTS = 150


def downsample(series: list[float], max_points: int) -> list[tuple[int, float]]:
    """Evenly sample a series to ~max_points, always keeping the endpoints and
    the global minimum (the deepest point of the trace must never be smoothed
    away — it's the headline of the chart)."""
    n = len(series)
    if n == 0:
        return []
    if n <= max_points:
        return [(i, series[i]) for i in range(n)]

    step = n / max_points
    keep = {0, n - 1}
    keep.add(min(range(n), key=lambda i: series[i]))  # global min
    for k in range(max_points):
        keep.add(int(k * step))
    return [(i, series[i]) for i in sorted(keep)]


async def compute_wbal_trace(db: AsyncSession, user_id: int) -> dict | None:
    """The most-depleting ride's W′-balance trace, downsampled for the UI."""
    res = await db.execute(
        select(
            ActivityStream.activity_id,
            ActivityStream.streams,
            ActivityStream.cp_watts,
            ActivityStream.w_prime_j,
        ).where(
            ActivityStream.user_id == user_id,
            ActivityStream.cp_watts.isnot(None),
            ActivityStream.w_prime_j.isnot(None),
        )
    )
    rows = res.all()

    best = None  # (min_bal, activity_id, series, cp, w_prime)
    for r in rows:
        if not r.w_prime_j or r.w_prime_j <= 0:
            continue
        power = (r.streams or {}).get("power") or []
        if not power:
            continue
        series = w_prime_balance(power, r.cp_watts, r.w_prime_j)
        if not series:
            continue
        lo = min(series)
        if best is None or lo < best[0]:
            best = (lo, r.activity_id, series, r.cp_watts, r.w_prime_j)

    if best is None:
        return None

    min_bal, activity_id, series, cp, w_prime = best
    sampled = downsample(series, TRACE_POINTS)

    act_res = await db.execute(
        select(Activity.started_at, Activity.title).where(Activity.id == activity_id)
    )
    meta = act_res.first()

    return {
        "available": True,
        "activity_id": activity_id,
        "title": meta.title if meta else None,
        "date": meta.started_at.date().isoformat() if meta and meta.started_at else None,
        "cp_watts": cp,
        "w_prime_j": w_prime,
        "min_kj": round(min_bal / 1000.0, 2),
        "depleted": min_bal < 0,
        "duration_s": len(series),
        # Trace as % of full W′ at each sampled second (0–100, can dip < 0).
        "trace": [{"t": i, "pct": round(v / w_prime * 100.0, 1), "kj": round(v / 1000.0, 2)} for i, v in sampled],
    }
