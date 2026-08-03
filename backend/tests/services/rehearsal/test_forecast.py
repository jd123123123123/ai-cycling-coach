"""The forecast layer: a simulated ride, measured with the same instruments as a real one.

The tests that matter here are the ones that pin BEHAVIOUR a wrong implementation
would still produce plausible numbers for. A route demand curve that returns
"some watts" looks fine; one that cannot tell a steady route from a spiky one is
useless. So most of these construct two rides that differ in exactly one way and
assert the metric moves in the right direction.
"""
from __future__ import annotations

import math

import pytest

from app.services.rehearsal.forecast import (
    DEMAND_DURATIONS_S,
    battery_forecast,
    engine_vs_route,
    expand_to_1hz,
    intensity_factor,
    normalized_power,
    predict_heart_rate,
    route_demand_curve,
    training_effect,
    training_stress,
    variability_index,
    zone_distribution,
)
from app.services.rehearsal.simulator import SegmentResult


def _seg(start_m: float, power: float, elapsed: float, grad: float = 0.0) -> SegmentResult:
    return SegmentResult(
        start_m=start_m,
        gradient_pct=grad,
        power_w=power,
        speed_ms=8.0,
        elapsed_s=elapsed,
        w_bal_j=20000.0,
        climb_id=None,
    )


