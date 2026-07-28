"""Tests for GPX tour parsing — in particular the elevation profile, the total
descent, and the ≥100 m sustained-gradient rule that exists to stop barometric
noise from being reported as a 40 % wall.
"""
from __future__ import annotations

import math

from app.services.crew_tour import MAX_PROFILE_POINTS, MAX_WAYPOINTS, parse_gpx


def _gpx(points: list[tuple[float, float, float | None]]) -> str:
    """Build a one-track GPX from (lat, lon, ele) tuples; ele=None omits <ele>."""
    trkpts = []
    for lat, lon, ele in points:
        ele_tag = "" if ele is None else f"<ele>{ele}</ele>"
        trkpts.append(f'<trkpt lat="{lat:.6f}" lon="{lon:.6f}">{ele_tag}</trkpt>')
    body = "".join(trkpts)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<gpx version="1.1" creator="test" '
        'xmlns="http://www.topografix.com/GPX/1/1">'
        f"<trk><trkseg>{body}</trkseg></trk></gpx>"
    )


# One degree of latitude is ~111_320 m; stepping latitude keeps the maths simple.
_M_PER_DEG_LAT = 111_320.0


def _lat_for(metres: float, base: float = 46.0) -> float:
    return base + metres / _M_PER_DEG_LAT


def _straight_climb(
    n: int, spacing_m: float, elevations: list[float]
) -> list[tuple[float, float, float | None]]:
    """n points due north, `spacing_m` apart, with the given elevations."""
    return [(_lat_for(i * spacing_m), 7.0, elevations[i]) for i in range(n)]


# ── profile shape ─────────────────────────────────────────────────────────


def test_profile_has_cumulative_distance_and_elevation():
    # 5 points 100 m apart climbing 10 m each step.
    pts = _straight_climb(5, 100.0, [1000.0, 1010.0, 1020.0, 1030.0, 1040.0])
    out = parse_gpx(_gpx(pts))

    assert len(out.profile) == 5
    assert out.profile[0][0] == 0.0
    assert out.profile[0][1] == 1000.0
    # Cumulative distance ≈ 400 m at the last point (haversine, so ~1 % slack).
    assert math.isclose(out.profile[-1][0], 400.0, rel_tol=0.02)
    assert out.profile[-1][1] == 1040.0
    # Monotonically non-decreasing x-axis — the chart depends on it.
    xs = [p[0] for p in out.profile]
    assert xs == sorted(xs)


def test_profile_downsampled_to_cap_and_stays_monotonic():
    # 600 points → must come back at or under the 120-point cap.
    n = 600
    eles = [1000.0 + 5.0 * math.sin(i / 20.0) for i in range(n)]
    out = parse_gpx(_gpx(_straight_climb(n, 10.0, eles)))

    assert 2 <= len(out.profile) <= MAX_PROFILE_POINTS
    xs = [p[0] for p in out.profile]
    assert xs == sorted(xs)
    # First and last samples survive downsampling.
    assert out.profile[0][0] == 0.0
    assert math.isclose(out.profile[-1][0], (n - 1) * 10.0, rel_tol=0.02)


def test_no_elevation_data_gives_empty_profile_and_no_grade():
    pts = [(_lat_for(i * 100.0), 7.0, None) for i in range(6)]
    out = parse_gpx(_gpx(pts))

    assert out.profile == []
    assert out.max_grade_pct is None
    # Distance still parses; ascent/descent are honestly zero, not fabricated.
    assert out.distance_m > 0
    assert out.elevation_m == 0.0
    assert out.descent_m == 0.0


# ── descent ───────────────────────────────────────────────────────────────


