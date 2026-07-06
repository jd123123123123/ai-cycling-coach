"""Cardiac / efficiency metrics for a ride.

Pure module. Efficiency Factor = Normalized Power ÷ average heart rate (a
cardiac-cost trend marker); decoupling reuses durability.aerobic_decoupling
(first-half vs second-half Pw:HR drift).
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.durability import aerobic_decoupling
from app.services.training_load import calculate_np


@dataclass(frozen=True)
class EfficiencyResult:
    efficiency_factor: float | None
    avg_hr: float | None
    decoupling_pct: float | None
    np_watts: float


def _clean_hr(hr_series: list[float] | None) -> list[float] | None:
    if not hr_series:
        return None
    if any(h is None or h <= 0 for h in hr_series):
        return None
    return [float(h) for h in hr_series]


def analyze_efficiency(
    power_series: list[float],
    hr_series: list[float] | None = None,
    ftp: float | None = None,
) -> EfficiencyResult | None:
    """EF, avg HR, and aerobic decoupling. None on empty power. See docstring."""
    if not power_series:
        return None
    np_watts = calculate_np(power_series)
    hr = _clean_hr(hr_series)
    if hr is None or len(hr) != len(power_series):
        return EfficiencyResult(
            efficiency_factor=None, avg_hr=None, decoupling_pct=None,
            np_watts=round(np_watts, 1),
        )
    avg_hr = sum(hr) / len(hr)
    ef = round(np_watts / avg_hr, 3) if avg_hr > 0 else None
    decoupling = aerobic_decoupling(power_series, hr)
    return EfficiencyResult(
        efficiency_factor=ef,
        avg_hr=round(avg_hr, 1),
        decoupling_pct=decoupling,
        np_watts=round(np_watts, 1),
    )
