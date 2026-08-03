"""You against this route, before — the one card made of measurements.

The matcher is where this could quietly lie, so most of these are about what it
REFUSES to call the same route.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.route_history import (
    Attempt,
    matches_route,
    summarize,
)
from datetime import date


class TestMatcher:
    ROUTE = dict(route_distance_m=82_000.0, route_ascent_m=1240.0)

    def test_the_same_ride_matches(self):
        assert matches_route(ride_distance_m=82_000, ride_ascent_m=1240, **self.ROUTE)

    def test_tolerates_ordinary_gps_and_barometric_variation(self):
        assert matches_route(ride_distance_m=80_500, ride_ascent_m=1310, **self.ROUTE)

    def test_refuses_a_flat_ride_of_the_same_length(self):
        """The failure this exists to prevent: an 82 km valley spin reported as
        a previous attempt would make the forecast look catastrophically slow
        for no reason at all."""
        assert not matches_route(ride_distance_m=82_000, ride_ascent_m=200, **self.ROUTE)

    def test_refuses_a_different_distance(self):
        assert not matches_route(ride_distance_m=140_000, ride_ascent_m=1240, **self.ROUTE)

    def test_refuses_a_ride_with_no_elevation_recorded(self):
        # Distance alone cannot establish it was the same road.
        assert not matches_route(ride_distance_m=82_000, ride_ascent_m=None, **self.ROUTE)

    def test_a_flat_route_does_not_demand_elevation(self):
        assert matches_route(
            ride_distance_m=40_000,
            ride_ascent_m=None,
            route_distance_m=40_000,
            route_ascent_m=0,
        )

    def test_a_small_climb_uses_the_absolute_floor_not_a_percentage(self):
        # 20% of 200 m is 40 m, which is inside normal barometric noise.
        assert matches_route(
            ride_distance_m=30_000,
            ride_ascent_m=320,
            route_distance_m=30_000,
            route_ascent_m=200,
        )


def _a(day: int, dur: float) -> Attempt:
    return Attempt(
        activity_id=day,
        when=date(2026, 3, day),
        duration_s=dur,
        distance_m=82_000,
        ascent_m=1240,
        avg_power_w=195.0,
    )


class TestSummary:
    def test_reports_the_best_and_how_the_forecast_sits_against_it(self):
        out = summarize([_a(1, 13000), _a(2, 12600), _a(3, 13200)], 12240.0)
        assert out["best_s"] == 12600
        assert out["forecast_vs_best_s"] == -360   # forecast is 6 min quicker
        assert out["count"] == 3

    def test_does_not_claim_a_trend_from_a_single_ride(self):
        out = summarize([_a(1, 13000)], 12240.0)
        assert out["trend_is_meaningful"] is False
        # ... but still shows the ride it found.
        assert out["count"] == 1

    def test_claims_a_trend_once_there_is_something_to_trend(self):
        out = summarize([_a(1, 13000), _a(2, 12600)], 12240.0)
        assert out["trend_is_meaningful"] is True

    def test_says_nothing_without_a_single_past_ride(self):
        assert summarize([], 12240.0) is None

    def test_survives_a_missing_forecast(self):
        out = summarize([_a(1, 13000)], None)
        assert out["forecast_vs_best_s"] is None
