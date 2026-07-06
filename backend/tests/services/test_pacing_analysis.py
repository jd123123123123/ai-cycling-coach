"""Tests for pacing analysis (split, VI, surges, phases, zones)."""
from __future__ import annotations

from app.services.pacing_analysis import PacingResult, analyze_pacing


class TestAnalyzePacing:
    def test_too_short_returns_none(self):
        assert analyze_pacing([200.0] * 60) is None

    def test_positive_split_detected(self):
        # First half strong (250 W), second half faded (200 W) → negative split_pct.
        power = [250.0] * 600 + [200.0] * 600
        res = analyze_pacing(power, ftp=250.0)
        assert res.first_half_np > res.second_half_np
        assert res.split_pct < 0

    def test_even_ride_split_near_zero(self):
        res = analyze_pacing([220.0] * 1200, ftp=250.0)
        assert abs(res.split_pct) < 1.0

    def test_variability_index_flat_is_one(self):
        res = analyze_pacing([220.0] * 1200, ftp=250.0)
        assert res.variability_index is not None
        assert abs(res.variability_index - 1.0) < 0.02

    def test_surges_counted(self):
        # Baseline 150 W with three 15 s spikes to 400 W (>1.1*FTP=275).
        power = []
        for _ in range(3):
            power += [150.0] * 300 + [400.0] * 15
        power += [150.0] * 300
        res = analyze_pacing(power, ftp=250.0, surge_frac=1.1, surge_min_s=10)
        assert res.surge_count == 3

    def test_zone_time_sums_to_100(self):
        res = analyze_pacing([100.0] * 400 + [220.0] * 400 + [300.0] * 400, ftp=250.0)
        assert abs(sum(res.zone_time_pct.values()) - 100.0) < 0.5

    def test_phase_np_has_three_thirds(self):
        res = analyze_pacing([200.0] * 1200, ftp=250.0)
        assert len(res.phase_np) == 3
