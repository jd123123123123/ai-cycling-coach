"""Weather API — today's hourly forecast at the athlete's riding location.

One endpoint: GET /weather/today. Location is resolved from the athlete's most
recent GPS ride (no profile home-location field exists); the forecast comes
from Open-Meteo via the shared cached client. Honest-absence contract: any
missing piece (no GPS rides yet, upstream failure) returns
``{"available": false}`` and the Today-page nudge simply doesn't render.
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.athlete_profile import AthleteProfile
from app.models.user import User
from app.services.athlete_time import set_athlete_tz_from_profile, athlete_tz
from app.services.weather_client import fetch_today_forecast

router = APIRouter(prefix="/weather", tags=["weather"])

_UNAVAILABLE = {"available": False, "hours": [], "location": None, "timezone": None}


def _expected_longitude(tz_name: str) -> float | None:
    """Rough longitude implied by the athlete's timezone UTC offset
    (lng ≈ offset_hours × 15°). Used only to reject GPS points that can't
    possibly be where the athlete is — e.g. corrupt coordinates from a bad
    Garmin fix. Returns None if the offset can't be resolved."""
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo

    try:
        offset = datetime.now(ZoneInfo(tz_name)).utcoffset()
        if offset is None:
            return None
        return (offset.total_seconds() / 3600.0) * 15.0
    except Exception:
        return None


def _plausible(lat: float, lng: float, expected_lng: float | None) -> bool:
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


async def _last_ride_location(
    db: AsyncSession, user_id: int, tz_name: str | None = None,
) -> tuple[float, float] | None:
    """First PLAUSIBLE GPS point of the athlete's most recent outdoor activities
    (newest first). Any GPS sport counts — a recent outdoor run is a fine proxy
    for "where the athlete is" when their rides were all indoors. Corrupt fixes
    (out-of-range, null-island, or wildly inconsistent with the athlete's
    timezone) are skipped so a bad Garmin point can't put the forecast on the
    other side of the planet."""
    expected_lng = _expected_longitude(tz_name) if tz_name else None
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
                if _plausible(lat, lng, expected_lng):
                    return lat, lng
    return None


@router.get("/today", summary="Hourly forecast for the athlete-local day at the last ride's location")
async def get_today_weather(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    profile = (
        await db.execute(select(AthleteProfile).where(AthleteProfile.user_id == user.id))
    ).scalar_one_or_none()
    set_athlete_tz_from_profile(profile)
    tz_name = str(athlete_tz())

    loc = await _last_ride_location(db, user.id, tz_name)
    if loc is None:
        return _UNAVAILABLE

    body = await fetch_today_forecast(loc[0], loc[1], tz_name)
    if body is None:
        return _UNAVAILABLE

    hourly = body.get("hourly") or {}
    times = hourly.get("time") or []
    temps = hourly.get("temperature_2m") or []
    precs = hourly.get("precipitation_probability") or []
    winds = hourly.get("wind_speed_10m") or []
    wdirs = hourly.get("wind_direction_10m") or []
    codes = hourly.get("weather_code") or []
    hours = [
        {
            "time": times[i],
            "temp_c": temps[i] if i < len(temps) else None,
            "precip_prob": precs[i] if i < len(precs) else None,
            "wind_kmh": winds[i] if i < len(winds) else None,
            "wind_dir_deg": wdirs[i] if i < len(wdirs) else None,
            "code": codes[i] if i < len(codes) else None,
        }
        for i in range(len(times))
    ]
    if not hours:
        return _UNAVAILABLE
    return {
        "available": True,
        "location": {"lat": round(loc[0], 3), "lng": round(loc[1], 3)},
        "timezone": tz_name,
        "hours": hours,
    }
