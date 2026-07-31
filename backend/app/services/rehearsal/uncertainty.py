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

SPEED COMES FROM VECTORISATION, NOT FROM RESOLUTION
---------------------------------------------------
Looping `simulate()` once per draw cost 47.8 s on a 900-segment route at 200
draws. An earlier version bought that back by COARSENING the route (~8x) before
the draw loop, and that was wrong in a way that reached the athlete: both
`_climb_push` (a step function) and `speed_for_power` (convex in gradient) make
the average of a ramp and a descent much faster than the ramp and the descent
ridden separately. On a sharp rolling profile the coarsened band came out 27%
fast and did not even OVERLAP the honest one, and averaging +14%/-8% into +3%
pushed attempted power below CP so W' never drained -- a route that would break
the athlete rehearsed as a comfortable ride.

So the route is no longer coarsened at all. Instead this module runs its own
time-only march at FULL resolution with the per-draw state (available CP, W'
balance, accumulated kJ, elapsed time) carried as NumPy arrays of shape
(n_draws,), calling `physics.speed_for_power` ONCE per segment with array
arguments covering every draw simultaneously -- which is exactly what that
module's array-first design was for. Measured on the same 900-segment route
that took 47.8 s before: 200 draws in 0.41-0.43 s warm (2.1 s on the very
first call, which is NumPy import warm-up, not the march) -- ~115x faster at
full resolution, so DEFAULT_DRAWS goes back to 200 and nothing is coarsened.

That march necessarily duplicates `simulator.simulate`'s physics, which is a
real risk: two implementations can silently drift apart. The guard is
`test_vectorised_march_matches_simulate_exactly`, which asserts a single
zero-variance draw reproduces `simulate(...).total_time_s` to 0.01%. If that
test ever fails, the two have diverged and the band is lying -- fix the march,
do not loosen the tolerance.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np

from app.services.rehearsal.physics import speed_for_power
from app.services.rehearsal.rider_model import (
    DURABILITY_REFERENCE_KJ,
    MAX_FADE_FRACTION,
    RiderModel,
)
from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.simulator import (
    _BLOWN_J,
    DRAFT_FACTORS,
    EFFORT_INTENSITY,
    Assumptions,
    Effort,
    _climb_push,
)

DEFAULT_DRAWS = 200

#: Relative 1-sigma spreads for each uncertain input.
_CP_SIGMA = 0.04           # continuously-estimated CP, not a lab test
_CDA_SIGMA_MEASURED = 0.08
_CDA_SIGMA_DEFAULT = 0.18  # a position-based guess is far shakier
_CRR_LOW, _CRR_HIGH = 0.004, 0.007   # surface unknown
_WIND_SIGMA = 0.30         # the forecast field itself is a forecast

#: Bounds on the backtest correction. A calibration that halves the band on
#: three lucky rides, or triples it on three unlucky ones, is overfitting a
#: handful of samples -- the clamp keeps the correction a correction.
_MIN_SPREAD_SCALE = 0.6
_MAX_SPREAD_SCALE = 2.5

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


def _percentile(sorted_values, q: float) -> float:
    n = len(sorted_values)
    if n == 0:
        return 0.0
    idx = min(n - 1, max(0, int(round(q * (n - 1)))))
    return float(sorted_values[idx])


# --------------------------------------------------------------------------
# Vectorised restatements of the scalar helpers `simulate()` uses. Each one is
# the same function, evaluated for every draw at once.
# --------------------------------------------------------------------------

def _duration_scale_arr(climb_time_s: np.ndarray) -> np.ndarray:
    """climb_companion.duration_scale, over an array of climb durations.

    The scalar version is handed `int(climb_time_s)`, so the comparison is
    against the TRUNCATED seconds -- 2400.7 s scales by 0.97, not 0.94.
    """
    t = np.floor(climb_time_s)
    return np.where(t > 2400, 0.94, np.where(t > 1200, 0.97, 1.0))


def _available_cp_arr(
    cp_watts: np.ndarray, durability_drop_pct: float, kj_done: np.ndarray
) -> np.ndarray:
    """rider_model.available_cp, over arrays of drawn CP and accumulated work."""
    if durability_drop_pct <= 0:
        return cp_watts
    fade = (durability_drop_pct / 100.0) * (np.maximum(kj_done, 0.0) / DURABILITY_REFERENCE_KJ)
    return cp_watts * (1.0 - np.minimum(MAX_FADE_FRACTION, fade))