def test_descent_is_positive_and_separate_from_ascent():
    """Climb 100 m over 1 km, then give back 60 m. Exact figures are gpxpy's
    (it applies its own smoothing to uphill/downhill, same as the pre-existing
    ascent field); what matters here is that descent is a separate, positive
    magnitude rather than a sign-flipped copy of the ascent."""
    n = 21
    eles = [1000.0 + 10.0 * i for i in range(11)]  # +100 m over 1 km
    eles += [eles[-1] - 6.0 * (i + 1) for i in range(10)]  # −60 m over 1 km
    out = parse_gpx(_gpx(_straight_climb(n, 100.0, eles)))

    assert out.elevation_m > 50.0
    assert out.descent_m > 30.0
    assert out.descent_m > 0  # positive magnitude, never signed
    assert out.elevation_m > out.descent_m


# ── the ≥100 m sustained-gradient window ──────────────────────────────────


def test_grade_window_suppresses_single_point_barometric_spike():
    """A +3 m barometric blip across one 6 m step is a 50 % per-point delta and
    ~0 % once averaged over 100 m. The reported grade must be the latter."""
    n = 60
    spacing = 6.0  # realistic Garmin 1 Hz spacing on a flat road
    eles = [100.0] * n
    eles[30] = 103.0  # noise spike: up 3 m and straight back down

    out = parse_gpx(_gpx(_straight_climb(n, spacing, eles)))

    naive = 3.0 / spacing * 100.0  # what max-of-per-point-deltas would report
    assert naive > 40.0  # the absurd number we are explicitly avoiding
    assert out.max_grade_pct is not None
    assert out.max_grade_pct < 4.0  # 3 m spread over ≥100 m of travel


def test_grade_reports_a_genuinely_steep_sustained_ramp():
    """A real 12 % ramp sustained over ~200 m must survive the smoothing."""
    n = 40
    spacing = 10.0
    eles = [1000.0]
    for i in range(1, n):
        # Flat for the first 100 m, then 12 % for 200 m, then flat again.
        dist = i * spacing
        if 100.0 < dist <= 300.0:
            eles.append(eles[-1] + spacing * 0.12)
        else:
            eles.append(eles[-1])

    out = parse_gpx(_gpx(_straight_climb(n, spacing, eles)))

    assert out.max_grade_pct is not None
    assert 10.0 <= out.max_grade_pct <= 13.0


def test_grade_falls_back_to_whole_route_when_shorter_than_the_window():
    # Only ~40 m long: no 100 m window exists, so the whole route is the sample.
    pts = _straight_climb(5, 10.0, [100.0, 101.0, 102.0, 103.0, 104.0])
    out = parse_gpx(_gpx(pts))

    assert out.max_grade_pct is not None
    assert 8.0 <= out.max_grade_pct <= 12.0  # 4 m over ~40 m ≈ 10 %


def test_partial_elevation_data_still_yields_a_profile():
    # Some exports drop <ele> on a few points; the rest must still chart.
    pts = _straight_climb(6, 100.0, [1000.0, 1010.0, 1020.0, 1030.0, 1040.0, 1050.0])
    pts[2] = (pts[2][0], pts[2][1], None)
    out = parse_gpx(_gpx(pts))

    assert len(out.profile) == 5  # the None-elevation point is dropped
    xs = [p[0] for p in out.profile]
    assert xs == sorted(xs)
    assert out.max_grade_pct is not None


# ── named waypoints (labelled map pins) ───────────────────────────────────


def _wpt(lat: float, lon: float, inner: str) -> str:
    return f'<wpt lat="{lat:.6f}" lon="{lon:.6f}">{inner}</wpt>'


def _gpx_with_waypoints(
    points: list[tuple[float, float, float | None]], wpts: list[str]
) -> str:
    """Same one-track GPX as _gpx, plus raw <wpt> elements (GPX 1.1 requires
    waypoints before tracks)."""
    track = _gpx(points)
    return track.replace("<trk>", "".join(wpts) + "<trk>", 1)


