"""Where is the athlete right now? — resolved from their own ride data.

Extracted verbatim from ``app/api/weather.py``, which grew this logic first and
now delegates to it: the workshop finder needs the exact same answer ("the last
plausible GPS point this athlete recorded") whenever the browser won't hand
over a live position. One implementation, two callers.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream


def expected_longitude(tz_name: str) -> float | None:
    """Rough longitude implied by the athlete's timezone UTC offset
    (lng ≈ offset_hours × 15°). Used only to reject GPS points that can't
    possibly be where the athlete is — e.g. corrupt coordinates from a bad
    Garmin fix. Returns None if the offset can't be resolved."""
    try:
        offset = datetime.now(ZoneInfo(tz_name)).utcoffset()
        if offset is None:
            return None
        return (offset.total_seconds() / 3600.0) * 15.0
    except Exception:
        return None


def plausible(lat: float, lng: float, expected_lng: float | None) -> bool:
    """A GPS point is plausible when it's in range AND (if we know the athlete's
    timezone) not wildly inconsistent with it. A Berlin athlete (tz lng ~30°)
    whose ride reports lng 167° is corrupt data, not a trip to the Pacific."""
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return False
    if lat == 0.0 and lng == 0.0:  # null-island — classic bad fix
        return False
    if expected_lng is None:
        return True
    # Wrap-aware longitude distance; ±60° tolerates travel + tz-band slop.
    d = abs(lng - expected_lng) % 360.0
    if d > 180.0:
        d = 360.0 - d
    return d <= 60.0


async def last_ride_location(
    db: AsyncSession, user_id: int, tz_name: str | None = None,
) -> tuple[float, float] | None:
    """First PLAUSIBLE GPS point of the athlete's most recent outdoor activities
    (newest first). Any GPS sport counts — a recent outdoor run is a fine proxy
    for "where the athlete is" when their rides were all indoors. Corrupt fixes
    (out-of-range, null-island, or wildly inconsistent with the athlete's
    timezone) are skipped so a bad Garmin point can't put the forecast on the
    other side of the planet."""
    expected_lng = expected_longitude(tz_name) if tz_name else None
    rows = (
        await db.execute(
            select(ActivityStream.streams)
            .join(Activity, Activity.id == ActivityStream.activity_id)
            .where(Activity.user_id == user_id)
            .order_by(Activity.started_at.desc())
            .limit(20)
        )
    ).scalars().all()
    for streams in rows:
        if not isinstance(streams, dict):
            continue
        lats = streams.get("latitude") or []
        lngs = streams.get("longitude") or []
        for la, ln in zip(lats, lngs):
            if la is not None and ln is not None:
                lat, lng = float(la), float(ln)
                if plausible(lat, lng, expected_lng):
                    return lat, lng
    return None
