"""Forward power balance: watts + terrain + air → speed.

cda_estimate.py inverts this same equation to get CdA out of a ridden file;
this solves it forward. The two MUST agree on their constants or a rehearsal
would contradict the ride it was calibrated from.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.services.rehearsal.physics import (
    DESCENT_SPEED_CAP_MS,
    MIN_SPEED_MS,
    speed_for_power,
)

_M = 80.0      # rider + bike
_CDA = 0.30
_CRR = 0.005


def _v(power, gradient, **kw) -> float:
    return float(speed_for_power(power, gradient, _M, _CDA, _CRR, **kw))


class TestSpeedForPower:
    def test_flat_is_faster_than_climbing_at_equal_watts(self):
        assert _v(250, 0.0) > _v(250, 8.0)

    def test_more_watts_is_faster(self):
        assert _v(300, 5.0) > _v(200, 5.0)

    def test_headwind_is_slower_than_tailwind(self):
        assert _v(250, 0.0, headwind_ms=5.0) < _v(250, 0.0, headwind_ms=-5.0)

    def test_a_plausible_flat_speed(self):
        # 250 W on the flat for an 80 kg system: roughly 10-12 m/s (36-43 km/h).
        assert 9.0 < _v(250, 0.0) < 13.0

    def test_a_plausible_climbing_speed(self):
        # 250 W up 8 % for 80 kg: gravity alone is ~m*g*sin(θ)*v, so ~4 m/s.
        assert 3.0 < _v(250, 8.0) < 5.5

    # -- Pinned physics values -----------------------------------------
    #
    # These are not observed output blessed after the fact: they are hand
    # -verified against the power balance in physics.py's docstring using
    # the *ground*-speed aero term (apparent speed squared, ground speed
    # linear). The classic mutant -- computing aero power off apparent
    # speed cubed, conflating apparent and ground speed -- gives 5.626 m/s
    # for the headwind case below instead of 7.466, a 25% speed error that
    # the plausible-range tests above are too loose to catch. These
    # absolute assertions exist specifically to catch that mutant (and
    # three more: gradient treated as radians, sin θ = pct/100 with
    # cos θ = 1, and cos θ dropped from the rolling term).
    def test_pinned_headwind_speed(self):
        assert _v(250, 0.0, headwind_ms=5.0) == pytest.approx(7.466, abs=0.05)

    def test_pinned_tailwind_speed(self):
        assert _v(250, 0.0, headwind_ms=-5.0) == pytest.approx(13.671, abs=0.05)

    def test_pinned_climbing_speed(self):
        assert _v(250, 8.0) == pytest.approx(3.527, abs=0.05)

    def test_pinned_steep_climb_kills_the_small_angle_gradient_mutant(self):
        # At 8 %, sin θ ≈ θ ≈ pct/100 and cos θ ≈ 1, so a mutant that
        # substitutes sin θ = pct/100 with cos θ = 1 barely moves the
        # answer -- it hides inside the loose plausible-range and even the
        # ±0.05 pinned tolerance above. A steep 25 % climb makes the small
        # -angle approximation wrong enough (true 1.2476 vs mutant 1.2105,
        # a 0.037 m/s gap) for a tight tolerance to catch it.
        assert _v(250, 25.0) == pytest.approx(1.2476, abs=0.02)

    def test_pinned_high_crr_climb_kills_the_dropped_cos_theta_mutant(self):
        # Rolling resistance is normally too small a share of total power
        # for dropping cos θ from it to show up against any reasonable
        # tolerance. Crank Crr up (0.05, an order of magnitude above a
        # real tyre) on a steep climb to make that term's contribution
        # large enough that dropping cos θ (true 1.10550 vs mutant
        # 1.09860, a 0.0069 m/s gap) is visible at a tight tolerance.
        v = float(speed_for_power(300, 30.0, 80.0, 0.30, 0.05))
        assert v == pytest.approx(1.10550, abs=0.003)

    def test_descent_cap_binds_on_a_steep_descent(self):
        # -15 % at 100 W drives the unclamped solution past 22 m/s, so the
        # cap must be the thing returned, not an unclamped bisection result.
        assert _v(100, -15.0) == pytest.approx(DESCENT_SPEED_CAP_MS, abs=1e-6)

    def test_descent_cap_does_not_bind_on_a_shallow_descent(self):
        # -3 % at 100 W settles at ~12.2 m/s, well under the cap -- if the
        # cap always bound (e.g. a bug that clamps unconditionally) this
        # would incorrectly read 22.0 too.
        v = _v(100, -3.0)
        assert v < DESCENT_SPEED_CAP_MS - 1.0
        assert v == pytest.approx(12.240, abs=0.05)

    def test_zero_power_hits_the_minimum_speed_floor(self):
        # A rider producing nothing does not roll forever, but the module
        # also refuses to report a near-zero "speed" (which would blow up
        # segment-time = distance / speed towards infinity downstream).
        # It reports the floor instead.
        assert _v(0, 0.0) == pytest.approx(MIN_SPEED_MS, abs=1e-9)

    def test_vectorises_over_arrays(self):
        out = speed_for_power(
            np.array([200.0, 250.0, 300.0]), 5.0, _M, _CDA, _CRR
        )
        assert out.shape == (3,)
        assert out[0] < out[1] < out[2]

    def test_broadcasts_rider_arrays_against_a_scalar_segment(self):
        # Task 8 runs N Monte Carlo riders through ONE segment at a time.
        out = speed_for_power(
            250.0, 6.0, np.array([78.0, 80.0, 82.0]), _CDA, _CRR
        )
        assert out.shape == (3,)
        assert out[0] > out[2]   # lighter is faster uphill


class TestMinSpeedFloor:
    def test_floor_applies_to_negative_power(self):
        # Negative power isn't validated away (coasting/braking are real),
        # but it must not produce an implausible near-zero speed either.
        assert _v(-50, 0.0) == pytest.approx(MIN_SPEED_MS, abs=1e-9)

    def test_floor_applies_to_tiny_power(self):
        assert _v(1, 0.0) == pytest.approx(MIN_SPEED_MS, abs=1e-9)

    def test_floor_and_cap_do_not_fight(self):
        # A tiny power on a steep descent should still land on the cap
        # (gravity dominates), not the floor -- the two clamps must not
        # both try to win.
        assert _v(1, -15.0) == pytest.approx(DESCENT_SPEED_CAP_MS, abs=1e-6)


class TestInvalidInputsRaise:
    """A NaN or non-positive input must fail loudly, not return a
    plausible-looking near-zero speed that silently corrupts a downstream
    Monte Carlo percentile band."""

    def test_nan_power_raises(self):
        with pytest.raises(ValueError):
            _v(float("nan"), 0.0)

    def test_nan_gradient_raises(self):
        with pytest.raises(ValueError):
            _v(250, float("nan"))

    def test_nan_mass_raises(self):
        with pytest.raises(ValueError):
            speed_for_power(250, 0.0, float("nan"), _CDA, _CRR)

    def test_nan_cda_raises(self):
        with pytest.raises(ValueError):
            speed_for_power(250, 0.0, _M, float("nan"), _CRR)

    def test_nan_crr_raises(self):
        with pytest.raises(ValueError):
            speed_for_power(250, 0.0, _M, _CDA, float("nan"))

    def test_nan_air_density_raises(self):
        with pytest.raises(ValueError):
            speed_for_power(250, 0.0, _M, _CDA, _CRR, air_density=float("nan"))

    def test_nan_headwind_raises(self):
        with pytest.raises(ValueError):
            _v(250, 0.0, headwind_ms=float("nan"))

    def test_infinite_power_raises(self):
        with pytest.raises(ValueError):
            _v(float("inf"), 0.0)

    def test_zero_mass_raises(self):
        with pytest.raises(ValueError):
            speed_for_power(250, 0.0, 0.0, _CDA, _CRR)

    def test_negative_mass_raises(self):
        with pytest.raises(ValueError):
            speed_for_power(250, 0.0, -80.0, _CDA, _CRR)

    def test_nan_in_a_mass_array_raises(self):
        # Task 8's Monte Carlo draws mass as an array -- one bad draw must
        # not silently sink just that rider to ~0 m/s.
        with pytest.raises(ValueError):
            speed_for_power(250.0, 6.0, np.array([78.0, float("nan"), 82.0]), _CDA, _CRR)
