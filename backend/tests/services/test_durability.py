"""Tests for durability / fatigue-resistance metrics."""
from __future__ import annotations

import pytest

from app.services.durability import aerobic_decoupling, durability_drop


class TestDurabilityDrop:
    def test_power_drop_between_fresh_and_fatigued_efforts(self):
        # Fresh 5-min max @ 320 W, a long 200 W endurance block to bank fatigue
        # (kJ), then a fatigued 5-min effort @ 280 W after 300 kJ.
        power = [320.0] * 300 + [200.0] * 1700 + [280.0] * 300
        res = durability_drop(power, window_s=300, threshold_kj=300)
        assert res is not None
        assert res.fresh_power == pytest.approx(320.0, abs=1.0)
        assert res.fatigued_power == pytest.approx(280.0, abs=1.0)
        assert res.drop_pct == pytest.approx(12.5, abs=0.5)

    def test_returns_none_when_threshold_never_reached(self):
        # Only 60 kJ total — never crosses a 300 kJ fatigue threshold.
        power = [200.0] * 300
        assert durability_drop(power, window_s=60, threshold_kj=300) is None

    def test_empty_series_returns_none(self):
        assert durability_drop([], window_s=60, threshold_kj=100) is None


class TestAerobicDecoupling:
    def test_hr_drift_produces_positive_decoupling(self):
        # Constant power, HR drifts up 130→140 → Pw:HR efficiency drops ~7 %.
        power = [200.0] * 600
        hr = [130.0] * 300 + [140.0] * 300
        dec = aerobic_decoupling(power, hr)
        assert dec == pytest.approx(7.1, abs=0.5)

    def test_no_drift_is_zero_decoupling(self):
        dec = aerobic_decoupling([200.0] * 600, [140.0] * 600)
        assert dec == pytest.approx(0.0, abs=1e-6)

    def test_mismatched_or_empty_inputs_return_none(self):
        assert aerobic_decoupling([200.0] * 10, [130.0] * 9) is None
        assert aerobic_decoupling([], []) is None
