"""Forward power balance: watts + terrain + air → speed.

cda_estimate.py inverts this same equation to get CdA out of a ridden file;
this solves it forward. The two MUST agree on their constants or a rehearsal
would contradict the ride it was calibrated from.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.services.rehearsal.physics import speed_for_power

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

    def test_descents_are_capped(self):
        # Freewheeling down 10 % must not return an implausible speed.
        assert _v(100, -10.0) <= 22.0

    def test_zero_power_on_the_flat_is_not_moving(self):
        # A rider producing nothing on the flat does not roll forever.
        assert _v(0, 0.0) == pytest.approx(0.0, abs=0.2)

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
