"""Route sources → one RehearsalRoute shape.

Everything downstream sees only RehearsalRoute, so adding a fifth source
later costs exactly one adapter and no simulator change.
"""
from __future__ import annotations

from datetime import date

import pytest

from app.services.crew_tour import TrackPoint
from app.services.rehearsal.route_source import (
    RouteUnusable,
    route_from_gpx,
    route_from_track,
)

# ~111 m per 0.001° of latitude, so these three points are ~111 m apart.
_TRACK = [
    TrackPoint(lat=46.500, lng=11.800, elevation_m=1200.0),
    TrackPoint(lat=46.501, lng=11.800, elevation_m=1210.0),
    TrackPoint(lat=46.502, lng=11.800, elevation_m=1205.0),
]


class TestRouteFromTrack:
    def test_accumulates_distance_along_the_track(self):
        r = route_from_track(_TRACK, name="Test climb")
        assert r.points[0].distance_m == 0.0
        assert r.points[1].distance_m == pytest.approx(111.0, abs=3.0)
        assert r.points[2].distance_m == pytest.approx(222.0, abs=6.0)
        assert r.total_distance_m == pytest.approx(r.points[-1].distance_m)

    def test_counts_only_positive_elevation_as_ascent(self):
        # +10 m then -5 m → 10 m of ascent, not 15 and not 5.
        r = route_from_track(_TRACK)
        assert r.total_ascent_m == pytest.approx(10.0, abs=0.01)

    def test_carries_name_and_ride_date(self):
        r = route_from_track(_TRACK, name="Maratona", ride_date=date(2026, 7, 5))
        assert r.name == "Maratona"
        assert r.ride_date == date(2026, 7, 5)

    def test_rejects_a_track_with_no_elevation(self):
        # Many exports carry no <ele>. We refuse rather than invent terrain:
        # a fabricated flat route would produce a confident, wrong time.
        flat = [TrackPoint(lat=52.5, lng=13.4, elevation_m=None) for _ in range(3)]
        with pytest.raises(RouteUnusable, match="elevation"):
            route_from_track(flat)

    def test_rejects_a_track_too_short_to_simulate(self):
        # A single ~111 m segment: below MIN_ROUTE_DISTANCE_M (200 m).
        short = [
            TrackPoint(lat=46.500, lng=11.800, elevation_m=1200.0),
            TrackPoint(lat=46.501, lng=11.800, elevation_m=1210.0),
        ]
        with pytest.raises(RouteUnusable, match="short"):
            route_from_track(short)


class TestRouteFromGpx:
    def test_parses_and_adapts(self):
        gpx = """<?xml version="1.0"?>
        <gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
          <trk><trkseg>
            <trkpt lat="46.500" lon="11.800"><ele>1200</ele></trkpt>
            <trkpt lat="46.501" lon="11.800"><ele>1210</ele></trkpt>
            <trkpt lat="46.502" lon="11.800"><ele>1205</ele></trkpt>
          </trkseg></trk>
        </gpx>"""
        r = route_from_gpx(gpx, name="From file")
        assert len(r.points) == 3
        assert r.name == "From file"
        assert r.total_ascent_m == pytest.approx(10.0, abs=0.01)
