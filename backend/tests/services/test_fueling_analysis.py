"""Tests for fueling analysis (kJ, carbs, substrate, deficit)."""
from __future__ import annotations

from app.services.fueling_analysis import FuelingResult, analyze_fueling


class TestAnalyzeFueling:
    def test_none_on_empty(self):
        assert analyze_fueling([]) is None

    def test_kj_and_kcal_from_power(self):
        # 200 W for 3600 s = 720000 J = 720 kJ ≈ 720 kcal.
        res = analyze_fueling([200.0] * 3600)
        assert abs(res.total_kj - 720.0) < 1.0
        assert abs(res.total_kcal - 720.0) < 5.0
        assert abs(res.duration_h - 1.0) < 0.01

    def test_higher_intensity_shifts_to_more_carbs(self):
        low = analyze_fueling([200.0] * 3600, if_=0.5)
        high = analyze_fueling([200.0] * 3600, if_=0.95)
        assert high.cho_g_estimate > low.cho_g_estimate
        assert high.fat_g_estimate < low.fat_g_estimate

    def test_carb_target_band_is_high_for_hard_ride(self):
        res = analyze_fueling([250.0] * 3600, if_=0.9)
        lo, hi = res.carb_target_g_per_h
        assert lo >= 60.0 and hi <= 120.0 and hi > lo

    def test_underfuel_flag_on_bonk_signature(self):
        res = analyze_fueling(
            [220.0] * 7200, if_=0.8, durability_drop_pct=18.0, decoupling_pct=9.0
        )
        assert res.likely_underfueled is True

    def test_underfuel_none_without_signals(self):
        res = analyze_fueling([220.0] * 3600, if_=0.8)
        assert res.likely_underfueled is None
