"""Scoring the athlete's own routes against today's stated duration and TSS.

The interesting failures here are not "does it sort" — they are the specific
mismatches a naive implementation gets wrong: a route that is the right length
but the wrong intensity, a route with no TSS history at all, a plan with no
target to score against.
"""
from __future__ import annotations

import pytest

from app.services.route_recommendation import (
    LOW_CONFIDENCE_RIDE_COUNT,
    recommend_routes,
    score_route,
)


def _route(name, *, avg_time_min=None, avg_tss=None, times_ridden=5):
    return {
        "name": name,
        "avg_time_s": avg_time_min * 60 if avg_time_min is not None else None,
        "avg_tss": avg_tss,
        "times_ridden": times_ridden,
    }


class TestScoreRoute:
    def test_an_exact_match_scores_a_perfect_one(self):
        fit = score_route(
            _route("Loop", avg_time_min=90, avg_tss=100),
            target_duration_minutes=90,
            target_tss=100,
        )
        assert fit.score == pytest.approx(1.0)
        assert fit.duration_fit == pytest.approx(1.0)
        assert fit.tss_fit == pytest.approx(1.0)

    def test_right_length_wrong_intensity_is_not_a_good_match(self):
        """A 20-minute VO2 target must not be satisfied by a 90-minute
        endurance loop just because someone once hammered it to the same TSS."""
        fit = score_route(
            _route("Long flat loop", avg_time_min=20, avg_tss=100),
            target_duration_minutes=20,
            target_tss=25,  # a real 20-min VO2 session's typical TSS
        )
        assert fit.duration_fit == pytest.approx(1.0)
        assert fit.tss_fit is not None and fit.tss_fit < 0.2
        assert fit.score < 0.6

    def test_symmetric_the_other_way(self):
        fit = score_route(
            _route("Short punchy loop", avg_time_min=20, avg_tss=25),
            target_duration_minutes=90,
            target_tss=25,
        )
        assert fit.tss_fit == pytest.approx(1.0)
        assert fit.duration_fit is not None and fit.duration_fit < 0.3

    def test_a_route_with_no_tss_history_still_scores_on_duration_alone(self):
        """Missing intensity data is not the same claim as 'bad fit' — it
        must not silently zero out or exclude the route. It IS discounted
        though: matching only duration says nothing about whether the road
        will make the athlete work the way today asks."""
        fit = score_route(
            _route("New route", avg_time_min=60, avg_tss=None),
            target_duration_minutes=60,
            target_tss=80,
        )
        assert fit.tss_fit is None
        assert fit.duration_fit == pytest.approx(1.0)
        # Perfect on the one signal it has, discounted for having only one.
        assert 0.8 < fit.score < 1.0

    def test_a_two_signal_match_outranks_an_equally_good_one_signal_match(self):
        both = score_route(
            _route("Known road", avg_time_min=60, avg_tss=80),
            target_duration_minutes=60, target_tss=80,
        )
        one = score_route(
            _route("No power data", avg_time_min=60, avg_tss=None),
            target_duration_minutes=60, target_tss=80,
        )
        assert both.score > one.score

    def test_a_zwift_route_loses_to_a_real_road_of_equal_fit(self):
        """Recommending Watopia as "today's road" answers a question nobody
        asked. Demoted, never hidden — the athlete may intend to ride indoors."""
        outdoor = score_route(
            _route("Local loop", avg_time_min=60, avg_tss=80),
            target_duration_minutes=60, target_tss=80,
        )
        indoor = dict(_route("Watopia", avg_time_min=60, avg_tss=80), is_virtual=True)
        virtual = score_route(indoor, target_duration_minutes=60, target_tss=80)
        assert virtual.is_virtual is True
        assert virtual.score < outdoor.score
        # Same underlying shape — only the ranking differs.
        assert virtual.raw_fit == pytest.approx(outdoor.raw_fit)

    def test_a_thin_history_loses_to_a_well_ridden_route_of_equal_fit(self):
        established = score_route(
            _route("Ridden weekly", avg_time_min=60, avg_tss=80, times_ridden=12),
            target_duration_minutes=60, target_tss=80,
        )
        thin = score_route(
            _route("Ridden once", avg_time_min=60, avg_tss=80, times_ridden=1),
            target_duration_minutes=60, target_tss=80,
        )
        assert thin.score < established.score
        assert thin.raw_fit == pytest.approx(established.raw_fit)

    def test_a_route_with_neither_signal_scores_zero_not_none(self):
        fit = score_route(
            _route("No data", avg_time_min=None, avg_tss=None),
            target_duration_minutes=60,
            target_tss=80,
        )
        assert fit.score == 0.0

    def test_flags_low_confidence_below_the_ride_count_threshold(self):
        fit = score_route(
            _route("Ridden once", avg_time_min=60, avg_tss=80, times_ridden=1),
            target_duration_minutes=60,
            target_tss=80,
        )
        assert fit.is_low_confidence is True

    def test_does_not_flag_a_well_established_route(self):
        fit = score_route(
            _route("Ridden often", avg_time_min=60, avg_tss=80, times_ridden=LOW_CONFIDENCE_RIDE_COUNT),
            target_duration_minutes=60,
            target_tss=80,
        )
        assert fit.is_low_confidence is False

    def test_a_huge_mismatch_floors_at_zero_rather_than_going_negative(self):
        fit = score_route(
            _route("Wildly off", avg_time_min=300, avg_tss=400),
            target_duration_minutes=20,
            target_tss=20,
        )
        assert fit.duration_fit == 0.0
        assert fit.tss_fit == 0.0
        assert fit.score == 0.0


class TestRecommendRoutes:
    def test_ranks_best_fit_first(self):
        routes = [
            _route("Too long", avg_time_min=180, avg_tss=200),
            _route("Just right", avg_time_min=60, avg_tss=70),
            _route("Too short", avg_time_min=15, avg_tss=15),
        ]
        ranked = recommend_routes(routes, target_duration_minutes=60, target_tss=70)
        assert ranked is not None
        assert ranked[0].route["name"] == "Just right"

    def test_returns_none_without_any_routes(self):
        assert recommend_routes([], target_duration_minutes=60, target_tss=70) is None

    def test_returns_none_without_a_target_to_score_against(self):
        """None, not an empty list — 'no target' and 'nothing fits' are
        different claims and must not be confused on the wire."""
        routes = [_route("Some loop", avg_time_min=60, avg_tss=70)]
        assert recommend_routes(routes, target_duration_minutes=None, target_tss=None) is None

    def test_a_duration_only_target_still_ranks(self):
        routes = [
            _route("Long", avg_time_min=120, avg_tss=None),
            _route("Right length", avg_time_min=60, avg_tss=None),
        ]
        ranked = recommend_routes(routes, target_duration_minutes=60, target_tss=None)
        assert ranked is not None
        assert ranked[0].route["name"] == "Right length"

    def test_a_sub_minimum_duration_target_with_no_tss_target_yields_none(self):
        routes = [_route("Some loop", avg_time_min=60, avg_tss=70)]
        assert recommend_routes(routes, target_duration_minutes=2, target_tss=None) is None
