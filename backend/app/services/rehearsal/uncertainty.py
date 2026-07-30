"""Monte Carlo band over every uncertain input.

The full model — weather, wind and drafting — was chosen deliberately, and each
added assumption compounds error. This module is where that honesty is paid
for: the range shown to the athlete widens visibly when an assumption is less
certain (a guessed CdA widens it more than a measured one), so the interface
teaches that assumptions cost certainty.

Draws are seeded, so the same rehearsal always reports the same band.

`effort` and `draft` are NOT drawn over: they are choices the athlete makes
about how they intend to ride, not things we are uncertain about. Only CP,
CdA, Crr and the wind field are genuinely unknown, so only those are sampled.

A Gaussian draw can in principle put CP or CdA at or below zero for a large
enough sigma, and `physics.speed_for_power` now raises on non-finite inputs
(and rejects non-positive mass) -- a non-positive CdA would also make the
aero term flip sign, which is not a physically sensible rider. Every drawn
value is clamped to a small positive floor so a rare extreme draw stays
physically sensible instead of producing nonsense or crashing the batch.

Measured on a 900-segment (~138 km) route: 200 draws took 47.8s and 100 draws
took 23.9s -- both far over the 8 s budget, because each draw re-runs the full
segment-by-segment bisection in `physics.speed_for_power`. Cutting draws alone
cannot close that gap without making the band noticeably noisier, so this
module ALSO coarsens the route once, before the Monte Carlo loop, whenever a
route is long enough that per-draw cost dominates: every group of segments is
merged into one wider segment (length-weighted gradient, summed length) so a
900-segment route becomes ~110 before the loop runs. That coarsening only
feeds the uncertainty estimate -- it never touches `simulate()`'s own
segment-by-segment output used elsewhere. Measured after both changes (100
draws, coarsened to ~110 segments): 6.3-6.4s across repeated runs, inside the
8 s budget with margin.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, replace
from math import ceil
from typing import Sequence

from app.services.rehearsal.rider_model import RiderModel
from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.simulator import Assumptions, simulate

DEFAULT_DRAWS = 100

#: Above this many segments, per-draw cost of the full bisection dominates
#: runtime; coarsen the route once (outside the draw loop) rather than keep
#: paying full resolution for every one of hundreds of draws.
_COARSEN_TARGET_SEGMENTS = 110

#: Relative 1-sigma spreads for each uncertain input.
_CP_SIGMA = 0.04           # continuously-estimated CP, not a lab test
_CDA_SIGMA_MEASURED = 0.08
_CDA_SIGMA_DEFAULT = 0.18  # a position-based guess is far shakier
_CRR_LOW, _CRR_HIGH = 0.004, 0.007   # surface unknown

#: Floors so a rare wide Gaussian tail never draws a non-positive, physically
#: meaningless CP or CdA (speed_for_power would either crash on it or, for a
#: negative CdA, flip the aero force's sign).
_CP_FLOOR_W = 1.0
_CDA_FLOOR_M2 = 0.05


@dataclass(frozen=True)
class TimeBand:
    p10_s: float
    p50_s: float
    p90_s: float
    draws: int


def _percentile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    idx = min(len(sorted_values) - 1, max(0, int(round(q * (len(sorted_values) - 1)))))
    return sorted_values[idx]


def _coarsen_segments(segments: list[Segment], factor: int) -> list[Segment]:
    """Merge every `factor` consecutive segments into one wider segment.

    Only used to cut the per-draw cost of the Monte Carlo loop on long
    routes -- `simulate()`'s own segment-by-segment result (what the athlete
    actually sees for a single rehearsal) is never coarsened.
    """
    merged: list[Segment] = []
    for i in range(0, len(segments), factor):
        group = segments[i : i + factor]
        total_len = sum(s.length_m for s in group)
        gradient = (
            sum(s.gradient_pct * s.length_m for s in group) / total_len
            if total_len > 0
            else group[0].gradient_pct
        )
        climb_id = group[0].climb_id if all(s.climb_id == group[0].climb_id for s in group) else None
        merged.append(
            Segment(
                start_m=group[0].start_m,
                length_m=total_len,
                gradient_pct=gradient,
                bearing_deg=group[0].bearing_deg,
                elevation_m=group[0].elevation_m,
                climb_id=climb_id,
            )
        )
    return merged


def _coarsen_series(values: Sequence[float], factor: int, n_out: int) -> list[float]:
    """Average a per-segment series into the same groups `_coarsen_segments` used."""
    out: list[float] = []
    for i in range(n_out):
        group = values[i * factor : i * factor + factor]
        out.append(sum(group) / len(group))
    return out


def simulate_band(
    segments: list[Segment],
    model: RiderModel,
    assumptions: Assumptions = Assumptions(),
    headwind_ms: Sequence[float] | None = None,
    air_density: Sequence[float] | None = None,
    draws: int = DEFAULT_DRAWS,
    seed: int = 20260730,
) -> TimeBand:
    """p10/p50/p90 finishing times over the uncertain inputs."""
    rng = random.Random(seed)
    cda_sigma = _CDA_SIGMA_DEFAULT if model.cda_is_default else _CDA_SIGMA_MEASURED

    if len(segments) > _COARSEN_TARGET_SEGMENTS:
        factor = ceil(len(segments) / _COARSEN_TARGET_SEGMENTS)
        n_out = ceil(len(segments) / factor)
        if headwind_ms is not None:
            headwind_ms = _coarsen_series(headwind_ms, factor, n_out)
        if air_density is not None:
            air_density = _coarsen_series(air_density, factor, n_out)
        segments = _coarsen_segments(segments, factor)

    times: list[float] = []
    for _ in range(draws):
        drawn = replace(
            model,
            cp_watts=max(_CP_FLOOR_W, (model.cp_watts or 0) * (1.0 + rng.gauss(0.0, _CP_SIGMA))),
            cda_m2=max(_CDA_FLOOR_M2, (model.cda_m2 or 0) * (1.0 + rng.gauss(0.0, cda_sigma))),
            crr=rng.uniform(_CRR_LOW, _CRR_HIGH),
        )
        # Wind forecasts are themselves uncertain; scale the whole field.
        wind = (
            [w * (1.0 + rng.gauss(0.0, 0.30)) for w in headwind_ms]
            if headwind_ms is not None
            else None
        )
        times.append(
            simulate(segments, drawn, assumptions, wind, air_density).total_time_s
        )

    times.sort()
    return TimeBand(
        p10_s=_percentile(times, 0.10),
        p50_s=_percentile(times, 0.50),
        p90_s=_percentile(times, 0.90),
        draws=draws,
    )
