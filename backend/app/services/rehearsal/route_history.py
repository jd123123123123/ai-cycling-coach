"""You, against this route, before. The one card here made of measurements.

Every other number on the forecast page is a claim about a ride that has not
happened. This one is a record of rides that did, and that difference is the
whole reason it earns its space: a forecast of 3:24 means something quite
different sitting next to "you rode 3:36 here in March" than it does alone.

MATCHING is the hard part, and it is where this could quietly lie. Two rides
are treated as the same route only when their distance AND their climbing both
land inside a tolerance. Distance alone is not enough — a 82 km valley spin and
a 82 km alpine loop are not comparable rides, and reporting the flat one as a
previous attempt would make the forecast look catastrophically slow for no
reason. Requiring both is why the tolerances can stay generous enough to
survive GPS drift and a slightly different start point.

Rides are never fabricated into a trend. Under `MIN_ATTEMPTS` the module
returns the attempts it found and says how few there are, rather than drawing a
line through two points.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity

#: Both must hold for a ride to count as the same route.
DISTANCE_TOL_PCT = 8.0
ASCENT_TOL_PCT = 20.0
#: Climbing is noisier than distance (barometric vs GPS elevation), so its
#: tolerance is wider — but an absolute floor stops a flat ride matching a
#: hilly one purely because 20% of a small number is small.
ASCENT_TOL_FLOOR_M = 150.0

#: How far back to look. Beyond two years a comparison says more about who the
#: rider used to be than about this Saturday.
MAX_AGE_DAYS = 730
MAX_ATTEMPTS = 6
#: Below this, attempts are listed but no trend is claimed.
MIN_ATTEMPTS = 2


@dataclass(frozen=True)
class Attempt:
    activity_id: int
    when: date
    duration_s: float
    distance_m: float
    ascent_m: float | None
    avg_power_w: float | None


def matches_route(
    *,
    ride_distance_m: float | None,
    ride_ascent_m: float | None,
    route_distance_m: float,
    route_ascent_m: float,
) -> bool:
    """Is this recorded ride the same route? Both axes must agree.

    Distance alone would pair an 82 km valley spin with an 82 km alpine loop and
    then report the flat one as a previous attempt, making the forecast look
    absurdly slow. Requiring climbing to agree as well is what lets the distance
    tolerance stay wide enough to survive real GPS variation.
    """
    if not ride_distance_m or route_distance_m <= 0:
        return False
    d_gap = abs(ride_distance_m - route_distance_m) / route_distance_m * 100.0
    if d_gap > DISTANCE_TOL_PCT:
        return False

    if route_ascent_m > 0:
        if ride_ascent_m is None:
            # No elevation on the recorded ride: distance alone is not enough
            # to claim it was the same road.
            return False
        tol = max(ASCENT_TOL_FLOOR_M, route_ascent_m * ASCENT_TOL_PCT / 100.0)
        if abs(ride_ascent_m - route_ascent_m) > tol:
            return False
    return True


async def past_attempts(
    db: AsyncSession,
    user_id: int,
    *,
    route_distance_m: float,
    route_ascent_m: float,
    today: date | None = None,
) -> list[Attempt]:
    """The athlete's own rides on this route, newest first. Never raises."""
    today = today or date.today()
    try:
        res = await db.execute(
            select(Activity)
            .where(Activity.user_id == user_id)
            .order_by(Activity.started_at.desc())
            .limit(400)
        )
        rows = list(res.scalars().all())
    except Exception:  # pragma: no cover -- a rehearsal must survive this
        return []

    out: list[Attempt] = []
    for a in rows:
        started = getattr(a, "started_at", None)
        if not isinstance(started, datetime):
            continue
        when = started.date()
        if (today - when).days > MAX_AGE_DAYS or (today - when).days < 0:
            continue
        if not getattr(a, "duration_seconds", None):
            continue
        if not matches_route(
            ride_distance_m=getattr(a, "distance_meters", None),
            ride_ascent_m=getattr(a, "elevation_gain_m", None),
            route_distance_m=route_distance_m,
            route_ascent_m=route_ascent_m,
        ):
            continue
        out.append(
            Attempt(
                activity_id=int(a.id),
                when=when,
                duration_s=float(a.duration_seconds),
                distance_m=float(a.distance_meters or 0.0),
                ascent_m=float(a.elevation_gain_m) if a.elevation_gain_m else None,
                avg_power_w=float(a.average_power) if a.average_power else None,
            )
        )
        if len(out) >= MAX_ATTEMPTS:
            break
    return out


def summarize(attempts: list[Attempt], forecast_s: float | None) -> dict | None:
    """Attempts, the athlete's best, and how the forecast sits against it.

    `best_s` doubles as the PR target elsewhere on the page, which is why it is
    computed here rather than in two places that could disagree.
    """
    if not attempts:
        return None
    best = min(a.duration_s for a in attempts)
    delta = (forecast_s - best) if forecast_s else None
    return {
        "attempts": [
            {
                "activity_id": a.activity_id,
                "date": a.when.isoformat(),
                "duration_s": a.duration_s,
                "avg_power_w": a.avg_power_w,
            }
            for a in attempts
        ],
        "best_s": best,
        "forecast_vs_best_s": round(delta) if delta is not None else None,
        "count": len(attempts),
        #: False when there are too few rides to talk about a direction of
        #: travel. The surface lists them without drawing a trend.
        "trend_is_meaningful": len(attempts) >= MIN_ATTEMPTS,
    }
