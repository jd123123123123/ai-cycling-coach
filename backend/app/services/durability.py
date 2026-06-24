"""Durability / fatigue resistance — how much power survives deep into a ride.

Durability is the trainable ability to hold high power *late* in a long ride,
after substantial energy expenditure. It is increasingly recognised as a
distinct, decisive determinant of endurance performance, separate from a fresh
power profile (Maunder et al. 2021, Sports Med; Spragg et al. 2023, "Durability
of the power-duration relationship").

Two complementary metrics, both pure functions over 1 Hz streams:

* `durability_drop` — best `window_s` power achieved *after* a kJ-work threshold
  vs the best fresh effort of the same length, expressed as a % drop. A smaller
  drop = more durable.
* `aerobic_decoupling` — first-half vs second-half power-to-HR efficiency drift
  (Friel's Pw:HR decoupling). Positive % = cardiac drift / fatigue.

No DB, no Garmin.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.power_curve import mean_maximal_power


@dataclass(frozen=True)
class DurabilityResult:
    fresh_power: float      # best window_s power before the kJ threshold
    fatigued_power: float   # best window_s power after the kJ threshold
    drop_pct: float         # (fresh - fatigued) / fresh * 100; smaller = better
    total_kj: float


def _split_index_at_kj(power_series: list[float], threshold_kj: float) -> int | None:
    """First sample index at which cumulative work reaches `threshold_kj`.

    At 1 Hz, each sample's joules == its watts (1 W for 1 s = 1 J). Returns None
    if the ride never accumulates that much work.
    """
    target_j = threshold_kj * 1000.0
    cum = 0.0
    for i, p in enumerate(power_series):
        cum += p
        if cum >= target_j:
            return i
    return None


def durability_drop(
    power_series: list[float], window_s: int, threshold_kj: float
) -> DurabilityResult | None:
    """Compare best fresh vs fatigued `window_s` power across a kJ threshold.

    Returns None when the ride never reaches the threshold or either segment is
    too short to contain the window.
    """
    if not power_series:
        return None
    split = _split_index_at_kj(power_series, threshold_kj)
    if split is None:
        return None

    fresh_seg = power_series[:split]
    fatigued_seg = power_series[split:]
    fresh = mean_maximal_power(fresh_seg, window_s)
    fatigued = mean_maximal_power(fatigued_seg, window_s)
    if fresh is None or fatigued is None or fresh <= 0:
        return None

    drop_pct = (fresh - fatigued) / fresh * 100.0
    total_kj = sum(power_series) / 1000.0
    return DurabilityResult(
        fresh_power=round(fresh, 1),
        fatigued_power=round(fatigued, 1),
        drop_pct=round(drop_pct, 1),
        total_kj=round(total_kj, 1),
    )


def aerobic_decoupling(
    power_series: list[float], hr_series: list[float]
) -> float | None:
    """Power-to-HR efficiency drift, first half vs second half, as a %.

    decoupling = (eff_first - eff_second) / eff_first * 100, where
    eff = mean(power) / mean(HR) for the half. Positive = the same power cost
    more heartbeats late in the ride (cardiac drift / fatigue). Returns None for
    empty or mismatched inputs, or when a half has zero HR.
    """
    n = len(power_series)
    if n == 0 or n != len(hr_series):
        return None
    half = n // 2
    if half == 0:
        return None

    def _eff(p: list[float], h: list[float]) -> float | None:
        mean_h = sum(h) / len(h)
        if mean_h <= 0:
            return None
        return (sum(p) / len(p)) / mean_h

    eff1 = _eff(power_series[:half], hr_series[:half])
    eff2 = _eff(power_series[half:], hr_series[half:])
    if eff1 is None or eff2 is None or eff1 == 0:
        return None
    return round((eff1 - eff2) / eff1 * 100.0, 1)
