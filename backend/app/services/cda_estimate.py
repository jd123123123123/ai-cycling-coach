"""Steady-state aerodynamic drag-area (CdA) estimate from the power balance.

Pure module. Over clean 1 Hz samples (fast enough, near-zero acceleration,
positive residual aero power) it inverts the cycling power equation per second
and returns the MEDIAN CdA — robust to the noisy tails. This is an ESTIMATE:
without a wind sensor and precise rolling resistance it carries real
uncertainty; treat it as directional, not a wind-tunnel figure. Returns None
when the data can't support a fit.
"""
from __future__ import annotations

from dataclasses import dataclass

_G = 9.80665


@dataclass(frozen=True)
class CdaResult:
    cda_m2: float
    sample_count: int
    avg_speed_ms: float


def _median(xs: list[float]) -> float:
    s = sorted(xs)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2.0


def estimate_cda(
    power_series: list[float],
    speed_series: list[float | None],
    altitude_series: list[float | None],
    mass_kg: float,
    *,
    air_density: float = 1.225,
    crr: float = 0.005,
    headwind_ms: float = 0.0,
    drivetrain_eff: float = 0.97,
    min_speed_ms: float = 5.0,
    max_accel_ms2: float = 0.1,
    min_samples: int = 30,
) -> CdaResult | None:
    """Median CdA over clean steady-state samples. None if unsupported. See docstring."""
    if mass_kg <= 0:
        return None
    n = min(len(power_series), len(speed_series), len(altitude_series))
    cdas: list[float] = []
    speeds_used: list[float] = []
    for i in range(1, n):
        v = speed_series[i]
        v_prev = speed_series[i - 1]
        alt = altitude_series[i]
        alt_prev = altitude_series[i - 1]
        if v is None or v_prev is None or alt is None or alt_prev is None:
            continue
        if v < min_speed_ms:
            continue
        accel = v - v_prev                     # m/s per 1 s
        if abs(accel) > max_accel_ms2:
            continue
        vert_rate = alt - alt_prev             # m/s vertical
        p_wheel = power_series[i] * drivetrain_eff
        p_roll = crr * mass_kg * _G * v
        p_grav = mass_kg * _G * vert_rate
        p_kin = mass_kg * accel * v
        p_aero = p_wheel - p_roll - p_grav - p_kin
        if p_aero <= 0:
            continue
        air_speed = v + headwind_ms
        denom = 0.5 * air_density * air_speed * air_speed * v
        if denom <= 0:
            continue
        cdas.append(p_aero / denom)
        speeds_used.append(v)
    if len(cdas) < min_samples:
        return None
    return CdaResult(
        cda_m2=round(_median(cdas), 4),
        sample_count=len(cdas),
        avg_speed_ms=round(sum(speeds_used) / len(speeds_used), 2),
    )
