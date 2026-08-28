"""The database half of "who did I ride with" — kept apart from the maths.

`ride_together` is pure and stays that way: it is the part built on GPS noise
and clock skew, so it has to be testable without a database. This module is the
boring half that fetches what it needs, and it exists separately so that the
part which is easy to get subtly wrong is the part with no I/O in it.

THE PRIVACY BOUNDARY LIVES HERE, and it is the reason this is not a generic
"find nearby rides" query. Matching a ride means reading somebody else's GPS
track second by second, which is among the most sensitive things this app
stores. It is therefore scoped to people the rider already shares a crew with —
who have opted into being visible to each other — and to the ride's own day.
Nobody outside that circle is ever compared, and a rider with no crew simply
gets no companions rather than a query against the whole table.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.crew import CrewMembership
from app.services.ride_together import Overlap, Track, find_companions

#: How far either side of the ride to look for a companion's activity. Wide
#: enough for a mate who set off an hour earlier and was still out when this
#: rider joined, narrow enough that a day's worth of rides is not dragged in.
WINDOW_H = 6


async def _crew_peers(db: AsyncSession, user_id: int) -> list[int]:
    """Everyone who shares a crew with this rider. Empty when they have none."""
    mine = (
        await db.execute(
            select(CrewMembership.crew_id).where(CrewMembership.user_id == user_id)
        )
    ).scalars().all()
    if not mine:
        return []
    rows = (
        await db.execute(
            select(CrewMembership.user_id)
            .where(CrewMembership.crew_id.in_(mine))
            .where(CrewMembership.user_id != user_id)
        )
    ).scalars().all()
    return list(dict.fromkeys(rows))


async def _track(db: AsyncSession, activity: Activity) -> Track | None:
    """One activity as a `Track`, or None when it carries no usable GPS.

    A turbo session, a treadmill run and a ride whose watch lost signal all land
    here as None, and all three are ordinary rather than exceptional — this runs
    on every ride, most of which have a companion of nobody.
    """
    row = (
        await db.execute(
            select(ActivityStream).where(ActivityStream.activity_id == activity.id)
        )
    ).scalar_one_or_none()
    if row is None or not row.streams:
        return None
    lat = row.streams.get("latitude")
    lng = row.streams.get("longitude")
    if not lat or not lng:
        return None
    return Track(
        activity_id=activity.id, user_id=activity.user_id,
        started_at=activity.started_at, lat=list(lat), lng=list(lng),
    )


async def companions_for(
    db: AsyncSession, activity: Activity,
) -> list[Overlap]:
    """Who this rider actually rode with. Empty for the overwhelming majority of
    rides, which is the expected answer and not a failure."""
    peers = await _crew_peers(db, activity.user_id)
    if not peers:
        return []
    mine = await _track(db, activity)
    if mine is None:
        return []

    lo = activity.started_at - timedelta(hours=WINDOW_H)
    hi = activity.started_at + timedelta(hours=WINDOW_H)
    rows = (
        await db.execute(
            select(Activity)
            .where(Activity.user_id.in_(peers))
            .where(Activity.started_at >= lo)
            .where(Activity.started_at <= hi)
            .where(Activity.sport == "cycling")
        )
    ).scalars().all()

    tracks = [t for a in rows if (t := await _track(db, a)) is not None]
    return find_companions(mine, tracks)
