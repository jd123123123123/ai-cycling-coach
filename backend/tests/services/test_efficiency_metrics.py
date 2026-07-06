"""Tests for efficiency metrics (EF, decoupling, cardiac cost)."""
from __future__ import annotations

from app.services.efficiency_metrics import EfficiencyResult, analyze_efficiency


class TestAnalyzeEfficiency:
    def test_none_on_empty_power(self):
        assert analyze_efficiency([], [140.0]) is None

    def test_efficiency_factor_computed(self):
        # NP of a flat 200 W ride is 200; avg HR 140 → EF ≈ 1.43.
        res = analyze_efficiency([200.0] * 600, [140.0] * 600)
        assert res.avg_hr == 140.0
        assert abs(res.efficiency_factor - 200.0 / 140.0) < 0.02

    def test_no_hr_yields_none_ef(self):
        res = analyze_efficiency([200.0] * 600, None)
        assert res.efficiency_factor is None
        assert res.avg_hr is None
        assert res.np_watts > 0

    def test_bad_hr_sample_yields_none_ef(self):
        res = analyze_efficiency([200.0] * 600, [140.0] * 599 + [0.0])
        assert res.efficiency_factor is None

    def test_decoupling_present_with_long_hr_ride(self):
        # Second half at same power but higher HR → positive decoupling.
        power = [200.0] * 1200
        hr = [140.0] * 600 + [150.0] * 600
        res = analyze_efficiency(power, hr)
        assert res.decoupling_pct is not None
        assert res.decoupling_pct > 0
