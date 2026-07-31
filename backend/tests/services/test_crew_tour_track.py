"""parse_gpx_track — full-resolution points for the rehearsal simulator.

parse_gpx's profile is capped at 120 points, which is fine for a card-sized
elevation chart and useless for simulating 150 m segments over a 138 km route.
"""
from __future__ import annotations

import pytest

from app.services.crew_tour import parse_gpx_track

_GPX = """<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="46.50" lon="11.80"><ele>1200.0</ele></trkpt>
    <trkpt lat="46.51" lon="11.81"><ele>1250.5</ele></trkpt>
    <trkpt lat="46.52" lon="11.82"><ele>1310.0</ele></trkpt>
  </trkseg></trk>
</gpx>"""

_GPX_NO_ELE = """<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="52.50" lon="13.40"/>
    <trkpt lat="52.51" lon="13.41"/>
  </trkseg></trk>
</gpx>"""


class TestParseGpxTrack:
    def test_returns_every_point_not_a_downsample(self):
        pts = parse_gpx_track(_GPX)
        assert len(pts) == 3
        assert pts[0].lat == pytest.approx(46.50)
        assert pts[0].lng == pytest.approx(11.80)
        assert pts[0].elevation_m == pytest.approx(1200.0)
        assert pts[-1].elevation_m == pytest.approx(1310.0)

    def test_elevation_is_none_when_the_file_carries_none(self):
        pts = parse_gpx_track(_GPX_NO_ELE)
        assert len(pts) == 2
        assert all(p.elevation_m is None for p in pts)

    def test_unparseable_input_raises_value_error(self):
        with pytest.raises(ValueError):
            parse_gpx_track("not a gpx file at all")

    def test_file_without_track_points_raises_value_error(self):
        empty = '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"></gpx>'
        with pytest.raises(ValueError):
            parse_gpx_track(empty)
