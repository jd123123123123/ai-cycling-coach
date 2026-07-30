"""Wind resolved onto the road, and air density from temperature.

Weather applies ONLY to a dated route inside the forecast horizon. Beyond that
it is omitted and labelled, never swapped for climate averages (spec §6).
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.route_source import RehearsalRoute, RoutePoint
from app.services.rehearsal.weather import (
    air_density_for_segments,
    headwind_for_segments,
    weather_applies,
)


def _seg(bearing: float) -> Segment:
    return Segment(start_m=0.0, length_m=150.0, gradient_pct=0.0,
                   bearing_deg=bearing, elevation_m=100.0, climb_id=None)


def _route(ride_date):
    pt = RoutePoint(distance_m=0.0, elevation_m=100.0, lat=46.0, lng=11.0)
    return RehearsalRoute(points=[pt, pt], total_distance_m=1000.0,
                          total_ascent_m=0.0, name=None, ride_date=ride_date)


class TestWeatherApplies:
    def test_not_without_a_date(self):
        assert weather_applies(_route(None), date(2026, 7, 30)) is False

    def test_yes_inside_the_horizon(self):
        today = date(2026, 7, 30)
        assert weather_applies(_route(today + timedelta(days=3)), today) is True

    def test_no_beyond_the_horizon(self):
        today = date(2026, 7, 30)
        assert weather_applies(_route(today + timedelta(days=40)), today) is False

    def test_no_for_a_past_date(self):
        today = date(2026, 7, 30)
        assert weather_applies(_route(today - timedelta(days=1)), today) is False


class TestHeadwind:
    def test_riding_into_the_wind_is_a_full_headwind(self):
        # Wind FROM the north (0°), rider heading north (0°) → straight into it.
        out = headwind_for_segments([_seg(0.0)], wind_speed_ms=5.0, wind_from_deg=0.0)
        assert out[0] == pytest.approx(5.0, abs=0.01)

    def test_riding_with_the_wind_is_a_tailwind(self):
        out = headwind_for_segments([_seg(180.0)], wind_speed_ms=5.0, wind_from_deg=0.0)
        assert out[0] == pytest.approx(-5.0, abs=0.01)

    def test_crosswind_contributes_nothing_along_the_road(self):
        out = headwind_for_segments([_seg(90.0)], wind_speed_ms=5.0, wind_from_deg=0.0)
        assert out[0] == pytest.approx(0.0, abs=0.01)

    def test_one_value_per_segment(self):
        segs = [_seg(0.0), _seg(90.0), _seg(180.0)]
        assert len(headwind_for_segments(segs, 4.0, 0.0)) == 3


class TestAirDensity:
    def test_thinner_air_high_up(self):
        low = Segment(0.0, 150.0, 0.0, 0.0, 0.0, None)
        high = Segment(0.0, 150.0, 0.0, 0.0, 2500.0, None)
        out = air_density_for_segments([low, high], temperature_c=15.0)
        assert out[1] < out[0]

    def test_sea_level_at_15c_is_near_the_standard_value(self):
        out = air_density_for_segments([Segment(0.0, 150.0, 0.0, 0.0, 0.0, None)], 15.0)
        assert out[0] == pytest.approx(1.225, abs=0.02)
