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


class TestRouteFromActivity:
    def test_builds_a_route_from_stream_channels(self):
        from app.services.rehearsal.route_source import route_from_activity

        lat = [46.0 + i * 0.0005 for i in range(40)]
        lng = [11.0] * 40
        alt = [1000.0 + i * 4 for i in range(40)]
        r = route_from_activity(lat, lng, alt, name="Last Sunday")
        assert r.name == "Last Sunday"
        assert r.total_distance_m > 0
        assert r.total_ascent_m == pytest.approx(156.0, rel=0.05)

    def test_skips_samples_with_no_fix(self):
        from app.services.rehearsal.route_source import route_from_activity

        lat = [46.0, None, 46.001, 46.002]
        lng = [11.0, 11.0, None, 11.0]
        alt = [1000.0, 1001.0, 1002.0, 1003.0]
        r = route_from_activity(lat, lng, alt)
        # The two samples missing a coordinate are dropped whole, never paired
        # with the next sample's other half.
        assert len(r.points) == 2

    def test_refuses_an_indoor_ride(self):
        from app.services.rehearsal.route_source import route_from_activity

        with pytest.raises(RouteUnusable, match="no GPS"):
            route_from_activity([None] * 20, [None] * 20, [None] * 20)

    def test_refuses_a_ride_whose_altitude_channel_is_missing(self):
        """A GPS ride with no barometric/altitude channel is refused by name.

        Falling back to "too short" would send the athlete looking for a
        longer route when the real problem is that the head unit recorded no
        elevation -- and inventing flat terrain would be worse still.
        """
        from app.services.rehearsal.route_source import route_from_activity

        lat = [46.0 + i * 0.0005 for i in range(40)]
        lng = [11.0] * 40
        with pytest.raises(RouteUnusable, match="elevation"):
            route_from_activity(lat, lng, [])


class TestRouteFromCrewEvent:
    _GPX = """<?xml version="1.0"?>
<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
""" + "\n".join(
        f'    <trkpt lat="{46.0 + i * 0.0005:.4f}" lon="11.0"><ele>{1000 + i * 4}</ele></trkpt>'
        for i in range(40)
    ) + """
  </trkseg></trk>
</gpx>"""

    def test_reads_the_original_file_at_full_resolution(self, tmp_path):
        """All 40 points, not the ≤120-point card profile the event row caches.

        The event's stored `tour_profile` is a chart; simulating needs every
        point, so this must come off disk.
        """
        from app.services.rehearsal.route_source import route_from_crew_event

        path = tmp_path / "7.gpx"
        path.write_text(self._GPX)
        r = route_from_crew_event(
            str(path), name="Sunrise loop", ride_date=date(2026, 8, 2)
        )
        assert len(r.points) == 40
        assert r.name == "Sunrise loop"
        assert r.ride_date == date(2026, 8, 2)

    def test_a_missing_file_is_refused_with_a_reason(self, tmp_path):
        from app.services.rehearsal.route_source import route_from_crew_event

        with pytest.raises(RouteUnusable, match="no longer"):
            route_from_crew_event(str(tmp_path / "nope.gpx"))
