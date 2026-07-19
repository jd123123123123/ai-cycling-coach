"""Tests for the pure clustering/summarising parts of route_library."""
from app.services.route_library import (
    MAX_POLYLINE_POINTS,
    build_ride,
    cluster_rides,
    elevation_gain_m,
    haversine_m,
    is_virtual_title,
    same_route,
    simplify_polyline,
    summarize_route,
    summarize_routes,
)

# ~0.00450° latitude ≈ 500 m; ~0.00090° ≈ 100 m at any longitude.
LAT_100M = 0.00090


# ── helpers ──────────────────────────────────────────────────────────────────

def _ride(
    *,
    lat=44.0,
    lng=7.0,
    distance_m=40000.0,
    duration_s=5400,
    title="Morning Loop",
    date="2026-07-01",
    elevation_m=500.0,
    is_virtual=False,
    activity_id=1,
):
    """A cluster-candidate dict as build_ride would emit."""
    return {
        "activity_id": activity_id,
        "title": title,
        "date": date,
        "distance_m": distance_m,
        "duration_s": duration_s,
        "start_lat": lat,
        "start_lng": lng,
        "elevation_m": elevation_m,
        "polyline": [[lat, lng], [lat + 0.01, lng + 0.01]],
        "is_virtual": is_virtual,
    }


def _streams(n=3600, lat0=44.0, lng0=7.0, climb_per_s=0.0, with_gps=True):
    """Synthetic 1 Hz streams: constant 8 m/s, optional steady climb."""
    lat, lng, alt, dist = [], [], [], []
    a, d = 100.0, 0.0
    for i in range(n):
        lat.append(lat0 + i * 0.00001)
        lng.append(lng0)
        alt.append(a)
        dist.append(d)
        a += climb_per_s
        d += 8.0
    streams = {"altitude": alt, "distance": dist}
    if with_gps:
        streams["latitude"] = lat
        streams["longitude"] = lng
    return streams


# ── geometry helpers ─────────────────────────────────────────────────────────

def test_haversine_known_distance():
    # 0.00450° of latitude ≈ 500 m
    assert abs(haversine_m(44.0, 7.0, 44.0045, 7.0) - 500.0) < 10.0


def test_simplify_polyline_caps_points_and_keeps_endpoints():
    track = [(44.0 + i * 0.0001, 7.0 + i * 0.0001) for i in range(1000)]
    poly = simplify_polyline(track)
    assert len(poly) == MAX_POLYLINE_POINTS
    assert poly[0] == [round(track[0][0], 5), round(track[0][1], 5)]
    assert poly[-1] == [round(track[-1][0], 5), round(track[-1][1], 5)]


def test_simplify_polyline_short_track_passes_through():
    track = [(44.0, 7.0), (44.1, 7.1), (44.2, 7.2)]
    assert simplify_polyline(track) == [[44.0, 7.0], [44.1, 7.1], [44.2, 7.2]]


def test_elevation_gain_from_steady_climb():
    # 3600 s at +0.1 m/s = 360 m of ascent
    gain = elevation_gain_m(_streams(climb_per_s=0.1)["altitude"])
    assert gain is not None
    assert abs(gain - 360.0) < 10.0


def test_elevation_gain_none_without_altitude():
    assert elevation_gain_m(None) is None
    assert elevation_gain_m([]) is None
    assert elevation_gain_m([None] * 100) is None


# ── virtual detection ────────────────────────────────────────────────────────

def test_virtual_title_heuristic():
    assert is_virtual_title("Zwift - Watopia Flat")
    assert is_virtual_title("ROUVY: Stelvio")
    assert is_virtual_title("Kinomap session")
    assert is_virtual_title("Indoor spin")
    assert not is_virtual_title("Morning Loop")
    assert not is_virtual_title(None)


# ── build_ride ───────────────────────────────────────────────────────────────

def test_build_ride_without_gps_is_none():
    assert build_ride(_streams(with_gps=False), title="Trainer ride") is None
    assert build_ride({}, title="Empty") is None


def test_build_ride_short_blip_is_none():
    # 100 samples × 8 m/s = 800 m < 2 km minimum
    assert build_ride(_streams(n=100)) is None


