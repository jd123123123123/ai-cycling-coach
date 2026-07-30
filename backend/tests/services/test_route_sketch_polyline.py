"""route_sketch_polyline — the history list's per-ride route thumbnail source.

The list had no route data at all before this: tracks lived only behind the
per-ride stream endpoint, one request each, unusable for a list. The thumbnail
that stood in for them was a procedurally generated ridge seeded from the
activity id, which encoded nothing about the ride.
"""
from __future__ import annotations

from app.services.activity_stream_analysis import route_sketch_polyline


class TestRouteSketchPolyline:
    def test_none_without_gps_channels(self):
        assert route_sketch_polyline({"power": [200, 210]}) is None
        assert route_sketch_polyline(None) is None
        assert route_sketch_polyline({}) is None

    def test_none_for_a_single_point(self):
        assert route_sketch_polyline({"latitude": [47.1], "longitude": [9.1]}) is None

    def test_pairs_lat_lng_and_skips_gaps(self):
        out = route_sketch_polyline(
            {"latitude": [47.0, None, 47.2], "longitude": [9.0, 9.1, 9.2]}
        )
        # The None-latitude sample is dropped whole — never paired with the
        # next ride's longitude, which would bend the track sideways.
        assert out == [[47.0, 9.0], [47.2, 9.2]]

    def test_caps_the_point_count_and_keeps_the_endpoints(self):
        lat = [47.0 + i / 10000 for i in range(5000)]
        lng = [9.0 + i / 10000 for i in range(5000)]
        out = route_sketch_polyline({"latitude": lat, "longitude": lng})
        assert out is not None
        assert len(out) <= 48
        assert len(out[0]) == 2
        assert out[0] == [47.0, 9.0]
        assert out[-1] == [lat[-1], lng[-1]]

    def test_short_tracks_pass_through_unchanged(self):
        pts = {"latitude": [47.0, 47.1, 47.2], "longitude": [9.0, 9.1, 9.2]}
        assert route_sketch_polyline(pts) == [[47.0, 9.0], [47.1, 9.1], [47.2, 9.2]]


class TestJsonChannelNormalisation:
    """`streams -> 'latitude'` comes back parsed on some driver/type
    combinations and as raw JSON text on others. The list endpoint normalises
    it, because an unparsed channel would yield no polyline at all — which the
    client would render as "this ride has no GPS"."""

    def test_raw_json_text_is_parsed(self):
        from app.api.activities import _as_points

        assert _as_points("[47.0, 47.1]") == [47.0, 47.1]

    def test_lists_pass_through(self):
        from app.api.activities import _as_points

        assert _as_points([47.0, 47.1]) == [47.0, 47.1]

    def test_unusable_values_become_none(self):
        from app.api.activities import _as_points

        assert _as_points(None) is None
        assert _as_points("not json") is None
        assert _as_points('{"lat": 1}') is None
        assert _as_points(42) is None