def _w_prime_step_vec(
    bal: np.ndarray,
    power: np.ndarray,
    cp: np.ndarray,
    w_prime: float,
    dt: np.ndarray,
) -> np.ndarray:
    """`simulate()`'s W′ integration over a whole segment, in closed form.

    `simulate()` steps `w_prime_balance_step` once per WHOLE second and then
    takes one fractional step, so this must reproduce that exact discretisation
    rather than a nicer continuous one:

      • above CP the recurrence is linear, so N whole seconds plus a remainder
        collapse to a single `-(P - CP)·dt` (the `min(·, W′)` cap can never
        fire while draining);
      • below CP it is geometric — `W′ - bal` shrinks by `(1 - k)` per second
        with `k = (CP - P)/W′` — so N seconds is one `(1 - k)**N`. The one
        place the closed form parts company with the loop is `k > 1` (possible
        only when the rider is more than W′ watts under CP for a second), where
        the loop's cap pins the balance at W′ after the very first whole
        second; that case is handled explicitly.
    """
    whole = np.floor(dt)
    frac = dt - whole

    depleted = bal - (power - cp) * dt

    k = (cp - power) / w_prime
    gap = w_prime - bal
    # In the depleting branch (power > cp) k is negative, so (1 - k) > 1 and
    # raising it to a long segment's whole-second count can overflow to inf
    # for a small W′; that inf can then turn an `inf * 0` or `inf - inf` into
    # nan a couple of lines below. `np.where(power > cp, ...)` at the bottom
    # always picks `depleted` in that case, so this whole branch's value is
    # discarded — only the warning is noise. Silence it rather than the
    # result.
    with np.errstate(over="ignore", invalid="ignore"):
        bal_whole = np.where(
            (k > 1.0) & (whole >= 1.0),
            w_prime,
            w_prime - gap * np.power(1.0 - k, whole),
        )
        stepped = np.minimum(bal_whole + (w_prime - bal_whole) * k * frac, w_prime)
        recharged = np.where(frac > 1e-9, stepped, bal_whole)

    return np.where(power > cp, depleted, recharged)


def _climb_duration_scales(
    segments: list[Segment],
    cp_watts: np.ndarray,
    mass_kg: float,
    solo_cda: np.ndarray,
    crr: np.ndarray,
    effort: Effort,
) -> np.ndarray:
    """Per-segment `duration_scale` factors, shape (n_segments, n_draws).

    Mirrors `simulator._climb_durations`: one rough duration per CONTINUOUS
    climb run, estimated on fresh legs with the SOLO CdA and no wind, so the
    draft assumption can never tip a climb across a duration_scale bucket. A
    repeated climb_id in a later run overwrites the earlier one, exactly as the
    scalar dict does.
    """
    n_seg = len(segments)
    n_draws = cp_watts.shape[0]
    scales = np.ones((n_seg, n_draws), dtype=float)

    runs: list[tuple[int | None, list[int]]] = []
    i = 0
    while i < n_seg:
        cid = segments[i].climb_id
        if cid is None:
            i += 1
            continue
        j = i
        while j < n_seg and segments[j].climb_id == cid:
            j += 1
        runs.append((cid, list(range(i, j))))
        i = j

    if not runs:
        return scales

    idx = [i for _, members in runs for i in members]
    grad = np.array([segments[i].gradient_pct for i in idx], dtype=float)[:, None]
    length = np.array([segments[i].length_m for i in idx], dtype=float)[:, None]
    push = np.array([_climb_push(segments[i].gradient_pct) for i in idx], dtype=float)[:, None]

    power = cp_watts[None, :] * EFFORT_INTENSITY[effort] * push
    speed = speed_for_power(power, grad, mass_kg, solo_cda[None, :], crr[None, :])
    seg_time = np.where(speed > 0.05, length / speed, 0.0)

    # Last run wins for a repeated climb_id, matching the scalar dict.
    by_cid: dict[int | None, np.ndarray] = {}
    pos = 0
    for cid, members in runs:
        by_cid[cid] = seg_time[pos : pos + len(members)].sum(axis=0)
        pos += len(members)

    for cid, members in runs:
        scale = _duration_scale_arr(by_cid[cid])
        for i in members:
            scales[i] = scale
    return scales


