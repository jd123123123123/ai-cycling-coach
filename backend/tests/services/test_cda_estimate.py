"""Tests for steady-state CdA estimation."""
from __future__ import annotations

from app.services.cda_estimate import CdaResult, estimate_cda

_G = 9.80665


def _flat_steady_power(cda, v, mass, rho=1.225, crr=0.005, eff=0.97):
    """Pedal power that a rider with `cda` holds at steady `v` on the flat."""
    p_aero = 0.5 * rho * cda * v ** 3
    p_roll = crr * mass * _G * v
    return (p_aero + p_roll) / eff


class TestEstimateCda:
    def test_none_on_bad_mass(self):
        assert estimate_cda([200.0] * 60, [10.0] * 60, [100.0] * 60, mass_kg=0.0) is None

    def test_none_when_too_few_clean_samples(self):
        # All below min_speed → no clean samples.
        assert estimate_cda([200.0] * 60, [2.0] * 60, [100.0] * 60, mass_kg=75.0) is None

    def test_recovers_known_cda_on_flat_steady(self):
        cda, v, mass = 0.30, 10.0, 75.0
        p = _flat_steady_power(cda, v, mass)
        n = 120
        res = estimate_cda([p] * n, [v] * n, [100.0] * n, mass_kg=mass)
        assert res is not None
        assert abs(res.cda_m2 - cda) < 0.01
        assert res.sample_count > 30

    def test_ignores_accelerating_samples(self):
        cda, mass = 0.30, 75.0
        # ramping speed → non-zero acceleration → excluded; only steady tail counts.
        speeds = [5.0 + 0.5 * i for i in range(20)] + [12.0] * 100  # accel then steady
        alt = [100.0] * len(speeds)
        power = [_flat_steady_power(cda, s, mass) for s in speeds]
        res = estimate_cda(power, speeds, alt, mass_kg=mass, max_accel_ms2=0.1)
        assert res is not None
        assert abs(res.cda_m2 - cda) < 0.02

    def test_gravity_term_on_a_climb_is_handled(self):
        # Riding uphill (altitude rising) at steady speed: gravity dominates,
        # small residual aero. Estimator must not blow up or go negative wildly.
        cda, v, mass = 0.32, 8.0, 75.0
        rho, crr, eff = 1.225, 0.005, 0.97
        vert = 0.4  # m/s vertical (climbing)
        p_aero = 0.5 * rho * cda * v ** 3
        p_roll = crr * mass * _G * v
        p_grav = mass * _G * vert
        p = (p_aero + p_roll + p_grav) / eff
        n = 120
        alt = [100.0 + vert * i for i in range(n)]
        res = estimate_cda([p] * n, [v] * n, alt, mass_kg=mass)
        assert res is not None
        assert abs(res.cda_m2 - cda) < 0.03
