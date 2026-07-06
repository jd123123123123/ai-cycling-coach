"""Pedaling quadrant analysis: pedal force vs circumferential pedal velocity.

Pure module. Average effective pedal force ≈ power / pedal speed, where pedal
speed = (cadence_rpm/60) · 2π · crank_length. Samples split into four quadrants
about a force threshold (pedal force at FTP & mean cadence) and a cadence
threshold: Q1 hi-force/hi-cadence (attacks), Q2 hi-force/lo-cadence (grinding),
Q3 lo/lo (easy), Q4 lo-force/hi-cadence (spinning). Approximate — treats total
power as pedal force; for rider-context, not lab biomechanics.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

_TWO_PI = 2.0 * math.pi


@dataclass(frozen=True)
class QuadrantResult:
    q1_pct: float
    q2_pct: float
    q3_pct: float
    q4_pct: float
    force_threshold_n: float
    cadence_threshold_rpm: float
    sample_count: int


def _pedal_force(power: float, cadence_rpm: float, crank_length_m: float) -> float:
    pedal_speed = (cadence_rpm / 60.0) * _TWO_PI * crank_length_m
    return power / pedal_speed if pedal_speed > 0 else 0.0


def analyze_quadrants(
    power_series: list[float],
    cadence_series: list[float | None],
    *,
    ftp: float | None = None,
    cadence_threshold_rpm: float = 85.0,
    crank_length_m: float = 0.1725,
) -> QuadrantResult | None:
    """Force×velocity quadrant shares. See module docstring. None if no cadence."""
    pairs = [
        (p, float(c))
        for p, c in zip(power_series, cadence_series)
        if c is not None and c > 0
    ]
    if not pairs:
        return None
    forces = [_pedal_force(p, c, crank_length_m) for p, c in pairs]
    mean_cad = sum(c for _, c in pairs) / len(pairs)
    if ftp and ftp > 0:
        force_threshold = _pedal_force(ftp, mean_cad, crank_length_m)
    else:
        force_threshold = sorted(forces)[len(forces) // 2]  # median

    q = [0, 0, 0, 0]
    for (p, c), f in zip(pairs, forces):
        hi_force = f >= force_threshold
        hi_cad = c >= cadence_threshold_rpm
        if hi_force and hi_cad:
            q[0] += 1
        elif hi_force and not hi_cad:
            q[1] += 1
        elif not hi_force and not hi_cad:
            q[2] += 1
        else:
            q[3] += 1
    n = len(pairs)
    return QuadrantResult(
        q1_pct=round(q[0] / n * 100.0, 1),
        q2_pct=round(q[1] / n * 100.0, 1),
        q3_pct=round(q[2] / n * 100.0, 1),
        q4_pct=round(q[3] / n * 100.0, 1),
        force_threshold_n=round(force_threshold, 1),
        cadence_threshold_rpm=cadence_threshold_rpm,
        sample_count=n,
    )
