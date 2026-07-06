"""Tests for per-climb metrics (VAM, W/kg, category)."""
from __future__ import annotations

from app.services.climbing_analysis import Climb, analyze_climbs
from app.services.ride_segmentation import Segment


def _climb_seg(duration_s, elev_gain_m, distance_m, avg_power=None):
    return Segment(
        kind="climb", start_s=0, end_s=duration_s, duration_s=duration_s,
        distance_m=distance_m, elev_gain_m=elev_gain_m, elev_loss_m=0.0,
        avg_grade_pct=round(elev_gain_m / distance_m * 100, 2),
        avg_power=avg_power, avg_speed_ms=None,
    )


class TestAnalyzeClimbs:
    def test_ignores_non_climb_segments(self):
        flat = Segment("flat", 0, 60, 60, 600.0, 0.0, 0.0, 0.0, None, None)
        assert analyze_climbs([flat]) == []

    def test_vam_computed(self):
        # 600 m gained in 1200 s (20 min) → VAM = 600 / (1200/3600) = 1800 m/h.
        seg = _climb_seg(1200, 600.0, 8000.0)
        climbs = analyze_climbs([seg])
        assert len(climbs) == 1
        assert abs(climbs[0].vam_m_per_h - 1800.0) < 1.0

    def test_w_per_kg_when_mass_and_power_present(self):
        seg = _climb_seg(600, 200.0, 4000.0, avg_power=280.0)
        climbs = analyze_climbs([seg], mass_kg=70.0)
        assert abs(climbs[0].w_per_kg - 4.0) < 0.01

    def test_w_per_kg_none_without_mass(self):
        seg = _climb_seg(600, 200.0, 4000.0, avg_power=280.0)
        assert analyze_climbs([seg], mass_kg=None)[0].w_per_kg is None

    def test_big_climb_categorized_harder_than_small(self):
        big = _climb_seg(2400, 1200.0, 16000.0)     # long, lots of gain
        small = _climb_seg(300, 60.0, 3000.0)       # short, little gain
        cats = {c.duration_s: c.category for c in analyze_climbs([big, small])}
        order = ["uncat", "4", "3", "2", "1", "HC"]
        assert order.index(cats[2400]) > order.index(cats[300])
