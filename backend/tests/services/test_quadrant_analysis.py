"""Tests for pedaling quadrant analysis (force × velocity)."""
from __future__ import annotations

from app.services.quadrant_analysis import QuadrantResult, analyze_quadrants


class TestAnalyzeQuadrants:
    def test_none_without_valid_cadence(self):
        assert analyze_quadrants([200.0] * 60, [0.0] * 60) is None
        assert analyze_quadrants([200.0] * 60, [None] * 60) is None

    def test_quadrant_percentages_sum_to_100(self):
        power = [150.0, 350.0, 150.0, 350.0] * 60
        cad = [95.0, 95.0, 70.0, 70.0] * 60
        res = analyze_quadrants(power, cad, ftp=250.0)
        total = res.q1_pct + res.q2_pct + res.q3_pct + res.q4_pct
        assert abs(total - 100.0) < 0.5

    def test_high_force_low_cadence_lands_in_q2(self):
        # High power at low cadence = high force, low velocity → Q2 dominant.
        power = [400.0] * 200
        cad = [60.0] * 200
        res = analyze_quadrants(power, cad, ftp=200.0, cadence_threshold_rpm=85.0)
        assert res.q2_pct > res.q1_pct
        assert res.q2_pct > res.q4_pct

    def test_high_cadence_low_force_lands_in_q4(self):
        power = [120.0] * 200
        cad = [100.0] * 200
        res = analyze_quadrants(power, cad, ftp=300.0, cadence_threshold_rpm=85.0)
        assert res.q4_pct > res.q2_pct

    def test_ignores_none_and_zero_cadence_samples(self):
        power = [200.0] * 6
        cad = [90.0, None, 0.0, 90.0, 90.0, None]
        res = analyze_quadrants(power, cad, ftp=250.0)
        assert res.sample_count == 3
