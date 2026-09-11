"""Weather API — today's hourly forecast at the athlete's riding location.

One endpoint: GET /weather/today. Location is resolved from the athlete's most
recent GPS ride (no profile home-location field exists); the forecast comes
from Open-Meteo via the shared cached client. Honest-absence contract: any
missing piece (no GPS rides yet, upstream failure) returns
``{"available": false}`` and the Today-page nudge simply doesn't render.
"""
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.athlete_profile import AthleteProfile
from app.models.user import User
from app.services.athlete_time import set_athlete_tz_from_profile, athlete_tz
from app.services.rider_location import (
    expected_longitude,
    last_ride_location,
    plausible,
)
from app.services.weather_client import fetch_today_forecast

router = APIRouter(prefix="/weather", tags=["weather"])

_UNAVAILABLE = {"available": False, "hours": [], "location": None, "timezone": None}


# The three helpers below used to live here; they now live in
# app/services/rider_location.py so the workshop finder can reuse the exact same
# "where is this athlete" answer. Re-exported under their original private names
# because this module's tests (and only they) import them from here.
_expected_longitude = expected_longitude
_plausible = plausible
_last_ride_location = last_ride_location


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

    return await _forecast_at(loc, tz_name)


async def _forecast_at(loc: tuple[float, float], tz_name: str) -> dict:
    body = await fetch_today_forecast(loc[0], loc[1], tz_name)
    if body is None:
        return _UNAVAILABLE

    hourly = body.get("hourly") or {}
    times = hourly.get("time") or []
    temps = hourly.get("temperature_2m") or []
    precs = hourly.get("precipitation_probability") or []
    winds = hourly.get("wind_speed_10m") or []
    wdirs = hourly.get("wind_direction_10m") or []
    gusts = hourly.get("wind_gusts_10m") or []
    daylight = hourly.get("is_day") or []
    codes = hourly.get("weather_code") or []
    hours = [
        {
            "time": times[i],
            "temp_c": temps[i] if i < len(temps) else None,
            "precip_prob": precs[i] if i < len(precs) else None,
            "wind_kmh": winds[i] if i < len(winds) else None,
            "wind_dir_deg": wdirs[i] if i < len(wdirs) else None,
            "wind_gust_kmh": gusts[i] if i < len(gusts) else None,
            "is_day": bool(daylight[i]) if i < len(daylight) and daylight[i] is not None else None,
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


class WeatherPosition(BaseModel):
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    timezone: str = Field(max_length=80)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Unknown timezone")
        return value


@router.post("/here", summary="Today's forecast at the device's current location")
async def get_weather_here(
    position: WeatherPosition,
    user: Annotated[User, Depends(get_current_active_user)],
) -> dict:
    # Weather needs an area, not an exact GPS fix. Never store device positions.
    loc = (round(position.lat, 2), round(position.lng, 2))
    result = await _forecast_at(loc, position.timezone)
    return {**result, "location_source": "device"}