def _march_total_times(
    segments: list[Segment],
    model: RiderModel,
    assumptions: Assumptions,
    cp_watts: np.ndarray,
    cda_m2: np.ndarray,
    crr: np.ndarray,
    headwind: np.ndarray | None,
    air_density: np.ndarray | None,
) -> np.ndarray:
    """Total finishing time per draw. Same physics as `simulate()`, no records.

    The band only needs each draw's total, so nothing per-segment is kept and
    the blow-up list is not built -- but the blow-up CAP is, because it is the
    thing that makes a punchy route honestly slow.
    """
    n_draws = cp_watts.shape[0]
    mass = model.mass_kg or 0.0
    cda = cda_m2 * DRAFT_FACTORS[assumptions.draft]
    w_prime = model.w_prime_j or 0.0
    intensity = EFFORT_INTENSITY[assumptions.effort]

    scales = _climb_duration_scales(
        segments, cp_watts, mass, cda_m2, crr, assumptions.effort
    )

    bal = np.full(n_draws, w_prime, dtype=float)
    kj = np.zeros(n_draws, dtype=float)
    elapsed = np.zeros(n_draws, dtype=float)

    for i, seg in enumerate(segments):
        cp_now = _available_cp_arr(cp_watts, model.durability_drop_pct, kj)
        target = cp_now * intensity * _climb_push(seg.gradient_pct) * scales[i]

        if w_prime > 0:
            target = np.where((bal <= _BLOWN_J) & (target > cp_now), cp_now, target)

        wind = headwind[i] if headwind is not None else 0.0
        rho = air_density[i] if air_density is not None else 1.225

        speed = speed_for_power(
            target, seg.gradient_pct, mass, cda, crr,
            air_density=rho, headwind_ms=wind,
        )
        seg_time = np.where(speed > 0.05, seg.length_m / speed, 0.0)
        elapsed = elapsed + seg_time
        kj = kj + target * seg_time / 1000.0

        if w_prime > 0:
            bal = np.maximum(0.0, _w_prime_step_vec(bal, target, cp_now, w_prime, seg_time))

    return elapsed


def _per_segment(values: Sequence[float] | None, n_seg: int, default: float) -> np.ndarray | None:
    """A per-segment series padded to the route's length.

    `simulate()` indexes these directly and would raise on a short series; the
    band pads instead, so one truncated forecast field cannot take the whole
    rehearsal down.
    """
    if values is None:
        return None
    arr = np.asarray(values, dtype=float).ravel()
    if arr.shape[0] < n_seg:
        arr = np.concatenate([arr, np.full(n_seg - arr.shape[0], default)])
    return arr[:n_seg]


def simulate_band(
    segments: list[Segment],
    model: RiderModel,
    assumptions: Assumptions = Assumptions(),
    headwind_ms: Sequence[float] | None = None,
    air_density: Sequence[float] | None = None,
    draws: int = DEFAULT_DRAWS,
    seed: int = 20260730,
    spread_scale: float = 1.0,
) -> TimeBand:
    """p10/p50/p90 finishing times over the uncertain inputs.

    `spread_scale` widens (>1) or narrows (<1) the band around its own median
    without moving that median. It carries the BACKTEST correction: the input
    sigmas below are reasoned estimates, and the only way to know whether the
    resulting band is the right width is to check it against rides the athlete
    actually did. See `band_calibration.calibrate_spread`. Left at 1.0 the
    band is exactly what it was before calibration existed.
    """
    if not model.can_predict_time:
        raise ValueError("rider model cannot support a time prediction")
    if draws <= 0 or not segments:
        return TimeBand(p10_s=0.0, p50_s=0.0, p90_s=0.0, draws=max(0, draws))

    rng = np.random.default_rng(seed)
    cda_sigma = _CDA_SIGMA_DEFAULT if model.cda_is_default else _CDA_SIGMA_MEASURED

    cp = np.maximum(
        _CP_FLOOR_W, (model.cp_watts or 0.0) * (1.0 + rng.normal(0.0, _CP_SIGMA, draws))
    )
    cda = np.maximum(
        _CDA_FLOOR_M2, (model.cda_m2 or 0.0) * (1.0 + rng.normal(0.0, cda_sigma, draws))
    )
    crr = rng.uniform(_CRR_LOW, _CRR_HIGH, draws)

    n_seg = len(segments)
    rho = _per_segment(air_density, n_seg, 1.225)
    if rho is not None:
        rho = rho[:, None]

    base_wind = _per_segment(headwind_ms, n_seg, 0.0)
    wind = None
    if base_wind is not None:
        # Wind forecasts are themselves uncertain; scale the whole field.
        wind = base_wind[:, None] * (1.0 + rng.normal(0.0, _WIND_SIGMA, draws))[None, :]

    times = np.sort(
        _march_total_times(segments, model, assumptions, cp, cda, crr, wind, rho)
    )
    p10 = _percentile(times, 0.10)
    p50 = _percentile(times, 0.50)
    p90 = _percentile(times, 0.90)

    if spread_scale != 1.0:
        # Scale the DEVIATIONS, not the times: the central estimate is the
        # simulator's answer and calibration has nothing to say about it. What
        # the backtest measures is whether the uncertainty around it was
        # honest, so only the width moves.
        scale = max(_MIN_SPREAD_SCALE, min(_MAX_SPREAD_SCALE, spread_scale))
        p10 = p50 - (p50 - p10) * scale
        p90 = p50 + (p90 - p50) * scale

    return TimeBand(p10_s=p10, p50_s=p50, p90_s=p90, draws=draws)
