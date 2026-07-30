"""The cycling power balance, solved FORWARD (watts → speed).

services/cda_estimate.py inverts this exact equation to recover CdA from a
ridden file. This module solves the same equation the other way so a rehearsal
and the ride it was calibrated from can never disagree about the physics — the
constants below are deliberately identical to that module's defaults.

    P·η  =  m·g·sin θ·v  +  Crr·m·g·cos θ·v  +  ½·ρ·CdA·(v + w)|v + w|·v

Aero force uses the APPARENT speed (v + headwind) squared, while the power it
costs is that force times GROUND speed — using apparent speed for both is the
classic error and would make headwinds cost too much.

The right-hand side is NOT monotonic in v in general (the gravity and rolling
terms invert sign on a descent, and the apparent-speed term inverts with a
strong enough tailwind), so "rises monotonically" is the wrong invariant to
lean on. What actually makes the bisection correct is narrower: f(0) = 0
exactly, and every target we solve for is >= 0. f may dip negative before
climbing, but starting from lo = 0 with a target >= 0 guarantees the
`need < target` rule walks lo up to the unique crossing on the final rising
branch. This breaks if `lo` is ever raised off zero, or if a braking /
negative-power term is added such that target can go negative.

Everything is written array-first: pass scalars for one rider, arrays for
Task 8's Monte Carlo draws, and NumPy broadcasting handles the rest.
"""
from __future__ import annotations

import numpy as np

G = 9.80665
DRIVETRAIN_EFF = 0.97
#: No rehearsal should predict a descent faster than this. Real riders brake.
DESCENT_SPEED_CAP_MS = 22.0
#: No rehearsal should predict a rider slower than a walking pace — below
#: this a "speed" stops meaning anything (distance / speed blows up towards
#: infinity as power approaches zero) and downstream segment-time math turns
#: into a divide-by-near-zero. A track-standing rider isn't riding the route.
MIN_SPEED_MS = 1.0

_BISECTION_ITERS = 40


def _power_required(
    v: np.ndarray,
    sin_t: np.ndarray,
    cos_t: np.ndarray,
    mass_kg: np.ndarray,
    cda_m2: np.ndarray,
    crr: np.ndarray,
    air_density: np.ndarray,
    headwind_ms: np.ndarray,
) -> np.ndarray:
    """Watts at the wheel needed to hold ground speed `v`."""
    gravity = mass_kg * G * sin_t * v
    rolling = crr * mass_kg * G * cos_t * v
    apparent = v + headwind_ms
    aero = 0.5 * air_density * cda_m2 * apparent * np.abs(apparent) * v
    return gravity + rolling + aero


def _require_finite(name: str, value: np.ndarray) -> None:
    if not np.all(np.isfinite(value)):
        raise ValueError(f"{name} must be finite, got {value!r}")


def speed_for_power(
    power_w,
    gradient_pct,
    mass_kg,
    cda_m2,
    crr,
    air_density=1.225,
    headwind_ms=0.0,
    drivetrain_eff: float = DRIVETRAIN_EFF,
) -> np.ndarray:
    """Ground speed in m/s for a sustained power on a given gradient.

    Raises ValueError on non-finite (NaN/inf) power, gradient, mass, CdA,
    Crr, or air density, or on non-positive mass — these silently produced a
    plausible-looking ~0 speed in the bisection before this check existed,
    which is worse than a loud failure because it can turn one bad Monte
    Carlo draw into a rider who never finishes a segment.
    """
    power_w = np.asarray(power_w, dtype=float)
    gradient_pct = np.asarray(gradient_pct, dtype=float)
    mass_kg = np.asarray(mass_kg, dtype=float)
    cda_m2 = np.asarray(cda_m2, dtype=float)
    crr = np.asarray(crr, dtype=float)
    air_density = np.asarray(air_density, dtype=float)
    headwind_ms = np.asarray(headwind_ms, dtype=float)

    _require_finite("power_w", power_w)
    _require_finite("gradient_pct", gradient_pct)
    _require_finite("mass_kg", mass_kg)
    _require_finite("cda_m2", cda_m2)
    _require_finite("crr", crr)
    _require_finite("air_density", air_density)
    _require_finite("headwind_ms", headwind_ms)
    if not np.all(mass_kg > 0):
        raise ValueError(f"mass_kg must be positive, got {mass_kg!r}")

    theta = np.arctan(gradient_pct / 100.0)
    sin_t = np.sin(theta)
    cos_t = np.cos(theta)

    target = power_w * drivetrain_eff

    shape = np.broadcast_shapes(
        target.shape, sin_t.shape, mass_kg.shape, cda_m2.shape,
        crr.shape, air_density.shape, headwind_ms.shape,
    )
    lo = np.zeros(shape, dtype=float)
    hi = np.full(shape, DESCENT_SPEED_CAP_MS, dtype=float)

    for _ in range(_BISECTION_ITERS):
        mid = (lo + hi) / 2.0
        need = _power_required(
            mid, sin_t, cos_t, mass_kg, cda_m2, crr, air_density, headwind_ms
        )
        too_slow = need < target
        lo = np.where(too_slow, mid, lo)
        hi = np.where(too_slow, hi, mid)

    # `hi` starts at DESCENT_SPEED_CAP_MS and the loop only ever narrows
    # [lo, hi], so the result is already <= the cap by construction -- no
    # clamp needed on that side. The floor below is the only clamp that does
    # anything: near-zero (or negative) power converges towards f(0) = 0,
    # which is not a meaningful "speed" for a rider on a route.
    return np.maximum((lo + hi) / 2.0, MIN_SPEED_MS)