def test_named_waypoints_parsed_with_coords_and_symbol():
    pts = _straight_climb(6, 100.0, [100.0] * 6)
    wpts = [
        _wpt(
            _lat_for(0.0),
            7.0,
            "<name>Starnberger See</name><sym>Water</sym><desc>Lake stop</desc>",
        ),
        _wpt(_lat_for(500.0), 7.0, "<name>Kloster Andechs</name><sym>Church</sym>"),
    ]
    out = parse_gpx(_gpx_with_waypoints(pts, wpts))

    assert [w["name"] for w in out.waypoints] == [
        "Starnberger See",
        "Kloster Andechs",
    ]
    first = out.waypoints[0]
    assert first["sym"] == "Water"
    assert first["desc"] == "Lake stop"
    assert first["lat"] == round(_lat_for(0.0), 5)
    assert first["lng"] == 7.0
    # desc is optional and stays honestly null rather than "".
    assert out.waypoints[1]["desc"] is None
    # The track is untouched by the waypoints.
    assert len(out.polyline) == 6


def test_waypoint_without_a_usable_name_is_dropped():
    """An unlabelled pin is noise on a map, so it never reaches the frontend —
    but a <desc>-only or <type>-only pin still has something to render."""
    pts = _straight_climb(4, 100.0, [100.0] * 4)
    wpts = [
        _wpt(_lat_for(0.0), 7.0, "<sym>Flag</sym>"),  # no name at all → dropped
        _wpt(_lat_for(50.0), 7.0, "<name>   </name>"),  # whitespace → dropped
        _wpt(_lat_for(100.0), 7.0, "<desc>Coffee stop</desc>"),  # desc fallback
        _wpt(_lat_for(200.0), 7.0, "<type>Summit</type>"),  # type fallback
    ]
    out = parse_gpx(_gpx_with_waypoints(pts, wpts))

    assert [w["name"] for w in out.waypoints] == ["Coffee stop", "Summit"]


def test_waypoints_capped_and_de_clustered_along_the_route():
    """A Garmin-style export with a cluster of cue points at one junction plus a
    handful of real landmarks: the cap must keep the spread-out pins, not the
    first 12 in file order (which are all the same roundabout)."""
    pts = _straight_climb(101, 100.0, [100.0] * 101)  # 10 km of track
    cluster = [
        _wpt(_lat_for(50.0 + i), 7.0, f"<name>Cue {i}</name>") for i in range(30)
    ]
    landmarks = [
        _wpt(_lat_for(d), 7.0, f"<name>Landmark {d}</name>")
        for d in (2000.0, 4000.0, 6000.0, 8000.0, 10000.0)
    ]
    out = parse_gpx(_gpx_with_waypoints(pts, cluster + landmarks))

    assert len(out.waypoints) == MAX_WAYPOINTS
    names = [w["name"] for w in out.waypoints]
    # Every spread-out landmark survives; the 30-strong cluster contributes only
    # a couple of representatives instead of swallowing the whole budget.
    for d in (2000.0, 4000.0, 6000.0, 8000.0, 10000.0):
        assert f"Landmark {d}" in names
    assert sum(1 for n in names if n.startswith("Cue ")) <= 7


def test_waypoint_only_file_yields_both_a_polyline_and_waypoints():
    """No <trk> and no <rte>: the waypoints are the only coordinates, so they
    must still drive the polyline AND now also surface as named pins."""
    wpts = [
        _wpt(_lat_for(0.0), 7.0, "<name>Start</name>"),
        _wpt(_lat_for(1000.0), 7.0, "<name>Middle</name>"),
        _wpt(_lat_for(2000.0), 7.0, "<name>Finish</name>"),
    ]
    gpx = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<gpx version="1.1" creator="test" '
        'xmlns="http://www.topografix.com/GPX/1/1">'
        f"{''.join(wpts)}</gpx>"
    )
    out = parse_gpx(gpx)

    assert len(out.polyline) == 3
    assert [w["name"] for w in out.waypoints] == ["Start", "Middle", "Finish"]


def test_file_without_waypoints_yields_empty_list():
    out = parse_gpx(_gpx(_straight_climb(5, 100.0, [100.0] * 5)))

    assert out.waypoints == []  # never invented
