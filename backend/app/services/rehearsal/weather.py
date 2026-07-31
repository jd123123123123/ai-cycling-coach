"""Forecast wind resolved onto the road, and air density from temperature.

Weather applies ONLY to a dated route inside the forecast horizon. Past that,
it is omitted and the surface says so — silently substituting climate averages
would be exactly the confident-but-wrong number the strategy doc warns about.

Meteorological convention: wind direction is the direction the wind comes FROM.
A rider heading north into a northerly has a full headwind; the same wind is a
tailwind heading south and costs nothing across.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.route_source import RehearsalRoute

FORECAST_HORIZON_DAYS = 10

_R_SPECIFIC = 287.05      # J/(kg·K), dry air
_P0 = 101325.0            # Pa at sea level
_LAPSE = 0.0065           # K/m
_T0_K = 288.15            # K


@dataclass(frozen=True)
class WeatherOnRoute:
    headwind_ms: list[float]
    air_density: list[float]
    wind_speed_ms: float
    wind_from_deg: float
    temperature_c: float


def weather_applies(route: RehearsalRoute, today: date) -> bool:
    """True only for a dated route inside the forecast horizon."""
    if route.ride_date is None:
        return False
    delta = (route.ride_date - today).days
    return 0 <= delta <= FORECAST_HORIZON_DAYS


def headwind_for_segments(
    segments: list[Segment], wind_speed_ms: float, wind_from_deg: float
) -> list[float]:
    """Headwind component along each segment. Positive = headwind."""
    out: list[float] = []
    for seg in segments:
        # Angle between the direction of travel and the direction the wind
        # blows FROM. Zero → riding straight into it.
        delta = math.radians(wind_from_deg - seg.bearing_deg)
        out.append(wind_speed_ms * math.cos(delta))
    return out


def air_density_for_segments(
    segments: list[Segment], temperature_c: float
) -> list[float]:
    """ρ per segment from the barometric formula at that segment's elevation."""
    out: list[float] = []
    for seg in segments:
        h = max(0.0, seg.elevation_m)
        t_k = _T0_K - _LAPSE * h
        pressure = _P0 * (t_k / _T0_K) ** 5.2561
        # Use the forecast temperature, lapsed to this elevation.
        local_t_k = (temperature_c + 273.15) - _LAPSE * h
        out.append(pressure / (_R_SPECIFIC * max(200.0, local_t_k)))
    return out


def build_weather_on_route(
    segments: list[Segment],
    *,
    wind_speed_ms: float,
    wind_from_deg: float,
    temperature_c: float,
) -> WeatherOnRoute:
    return WeatherOnRoute(
        headwind_ms=headwind_for_segments(segments, wind_speed_ms, wind_from_deg),
        air_density=air_density_for_segments(segments, temperature_c),
        wind_speed_ms=wind_speed_ms,
        wind_from_deg=wind_from_deg,
        temperature_c=temperature_c,
    )
