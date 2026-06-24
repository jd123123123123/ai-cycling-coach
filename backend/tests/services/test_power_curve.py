"""Tests for the mean-maximal power (MMP) curve service."""
from __future__ import annotations

import pytest

from app.services.power_curve import mean_maximal_power, mmp_curve


class TestMeanMaximalPower:
    def test_best_window_is_the_highest_average(self):
        # 10 s at 100 W, then 5 s at 300 W. Best 5 s avg = 300.
        power = [100.0] * 10 + [300.0] * 5
        assert mean_maximal_power(power, 5) == pytest.approx(300.0)

    def test_window_longer_than_ride_returns_none(self):
        assert mean_maximal_power([200.0] * 10, 60) is None

    def test_window_equal_to_ride_is_full_average(self):
        assert mean_maximal_power([100.0, 200.0, 300.0], 3) == pytest.approx(200.0)

    def test_empty_series_returns_none(self):
        assert mean_maximal_power([], 5) is None

    def test_lone_spike_is_diluted_over_a_long_window(self):
        # A 1 s spike to 1000 W surrounded by low power is diluted over a 10 s
        # window, so a genuine sustained 250 W block wins the best-10s average.
        power = [1000.0] + [50.0] * 20 + [250.0] * 10
        # spike window: (1000 + 9*50)/10 = 145; sustained block = 250.
        assert mean_maximal_power(power, 10) == pytest.approx(250.0)


class TestMMPCurve:
    def test_curve_returns_value_per_requested_duration(self):
        power = [200.0] * 1200  # 20 min steady at 200 W
        curve = mmp_curve(power, durations_s=[5, 60, 300, 1200])
        assert curve == {5: 200.0, 60: 200.0, 300: 200.0, 1200: 200.0}

    def test_curve_omits_durations_longer_than_ride(self):
        power = [200.0] * 100
        curve = mmp_curve(power, durations_s=[5, 60, 300])
        assert set(curve.keys()) == {5, 60}
        assert 300 not in curve