def test_build_ride_uses_stream_fallbacks():
    ride = build_ride(_streams(n=3600), title="Loop", date="2026-07-01")
    assert ride is not None
    assert abs(ride["distance_m"] - 3600 * 8.0) < 10.0
    assert ride["duration_s"] == 3600
    assert ride["start_lat"] == 44.0
    assert len(ride["polyline"]) <= MAX_POLYLINE_POINTS
    assert not ride["is_virtual"]


def test_build_ride_prefers_summary_values():
    ride = build_ride(_streams(), distance_m=41000.0, duration_s=5000)
    assert ride is not None
    assert ride["distance_m"] == 41000.0
    assert ride["duration_s"] == 5000


# ── clustering rules ─────────────────────────────────────────────────────────

def test_same_route_groups_similar_rides():
    a = _ride()
    b = _ride(lat=44.0 + LAT_100M, distance_m=41000.0, duration_s=5700)
    assert same_route(a, b)


def test_far_start_splits():
    a = _ride()
    b = _ride(lat=45.0)  # ~111 km away
    assert not same_route(a, b)


def test_distance_beyond_ten_percent_splits():
    a = _ride(distance_m=40000.0)
    assert same_route(a, _ride(distance_m=43900.0))       # within ±10 %
    assert not same_route(a, _ride(distance_m=45000.0))   # 12.5 % apart


def test_duration_shape_splits():
    a = _ride(duration_s=3600)
    assert not same_route(a, _ride(duration_s=7200))  # 2× duration ≠ same shape


def test_missing_duration_falls_back_to_start_plus_distance():
    a = _ride(duration_s=None)
    assert same_route(a, _ride(duration_s=5400))


def test_cluster_rides_grouping():
    rides = [
        _ride(date="2026-07-03"),
        _ride(date="2026-07-02", lat=44.0 + LAT_100M),
        _ride(date="2026-07-01", lat=46.0, title="Other Ride"),
    ]
    groups = cluster_rides(rides)
    assert sorted(len(g) for g in groups) == [1, 2]


# ── summarising ──────────────────────────────────────────────────────────────

def test_summarize_route_fields():
    group = [
        _ride(date="2026-07-03", duration_s=5400, title="Morning Loop"),
        _ride(date="2026-07-01", duration_s=5100, title="Morning Loop"),
        _ride(date="2026-06-20", duration_s=6000, title="Lunch Ride"),
    ]
    s = summarize_route(group)
    assert s["name"] == "Morning Loop"      # most common title wins
    assert s["times_ridden"] == 3
    assert s["best_time_s"] == 5100
    assert s["avg_time_s"] == round((5400 + 5100 + 6000) / 3)
    assert s["last_ridden"] == "2026-07-03"
    assert s["distance_km"] == 40.0
    assert s["elevation_m"] == 500
    assert not s["is_virtual"]
    assert s["start_lat"] == 44.0
    assert s["polyline"]  # sketch comes from the most recent ride


def test_summarize_route_virtual_majority():
    group = [
        _ride(title="Zwift - Watopia", is_virtual=True),
        _ride(title="Zwift - Watopia", is_virtual=True),
        _ride(title="Mislabelled", is_virtual=False),
    ]
    assert summarize_route(group)["is_virtual"]


def test_summarize_route_handles_missing_optionals():
    s = summarize_route([_ride(duration_s=None, elevation_m=None, date=None, title=None)])
    assert s["best_time_s"] is None
    assert s["avg_time_s"] is None
    assert s["elevation_m"] is None
    assert s["last_ridden"] is None
    assert s["name"] is None
    assert s["times_ridden"] == 1


def test_summarize_routes_sorted_by_times_ridden():
    rides = [
        _ride(date="2026-07-05", lat=46.0, title="Rare Ride"),
        _ride(date="2026-07-04"),
        _ride(date="2026-07-03"),
        _ride(date="2026-07-02"),
    ]
    routes = summarize_routes(rides)
    assert [r["times_ridden"] for r in routes] == [3, 1]
    assert routes[0]["name"] == "Morning Loop"
