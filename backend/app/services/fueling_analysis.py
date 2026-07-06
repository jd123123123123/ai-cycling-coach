"""Fueling analysis: energy expenditure, carb target, substrate split, deficit.

Pure module. DOCUMENTED APPROXIMATIONS (labeled estimates, not measurements):
- Energy: mechanical kJ ≈ dietary kcal (cycling gross efficiency ≈ 24% means
  ~1 kcal metabolic per 1 kJ of work — the standard field shortcut).
- Substrate: the carbohydrate fraction of energy rises with intensity; modeled
  piecewise on IF (fat-dominant easy → carb-dominant near/above threshold).
- Underfueling: a long ride with both high durability drop and elevated
  decoupling is the classic glycogen-depletion ("bonk") signature.

Energy and duration assume power is sampled at 1 Hz (one element = one
second), consistent with the app's stored streams.
"""
from __future__ import annotations

from dataclasses import dataclass

_KCAL_PER_G_CHO = 4.0
_KCAL_PER_G_FAT = 9.0


def _cho_fraction(if_: float | None) -> float:
    """Fraction of energy from carbohydrate, rising with intensity."""
    if if_ is None:
        return 0.6                       # unknown → moderate default
    if if_ <= 0.55:
        return 0.35
    if if_ >= 0.95:
        return 0.95
    # linear ramp between the anchors
    return 0.35 + (if_ - 0.55) * (0.95 - 0.35) / (0.95 - 0.55)


def _carb_target_band(if_: float | None, duration_h: float) -> tuple[float, float]:
    """Recommended carb intake band (g/h). Hard/long → 90–120; easy/short → lower."""
    if (if_ is not None and if_ >= 0.85) or duration_h >= 3.0:
        return (90.0, 120.0)
    if if_ is not None and if_ >= 0.7:
        return (60.0, 90.0)
    return (30.0, 60.0)


@dataclass(frozen=True)
class FuelingResult:
    total_kj: float
    total_kcal: float
    cho_g_estimate: float
    fat_g_estimate: float
    carb_target_g_per_h: tuple[float, float]
    duration_h: float
    likely_underfueled: bool | None
    note: str


def analyze_fueling(
    power_series: list[float],
    if_: float | None = None,
    durability_drop_pct: float | None = None,
    decoupling_pct: float | None = None,
) -> FuelingResult | None:
    """Energy + fueling estimates for a ride. None on empty power. See docstring."""
    if not power_series:
        return None
    total_kj = sum(power_series) / 1000.0
    total_kcal = total_kj                       # ≈ 1:1 (see docstring)
    duration_h = len(power_series) / 3600.0

    cho_frac = _cho_fraction(if_)
    cho_g = total_kcal * cho_frac / _KCAL_PER_G_CHO
    fat_g = total_kcal * (1.0 - cho_frac) / _KCAL_PER_G_FAT
    band = _carb_target_band(if_, duration_h)

    if durability_drop_pct is not None and decoupling_pct is not None:
        underfueled = (
            duration_h >= 1.5 and durability_drop_pct >= 12.0 and decoupling_pct >= 6.0
        )
    else:
        underfueled = None

    if underfueled:
        note = "High late-ride fade with cardiac drift — likely ran low on carbs."
    elif underfueled is False:
        note = "No strong under-fueling signature."
    else:
        note = "Fueling estimate only; connect fatigue signals for a deficit read."

    return FuelingResult(
        total_kj=round(total_kj, 1),
        total_kcal=round(total_kcal, 0),
        cho_g_estimate=round(cho_g, 0),
        fat_g_estimate=round(fat_g, 0),
        carb_target_g_per_h=band,
        duration_h=round(duration_h, 2),
        likely_underfueled=underfueled,
        note=note,
    )