def _steady(power: float, seconds: int) -> list[SegmentResult]:
    """One segment per 10 s at a constant power."""
    out = []
    for i in range(seconds // 10):
        out.append(_seg(i * 80.0, power, (i + 1) * 10.0))
    return out


class TestExpandTo1Hz:
    def test_one_sample_per_second_of_the_simulated_ride(self):
        segs = _steady(200.0, 600)
        series = expand_to_1hz(segs)
        assert len(series) == 600
        assert all(p == 200.0 for p in series)

    def test_duration_comes_from_elapsed_so_the_stream_matches_the_headline(self):
        """If the stream length disagreed with the finish time the rider is
        shown, every metric derived from it would describe a different ride."""
        segs = [_seg(0, 200, 100.0), _seg(500, 300, 250.0), _seg(900, 150, 400.0)]
        series = expand_to_1hz(segs)
        assert len(series) == 400
        # And the powers land in the right places.
        assert series[50] == 200.0
        assert series[200] == 300.0
        assert series[350] == 150.0

    def test_a_sub_second_segment_is_not_silently_dropped(self):
        segs = [_seg(0, 200, 0.4), _seg(10, 250, 10.4)]
        series = expand_to_1hz(segs)
        assert len(series) >= 10

    def test_non_finite_or_negative_power_never_enters_the_stream(self):
        segs = [_seg(0, float("nan"), 10.0), _seg(100, -50.0, 20.0)]
        series = expand_to_1hz(segs)
        assert all(math.isfinite(p) and p >= 0 for p in series)

    def test_an_empty_ride_yields_an_empty_stream(self):
        assert expand_to_1hz([]) == []


class TestRouteDemandCurve:
    def test_a_steady_route_demands_its_own_power_at_every_duration(self):
        series = [220.0] * 4000
        demand = route_demand_curve(series)
        for d in DEMAND_DURATIONS_S:
            assert demand[d] == pytest.approx(220.0, abs=0.5)

    def test_a_route_with_a_hard_climb_demands_more_than_its_average(self):
        """This is the whole point: the average of this ride is modest, but for
        20 minutes it forces a much harder effort, and THAT is what the rider's
        engine has to cover."""
        series = [150.0] * 3000 + [300.0] * 1200 + [150.0] * 3000
        demand = route_demand_curve(series)
        avg = sum(series) / len(series)
        assert demand[1200] > avg
        assert demand[1200] == pytest.approx(300.0, abs=1.0)

    def test_two_climbs_split_by_a_short_descent_are_found_as_one_hard_block(self):
        """A naive 'hardest single climb' heuristic would report 600 s of work.
        The rolling sweep correctly sees that the recovery between them is too
        short, and that the 20-minute demand is therefore high."""
        series = [140.0] * 1200 + [310.0] * 600 + [170.0] * 120 + [310.0] * 600 + [140.0] * 1200
        demand = route_demand_curve(series)
        # The best 20-minute block spans both climbs and the dip between them.
        assert demand[1200] > 280.0

    def test_durations_longer_than_the_ride_are_omitted_not_zeroed(self):
        demand = route_demand_curve([200.0] * 600)
        assert 300 in demand
        assert 3600 not in demand


class TestEngineVsRoute:
    def test_reports_spare_watts_when_the_rider_is_stronger_than_the_route(self):
        series = [200.0] * 4000
        athlete = {300: 320.0, 1200: 285.0, 3600: 255.0}
        points = engine_vs_route(series, athlete)
        assert len(points) == 3
        for p in points:
            assert p.spare_w is not None and p.spare_w > 0
            assert p.ratio is not None and p.ratio < 1.0

    def test_flags_the_duration_where_the_route_asks_for_more_than_the_rider_has(self):
        # A route with a brutal 5-minute wall, against a rider with no top end.
        series = [180.0] * 2000 + [400.0] * 300 + [180.0] * 2000
        athlete = {300: 330.0, 1200: 280.0, 3600: 250.0}
        points = {p.duration_s: p for p in engine_vs_route(series, athlete)}
        assert points[300].ratio > 1.0
        assert points[300].spare_w < 0
        # ... while the long durations remain comfortable.
        assert points[3600].ratio < 1.0

    def test_the_roads_demand_is_shown_even_to_a_rider_with_no_recorded_bests(self):
        """The demand is a property of the road. Withholding it because the
        athlete has no curve yet would hide the one fact we are certain of."""
        points = engine_vs_route([200.0] * 4000, None)
        assert len(points) == 3
        assert all(p.required_w > 0 for p in points)
        assert all(p.athlete_best_w is None and p.spare_w is None for p in points)

    def test_accepts_a_near_duration_from_the_stored_curve(self):
        # 1080 s is within 20% of 1200 s.
        points = {p.duration_s: p for p in engine_vs_route([200.0] * 4000, {1080: 290.0})}
        assert points[1200].athlete_best_w == 290.0

    def test_refuses_a_far_duration_rather_than_flattering_the_rider(self):
        """A 30-minute best is not a 20-minute best. Stretching it would
        overstate the rider's headroom exactly where honesty matters most."""
        points = {p.duration_s: p for p in engine_vs_route([200.0] * 4000, {1800: 290.0})}
        assert points[1200].athlete_best_w is None


class TestZoneDistribution:
    def test_splits_the_ride_across_zones_by_ftp(self):
        ftp = 250.0
        # 1000 s easy (Z1), 1000 s endurance (Z2), 1000 s threshold (Z4)
        series = [100.0] * 1000 + [160.0] * 1000 + [245.0] * 1000
        zones = {z.zone: z for z in zone_distribution(series, ftp)}
        assert zones[1].seconds == 1000
        assert zones[2].seconds == 1000
        assert zones[4].seconds == 1000
        assert zones[1].fraction == pytest.approx(1 / 3, abs=0.01)

    def test_fractions_sum_to_one(self):
        series = [120.0] * 500 + [200.0] * 500 + [300.0] * 500
        zones = zone_distribution(series, 250.0)
        assert sum(z.fraction for z in zones) == pytest.approx(1.0)

    def test_says_nothing_without_an_ftp_to_bin_against(self):
        # Zones are a fraction OF something. Without it there is no honest split.
        assert zone_distribution([200.0] * 100, None) == []
        assert zone_distribution([200.0] * 100, 0) == []

    def test_supra_threshold_work_lands_in_the_top_zone(self):
        zones = {z.zone: z for z in zone_distribution([500.0] * 100, 250.0)}
        assert zones[5].seconds == 100


class TestClassicMetrics:
    def test_np_exceeds_average_on_a_variable_ride(self):
        """The entire reason NP exists: surging costs more than its average
        suggests."""
        surgy = ([100.0] * 60 + [300.0] * 60) * 20
        avg = sum(surgy) / len(surgy)
        np_w = normalized_power(surgy)
        assert np_w > avg

    def test_np_equals_average_on_a_perfectly_steady_ride(self):
        steady = [200.0] * 2400
        assert normalized_power(steady) == pytest.approx(200.0, abs=1.0)

    def test_np_refuses_a_window_shorter_than_its_own_definition(self):
        assert normalized_power([200.0] * 10) is None

    def test_variability_index_separates_steady_from_surgy(self):
        steady = [200.0] * 2400
        surgy = ([100.0] * 60 + [300.0] * 60) * 20
        vi_steady = variability_index(normalized_power(steady), 200.0)
        vi_surgy = variability_index(normalized_power(surgy), 200.0)
        assert vi_steady == pytest.approx(1.0, abs=0.02)
        assert vi_surgy > 1.1

    def test_tss_of_one_hour_at_ftp_is_one_hundred(self):
        """The definitional anchor of the whole TSS scale."""
        assert training_stress(3600, 250.0, 250.0) == pytest.approx(100.0, abs=0.5)

    def test_tss_scales_with_duration_and_intensity(self):
        assert training_stress(7200, 250.0, 250.0) == pytest.approx(200.0, abs=1.0)
        assert training_stress(3600, 125.0, 250.0) == pytest.approx(25.0, abs=0.5)

    def test_intensity_factor_is_np_over_ftp(self):
        assert intensity_factor(225.0, 250.0) == pytest.approx(0.9)
        assert intensity_factor(None, 250.0) is None


class TestHeartRatePrediction:
    ANCHORS = dict(ftp_w=250.0, lthr_bpm=165.0, resting_hr=50.0, max_hr=190.0)

    def test_a_harder_ride_predicts_a_higher_average_heart_rate(self):
        easy = predict_heart_rate([150.0] * 3600, **self.ANCHORS)
        hard = predict_heart_rate([240.0] * 3600, **self.ANCHORS)
        assert hard["avg_bpm"] > easy["avg_bpm"]

    def test_steady_riding_at_ftp_converges_toward_lthr(self):
        """The anchor that makes the map meaningful rather than arbitrary."""
        out = predict_heart_rate([250.0] * 3000, **self.ANCHORS)
        assert out["avg_bpm"] == pytest.approx(165.0, rel=0.10)

    def test_heart_rate_lags_power_rather_than_stepping_with_it(self):
        """Without the lag, a 30-second climb would be credited with its full
        steady-state heart rate — the largest error in a naive power-to-HR map."""
        # 30 s hard from rest: HR must still be well below the steady-state
        # value for that power.
        out = predict_heart_rate([400.0] * 30, **self.ANCHORS)
        steady_state_for_400 = 50.0 + (165.0 - 50.0) / 250.0 * 400.0
        assert out["max_bpm"] < steady_state_for_400 * 0.75

    def test_never_exceeds_max_heart_rate(self):
        out = predict_heart_rate([600.0] * 3600, **self.ANCHORS)
        assert out["max_bpm"] <= 190.0

    def test_cardiac_drift_raises_heart_rate_over_a_long_steady_effort(self):
        short = predict_heart_rate([200.0] * 3000, **self.ANCHORS)
        long = predict_heart_rate([200.0] * 18000, **self.ANCHORS)
        assert long["avg_bpm"] > short["avg_bpm"]

    def test_refuses_to_predict_without_its_anchors(self):
        # A predicted HR built on a guessed max HR is a fabrication.
        for missing in ("lthr_bpm", "max_hr", "resting_hr", "ftp_w"):
            anchors = dict(self.ANCHORS)
            anchors[missing] = None
            assert predict_heart_rate([200.0] * 600, **anchors) is None

    def test_refuses_physiologically_impossible_anchors(self):
        bad = dict(self.ANCHORS, resting_hr=170.0)
        assert predict_heart_rate([200.0] * 600, **bad) is None

    def test_marks_itself_an_estimate(self):
        out = predict_heart_rate([200.0] * 600, **self.ANCHORS)
        assert out["is_estimate"] is True


class TestTrainingEffect:
    def test_aerobic_effect_rises_with_load_and_saturates(self):
        low = training_effect(tss=40, time_above_cp_s=0, w_prime_j=20000, duration_s=3600)
        mid = training_effect(tss=150, time_above_cp_s=0, w_prime_j=20000, duration_s=7200)
        huge = training_effect(tss=600, time_above_cp_s=0, w_prime_j=20000, duration_s=21600)
        assert low["aerobic"] < mid["aerobic"] < huge["aerobic"]
        # Bounded: doubling an already-huge load cannot push past the scale.
        assert huge["aerobic"] <= 5.0

    def test_a_flat_ride_scores_aerobically_without_scoring_anaerobically(self):
        """The two-axis reading is what makes 'enormous but not sharp' legible."""
        out = training_effect(tss=250, time_above_cp_s=0, w_prime_j=20000, duration_s=21600)
        assert out["aerobic"] > 3.0
        assert out["anaerobic"] == 0.0

    def test_supra_threshold_work_drives_the_anaerobic_axis(self):
        flat = training_effect(tss=150, time_above_cp_s=0, w_prime_j=20000, duration_s=7200)
        spiky = training_effect(tss=150, time_above_cp_s=900, w_prime_j=20000, duration_s=7200)
        assert spiky["anaerobic"] > flat["anaerobic"]

    def test_recovery_time_is_a_range_not_false_precision(self):
        out = training_effect(tss=100, time_above_cp_s=0, w_prime_j=20000, duration_s=3600)
        assert out["recovery_hours_low"] < out["recovery_hours_high"]

    def test_a_bigger_ride_needs_longer_to_clear(self):
        small = training_effect(tss=50, time_above_cp_s=0, w_prime_j=20000, duration_s=3600)
        big = training_effect(tss=300, time_above_cp_s=0, w_prime_j=20000, duration_s=18000)
        assert big["recovery_hours_low"] > small["recovery_hours_low"]

    def test_refuses_without_a_load_to_scale(self):
        assert training_effect(tss=None, time_above_cp_s=0, w_prime_j=1, duration_s=3600) is None


class TestBatteryForecast:
    def test_a_bigger_ride_leaves_less_in_the_tank(self):
        small = battery_forecast(start_readiness_pct=82, tss=40)
        big = battery_forecast(start_readiness_pct=82, tss=160)
        assert big["finish_pct"] < small["finish_pct"]

    def test_never_forecasts_total_destruction(self):
        """A load number cannot support the claim 'you will be at zero'."""
        out = battery_forecast(start_readiness_pct=82, tss=900)
        assert out["finish_pct"] >= 5

    def test_refuses_when_today_is_unknown(self):
        # Forecasting a finish state from an unknown start is exactly the
        # failure the readiness gate exists to prevent.
        assert battery_forecast(start_readiness_pct=None, tss=100) is None

    def test_refuses_an_impossible_starting_readiness(self):
        assert battery_forecast(start_readiness_pct=140, tss=100) is None

    def test_reports_the_cost_it_applied(self):
        out = battery_forecast(start_readiness_pct=82, tss=100)
        assert out["cost_pct"] == out["start_pct"] - out["finish_pct"]


class TestMagnitudesNotJustOrdering:
    """Ordering tests are not enough, and this class exists because of it.

    The first version of this module passed 44 ordering tests while predicting
    186 bpm for a 250 W rider at 300 W, scoring a 40 TSS ride 4.7/5 anaerobically,
    and emptying a rider's battery on a two-hour tempo ride. Every one of those
    is monotone in the right direction and every one is wrong. These pin the
    actual numbers against values a coach would recognise.
    """

    ANCHORS = dict(ftp_w=250.0, lthr_bpm=165.0, resting_hr=50.0, max_hr=190.0)

    @pytest.mark.parametrize(
        "watts,lo,hi",
        [
            (120, 95, 115),    # ~48% FTP — easy endurance
            (200, 130, 150),   # 80% FTP — tempo
            (250, 158, 170),   # FTP — must sit at LTHR
            (300, 165, 180),   # 120% FTP — NOT a straight-line extrapolation
        ],
    )
    def test_heart_rate_lands_where_a_coach_would_expect(self, watts, lo, hi):
        out = predict_heart_rate([float(watts)] * 3000, **self.ANCHORS)
        assert lo <= out["avg_bpm"] <= hi, f"{watts} W -> {out['avg_bpm']} bpm"

    def test_the_hr_curve_flattens_above_threshold(self):
        """Below FTP the map is linear; above it, the same power increment must
        buy noticeably less heart rate, because HR is nearing its ceiling while
        the legs are not."""
        a = predict_heart_rate([200.0] * 3000, **self.ANCHORS)["avg_bpm"]
        b = predict_heart_rate([250.0] * 3000, **self.ANCHORS)["avg_bpm"]
        c = predict_heart_rate([300.0] * 3000, **self.ANCHORS)["avg_bpm"]
        below_slope = b - a      # 50 W below threshold
        above_slope = c - b      # the same 50 W above it
        assert above_slope < below_slope * 0.6

    @pytest.mark.parametrize(
        "minutes_above_cp,lo,hi",
        [
            (0, 0.0, 0.0),     # a flat ride is not an anaerobic session
            (5, 0.8, 1.8),     # a couple of efforts
            (10, 1.6, 2.8),    # a solid threshold day
            (30, 3.5, 4.6),    # a genuine interval session
        ],
    )
    def test_anaerobic_effect_matches_the_session_it_describes(
        self, minutes_above_cp, lo, hi
    ):
        te = training_effect(
            tss=90,
            time_above_cp_s=minutes_above_cp * 60,
            w_prime_j=20000,
            duration_s=3600,
        )
        assert lo <= te["anaerobic"] <= hi

    def test_the_battery_matches_the_designs_own_worked_example(self):
        """The pen shows a 3.4 h / 1,240 hm route (~190 TSS) taking a rider from
        82% to roughly 18%. If this model disagrees with that, one of the two is
        wrong and it is worth knowing which."""
        out = battery_forecast(start_readiness_pct=82, tss=190)
        assert 12 <= out["finish_pct"] <= 26

    def test_a_two_hour_tempo_ride_does_not_empty_the_rider(self):
        # ~120 TSS. Costing a rider their whole battery is not recognisable.
        out = battery_forecast(start_readiness_pct=82, tss=120)
        assert out["finish_pct"] > 30
