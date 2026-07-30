"""Route → fixed-length segments carrying gradient and bearing.

Bearing exists so wind can be resolved per segment (Task 7); gradient drives
the target watts (Task 5). Both come from the same resampling pass so they can
never describe different stretches of road.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.route_profile import (
    build_segments,
    detect_climbs,
    assign_climbs,
    find_climbs,
)
from app.services.rehearsal.route_source import RehearsalRoute, RoutePoint


def _straight_route(gain_per_km: float, length_m: float = 3000.0) -> RehearsalRoute:
    """A due-north route climbing at a constant rate."""
    pts: list[RoutePoint] = []
    step = 100.0
    n = int(length_m / step) + 1
    for i in range(n):
        d = i * step
        pts.append(
            RoutePoint(
                distance_m=d,
                elevation_m=1000.0 + gain_per_km * (d / 1000.0),
                lat=46.0 + (d / 111_320.0),   # ~111.32 km per degree of latitude
                lng=11.0,
            )
        )
    return RehearsalRoute(
        points=pts, total_distance_m=length_m,
        total_ascent_m=max(0.0, gain_per_km * length_m / 1000.0),
        name=None, ride_date=None,
    )


def _terrain_route(profile: list[tuple[float, float]], point_step: float = 5.0) -> RehearsalRoute:
    """A due-north route built from consecutive (length_m, grade_pct) pieces.

    Piece boundaries land exactly on a RoutePoint, so the terrain has a real,
    unambiguous corner rather than one smeared by sparse interpolation.
    """
    pts: list[RoutePoint] = [RoutePoint(distance_m=0.0, elevation_m=1000.0, lat=46.0, lng=11.0)]
    d = 0.0
    elev = 1000.0
    for length, grade in profile:
        n = max(1, round(length / point_step))
        step = length / n
        for _ in range(n):
            d += step
            elev += (grade / 100.0) * step
            pts.append(
                RoutePoint(
                    distance_m=d,
                    elevation_m=elev,
                    lat=46.0 + (d / 111_320.0),
                    lng=11.0,
                )
            )
    total_ascent = sum(max(0.0, length * grade / 100.0) for length, grade in profile)
    return RehearsalRoute(
        points=pts, total_distance_m=d, total_ascent_m=total_ascent,
        name=None, ride_date=None,
    )


class TestBuildSegments:
    def test_covers_the_route_at_the_requested_resolution(self):
        segs = build_segments(_straight_route(80.0), segment_length_m=150.0)
        assert len(segs) == pytest.approx(20, abs=1)   # 3000 m / 150 m
        assert segs[0].start_m == 0.0
        assert segs[-1].start_m + segs[-1].length_m == pytest.approx(3000.0, abs=150.0)

    def test_gradient_matches_the_terrain(self):
        # 80 m per km == 8 %.
        segs = build_segments(_straight_route(80.0))
        mid = segs[len(segs) // 2]
        assert mid.gradient_pct == pytest.approx(8.0, abs=0.5)

    def test_descent_is_negative(self):
        segs = build_segments(_straight_route(-60.0))
        assert segs[len(segs) // 2].gradient_pct == pytest.approx(-6.0, abs=0.5)

    def test_bearing_is_north_for_a_northbound_route(self):
        segs = build_segments(_straight_route(80.0))
        assert segs[0].bearing_deg == pytest.approx(0.0, abs=5.0)


class TestClimbs:
    def test_finds_a_sustained_climb(self):
        segs = build_segments(_straight_route(80.0, length_m=6000.0))
        climbs = detect_climbs(segs)
        assert len(climbs) == 1
        assert climbs[0].elev_gain_m == pytest.approx(480.0, rel=0.1)
        assert climbs[0].avg_grade_pct == pytest.approx(8.0, abs=0.5)

    def test_a_flat_route_has_no_climbs(self):
        assert detect_climbs(build_segments(_straight_route(2.0))) == []

    def test_assign_tags_segments_inside_the_climb(self):
        segs = build_segments(_straight_route(80.0, length_m=6000.0))
        climbs = detect_climbs(segs)
        tagged = assign_climbs(segs, climbs)
        assert any(s.climb_id == climbs[0].climb_id for s in tagged)
        assert len(tagged) == len(segs)


class TestClimbBridging:
    """CLIMB_BRIDGE_M (300 m) must measure real flat/dip terrain, not whatever
    a 150 m pacing segment happens to average. Two 8% climbs either side of a
    recovery are one continuous climb if the recovery is short, or two
    distinct climbs with a real gap if it isn't -- a pacing plan built on one
    long steady climb differs materially from one built on two climbs with a
    recovery between them.
    """

    def test_a_short_dip_bridges_into_one_climb(self):
        # ~200 m of flat between two 700 m 8% ramps: well under the 300 m
        # bridge, so this must read as ONE climb, diluted by the flat middle.
        route = _terrain_route([(700.0, 8.0), (200.0, 0.0), (700.0, 8.0)])
        climbs = find_climbs(route)
        assert len(climbs) == 1
        assert climbs[0].length_m == pytest.approx(1600.0, rel=0.05)
        assert climbs[0].avg_grade_pct == pytest.approx(7.0, abs=1.0)

    def test_a_dip_at_exactly_the_bridge_length_still_merges(self):
        route = _terrain_route([(700.0, 8.0), (300.0, 0.0), (700.0, 8.0)])
        climbs = find_climbs(route)
        assert len(climbs) == 1

    def test_a_dip_past_the_threshold_splits_into_two_climbs(self):
        # This is the bug: a 150 m pacing grid ate ~100-150 m off each end of
        # the dip, so 350-450 m of real flat still read as one climb. On the
        # fine detection grid it must correctly split into two.
        route = _terrain_route([(700.0, 8.0), (400.0, 0.0), (700.0, 8.0)])
        climbs = find_climbs(route)
        assert len(climbs) == 2
        for climb in climbs:
            assert climb.length_m == pytest.approx(700.0, rel=0.05)
            assert climb.avg_grade_pct == pytest.approx(8.0, abs=0.5)

    def test_a_long_descent_between_climbs_still_yields_two_climbs(self):
        # Already-correct baseline (600 m+ / a real descent): must not regress.
        route = _terrain_route([(700.0, 8.0), (700.0, -6.0), (700.0, 8.0)])
        climbs = find_climbs(route)
        assert len(climbs) == 2
        for climb in climbs:
            assert climb.avg_grade_pct == pytest.approx(8.0, abs=0.5)
