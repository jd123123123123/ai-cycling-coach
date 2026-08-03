"""The plan a rider carries: chapters, PR odds, fuel.

A wrong number in this module is one a rider ACTS on, so these lean hard on the
refusals and on internal consistency with what the rest of the page already
claims.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.race_plan import (
    MAX_CHAPTERS,
    Chapter,
    fuel_plan,
    narrate_segments,
    pr_probability,
)
from app.services.rehearsal.route_profile import Climb
from app.services.rehearsal.simulator import SegmentResult


def _seg(start_m, power, elapsed, grad=0.0, climb_id=None) -> SegmentResult:
    return SegmentResult(
        start_m=start_m,
        gradient_pct=grad,
        power_w=power,
        speed_ms=8.0,
        elapsed_s=elapsed,
        w_bal_j=20000.0,
        climb_id=climb_id,
    )


def _run(n, start, power, grad, climb_id=None, step=150.0, secs=18.0, t0=0.0):
    return [
        _seg(start + i * step, power, t0 + (i + 1) * secs, grad, climb_id)
        for i in range(n)
    ]


class TestChapters:
    def test_splits_a_route_where_its_character_changes(self):
        segs = (
            _run(80, 0, 190, 0.5)                                  # 12 km valley
            + _run(28, 12000, 250, 6.5, climb_id=1, t0=1440)       # 4.2 km climb
            + _run(40, 16200, 165, -4.0, t0=1944)                  # 6 km descent
        )
        chapters = narrate_segments(segs, [Climb(1, 12000, 16200, 4200, 280, 6.5)], 250.0)
        kinds = [c.kind for c in chapters]
        assert "climb" in kinds and "descent" in kinds
        assert 2 <= len(chapters) <= MAX_CHAPTERS

    def test_a_climb_is_never_folded_away(self):
        """A short steep climb is exactly what a rider came for. Merging it into
        the valley either side would delete the point of the plan."""
        segs = (
            _run(60, 0, 190, 0.5)
            + _run(10, 9000, 280, 9.0, climb_id=1, t0=1080)   # 1.5 km, short
            + _run(60, 10500, 190, 0.5, t0=1300)
        )
        chapters = narrate_segments(segs, [Climb(1, 9000, 10500, 1500, 135, 9.0)], 250.0)
        assert any(c.kind == "climb" for c in chapters)

    def test_a_short_flat_is_folded_into_its_neighbour(self):
        # Nobody names a 300 m stretch of flat as its own chapter.
        segs = _run(60, 0, 190, 0.5) + _run(2, 9000, 195, 0.2, t0=1080)
        chapters = narrate_segments(segs, [], 250.0)
        assert len(chapters) == 1

    def test_each_chapter_carries_a_zone_and_a_target(self):
        segs = _run(60, 0, 190, 0.5) + _run(28, 9000, 265, 6.5, climb_id=1, t0=1080)
        chapters = narrate_segments(segs, [Climb(1, 9000, 13200, 4200, 280, 6.5)], 250.0)
        for c in chapters:
            assert 1 <= c.zone <= 5
            assert c.avg_power_w > 0
            assert c.duration_s > 0
        # The climb must be the harder chapter.
        climb = next(c for c in chapters if c.kind == "climb")
        flat = next(c for c in chapters if c.kind != "climb")
        assert climb.zone > flat.zone

    def test_never_returns_more_chapters_than_a_rider_can_hold(self):
        segs = []
        t = 0.0
        for i in range(30):
            segs += _run(20, i * 3000, 190 + (i % 3) * 40, 3.0 if i % 2 else -3.0, t0=t)
            t += 360
        chapters = narrate_segments(segs, [], 250.0)
        assert len(chapters) <= MAX_CHAPTERS

    def test_an_empty_ride_has_no_plan(self):
        assert narrate_segments([], [], 250.0) == []


class TestPrProbability:
    BAND = dict(p10_s=11520.0, p50_s=12240.0, p90_s=12960.0)  # 3:12 / 3:24 / 3:36

    def test_a_pr_at_the_median_is_a_coin_flip(self):
        out = pr_probability(**self.BAND, pr_s=12240.0)
        assert out["probability"] == pytest.approx(0.5, abs=0.02)

    def test_an_easy_pr_is_likely_and_a_hard_one_is_not(self):
        easy = pr_probability(**self.BAND, pr_s=13000.0)["probability"]
        hard = pr_probability(**self.BAND, pr_s=11000.0)["probability"]
        assert easy > 0.9
        assert hard < 0.1

    def test_it_agrees_with_the_band_already_on_screen(self):
        """The page shows p10-p90 and this probability side by side. If they
        disagreed the page would contradict itself, which is why this is
        derived from the band rather than from a second model."""
        # p10 is by definition the 10th percentile: ~10% of outcomes beat it.
        out = pr_probability(**self.BAND, pr_s=self.BAND["p10_s"])
        assert out["probability"] == pytest.approx(0.10, abs=0.02)
        out90 = pr_probability(**self.BAND, pr_s=self.BAND["p90_s"])
        assert out90["probability"] == pytest.approx(0.90, abs=0.02)

    def test_reports_the_margin_it_is_talking_about(self):
        out = pr_probability(**self.BAND, pr_s=12000.0)
        assert out["margin_s"] == pytest.approx(-240, abs=1)

    def test_refuses_without_a_band_or_a_pr(self):
        assert pr_probability(p10_s=None, p50_s=1, p90_s=2, pr_s=3) is None
        assert pr_probability(**self.BAND, pr_s=None) is None

    def test_refuses_a_zero_width_band(self):
        assert pr_probability(p10_s=100, p50_s=100, p90_s=100, pr_s=99) is None


class TestFuelPlan:
    def test_a_longer_ride_needs_more_of_everything(self):
        short = fuel_plan(total_kj=1200, duration_s=3600, intensity_factor=0.8)
        long = fuel_plan(total_kj=4000, duration_s=14400, intensity_factor=0.8)
        assert long["carbs_g_total"] > short["carbs_g_total"]
        assert long["fluid_l"] > short["fluid_l"]
        assert long["bottles"] > short["bottles"]

    def test_harder_riding_raises_the_carbohydrate_band(self):
        easy = fuel_plan(total_kj=2000, duration_s=7200, intensity_factor=0.55)
        hard = fuel_plan(total_kj=2000, duration_s=7200, intensity_factor=0.88)
        assert hard["carbs_g_per_hour_low"] > easy["carbs_g_per_hour_low"]

    def test_the_target_stays_inside_what_an_amateur_can_actually_eat(self):
        """Real-world amateur intake sits far below the 90-120 g/h the marketing
        discourse assumes. A target nobody can reach is a target nobody uses."""
        out = fuel_plan(total_kj=3000, duration_s=10800, intensity_factor=0.8)
        assert out["carbs_g_per_hour_low"] <= 80
        assert out["carbs_g_per_hour_high"] <= 110

    def test_heat_raises_the_fluid_requirement(self):
        cool = fuel_plan(total_kj=2000, duration_s=7200, intensity_factor=0.75, temperature_c=15)
        hot = fuel_plan(total_kj=2000, duration_s=7200, intensity_factor=0.75, temperature_c=32)
        assert hot["fluid_l"] > cool["fluid_l"]
        assert hot["bottles"] >= cool["bottles"]

    def test_it_never_speaks_the_language_of_a_diet(self):
        """The framing order IS the mechanism of harm. This function must not
        return anything that reads as a deficit, a balance, or a weight target."""
        out = fuel_plan(total_kj=2500, duration_s=9000, intensity_factor=0.8)
        forbidden = ("deficit", "balance", "weight", "burn", "net", "surplus", "loss")
        for key in out:
            assert not any(f in key.lower() for f in forbidden), key

    def test_refuses_without_a_ride_behind_it(self):
        # A fuel plan with no ride behind it is a diet.
        assert fuel_plan(total_kj=None, duration_s=3600, intensity_factor=0.8) is None
        assert fuel_plan(total_kj=1000, duration_s=None, intensity_factor=0.8) is None

    def test_marks_itself_an_estimate(self):
        assert fuel_plan(total_kj=2000, duration_s=7200, intensity_factor=0.8)["is_estimate"]
