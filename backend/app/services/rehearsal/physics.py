"""The cycling power balance, solved FORWARD (watts → speed).

services/cda_estimate.py inverts this exact equation to recover CdA from a
ridden file. This module solves the same equation the other way so a rehearsal
and the ride it was calibrated from can never disagree about the physics — the
constants below are deliberately identical to that module's defaults.

    P·η  =  m·g·sin θ·v  +  Crr·m·g·cos θ·v  +  ½·ρ·CdA·(v + w)|v + w|·v

Aero force uses the APPARENT speed (v + headwind) squared, while the power it
costs is that force times GROUND speed — using apparent speed for both is the
classic error and would make headwinds cost too much.

The right-hand side rises monotonically with v, so a bisection solve is exact
enough and needs no solver library. Everything is written array-first: pass
scalars for one rider, arrays for Task 8's Monte Carlo draws, and NumPy
broadcasting handles the rest.
"""
from __future__ import annotations

import numpy as np

G = 9.80665
DRIVETRAIN_EFF = 0.97
#: No rehearsal should predict a descent faster than this. Real riders brake.
DESCENT_SPEED_CAP_MS = 22.0

_BISECTION_ITERS = 60


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
    """Ground speed in m/s for a sustained power on a given gradient."""
    power_w = np.asarray(power_w, dtype=float)
    theta = np.arctan(np.asarray(gradient_pct, dtype=float) / 100.0)
    sin_t = np.sin(theta)
    cos_t = np.cos(theta)
    mass_kg = np.asarray(mass_kg, dtype=float)
    cda_m2 = np.asarray(cda_m2, dtype=float)
    crr = np.asarray(crr, dtype=float)
    air_density = np.asarray(air_density, dtype=float)
    headwind_ms = np.asarray(headwind_ms, dtype=float)

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

    return np.minimum((lo + hi) / 2.0, DESCENT_SPEED_CAP_MS)
