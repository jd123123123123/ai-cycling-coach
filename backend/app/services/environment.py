"""Pure environmental physics for ride analysis: air density and relative wind.

No DB, no network. `weather_client` fetches raw weather; these functions turn it
(and altitude/heading) into the quantities the aero/pacing analyzers consume.
"""
from __future__ import annotations

import math

# International Standard Atmosphere constants.
_P0 = 101325.0      # sea-level standard pressure, Pa
_T0 = 288.15        # sea-level standard temperature, K
_L = 0.0065         # temperature lapse rate, K/m
_G = 9.80665        # gravity, m/s²
_M = 0.0289644      # molar mass of dry air, kg/mol
_R = 8.31447        # universal gas constant, J/(mol·K)
_R_SPECIFIC = 287.058  # specific gas constant for dry air, J/(kg·K)


def air_density(altitude_m: float, temp_c: float | None = None) -> float:
    """Air density (kg/m³) at an altitude, using measured temp when available."""
    pressure = _P0 * (1.0 - _L * altitude_m / _T0) ** (_G * _M / (_R * _L))
    if temp_c is None:
        temp_k = _T0 - _L * altitude_m
    else:
        temp_k = temp_c + 273.15
    return pressure / (_R_SPECIFIC * temp_k)


def relative_wind(
    heading_deg: float, wind_from_deg: float, wind_speed_ms: float
) -> float:
    """Signed headwind component (m/s) along travel heading. +head / −tail.

    `wind_from_deg` is the meteorological direction the wind blows FROM.
    """
    # Angle between travel direction and the direction the wind blows TOWARD.
    wind_to_deg = (wind_from_deg + 180.0) % 360.0
    delta = math.radians(wind_to_deg - heading_deg)
    # Component of the wind vector opposing travel = −cos(delta)·speed.
    return -math.cos(delta) * wind_speed_ms
