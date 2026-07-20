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


async def _last_ride_location(db: AsyncSession, user_id: int) -> tuple[float, float] | None:
    """First valid GPS point of the athlete's most recent rides (newest first)."""
    rows = (
        await db.execute(
            select(ActivityStream.streams)
            .join(Activity, Activity.id == ActivityStream.activity_id)
            .where(Activity.user_id == user_id, Activity.sport == "cycling")
            .order_by(Activity.started_at.desc())
            .limit(8)
        )
    ).scalars().all()
    for streams in rows:
        if not isinstance(streams, dict):
            continue
        lats = streams.get("latitude") or []
        lngs = streams.get("longitude") or []
        for la, ln in zip(lats, lngs):
            if la is not None and ln is not None:
                return float(la), float(ln)
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

    loc = await _last_ride_location(db, user.id)
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
