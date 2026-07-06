"""Pacing analysis: split, variability index, surges, phase intensity, zones.

Pure module. Reuses calculate_np (Normalized Power) and coggan_power_zones.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.training_load import calculate_np, coggan_power_zones


@dataclass(frozen=True)
class PacingResult:
    first_half_np: float
    second_half_np: float
    split_pct: float
    variability_index: float | None
    surge_count: int
    phase_np: list[float]
    final_30min_np: float | None
    zone_time_pct: dict[str, float]


def _count_surges(power: list[float], threshold: float, min_s: int) -> int:
    surges, run = 0, 0
    for p in power:
        if p >= threshold:
            run += 1
        else:
            if run >= min_s:
                surges += 1
            run = 0
    if run >= min_s:
        surges += 1
    return surges


def _zone_time_pct(power: list[float], ftp: float) -> dict[str, float]:
    # coggan_power_zones(ftp) -> {zone_key: {"name":.., "min": int, "max": int|None}}.
    # Coggan's integer-truncated boundaries leave a 1 W gap between each zone's
    # `max` and the next zone's `min` (e.g. zone5 max 300, zone6 min 302), so an
    # upper-bound test would drop samples in the gap. Assign each sample to the
    # HIGHEST zone whose `min` it meets — gap-free, always sums to 100%.
    zones = coggan_power_zones(ftp)
    bands = sorted(
        ((int(z["min"]), label) for label, z in zones.items()), key=lambda b: b[0]
    )
    counts = {label: 0 for _, label in bands}
    for p in power:
        chosen = bands[0][1]
        for lo, label in bands:
            if p >= lo:
                chosen = label
            else:
                break
        counts[chosen] += 1
    n = len(power)
    return {label: round(counts[label] / n * 100.0, 1) for _, label in bands}


def analyze_pacing(
    power_series: list[float],
    ftp: float | None = None,
    hr_series: list[float] | None = None,
    *,
    surge_frac: float = 1.1,
    surge_min_s: int = 10,
) -> PacingResult | None:
    """Pacing metrics for a ride, or None when shorter than 120 s."""
    n = len(power_series)
    if n < 120:
        return None
    half = n // 2
    first_np = calculate_np(power_series[:half])
    second_np = calculate_np(power_series[half:])
    split = ((second_np - first_np) / first_np * 100.0) if first_np > 0 else 0.0

    avg = sum(power_series) / n
    full_np = calculate_np(power_series)
    vi = round(full_np / avg, 3) if avg > 0 else None

    third = n // 3
    phase_np = [
        round(calculate_np(power_series[0:third]), 1),
        round(calculate_np(power_series[third:2 * third]), 1),
        round(calculate_np(power_series[2 * third:]), 1),
    ]
    final_30 = round(calculate_np(power_series[-1800:]), 1) if n >= 1800 else None

    surge_count = (
        _count_surges(power_series, ftp * surge_frac, surge_min_s) if ftp and ftp > 0 else 0
    )
    zone_pct = _zone_time_pct(power_series, ftp) if ftp and ftp > 0 else {}

    return PacingResult(
        first_half_np=round(first_np, 1),
        second_half_np=round(second_np, 1),
        split_pct=round(split, 1),
        variability_index=vi,
        surge_count=surge_count,
        phase_np=phase_np,
        final_30min_np=final_30,
        zone_time_pct=zone_pct,
    )
