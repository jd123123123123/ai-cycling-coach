"""How a track is reduced decides whether a rider recognises their own ride.

The numbers in these tests were measured on the Maratona dles Dolomites course
(138.6 km, 4 416 points, seven passes) — a real export, chosen because
switchbacks are the only thing that tells an honest reduction from a flattering
one.
"""
import math

from app.services.activity_stream_analysis import (
    ROUTE_DETAIL_POINTS,
    ROUTE_DETAIL_TOLERANCE_M,
    ROUTE_SKETCH_POINTS,
    route_sketch_polyline,
)


def _switchbacks(passes: int = 7, per: int = 40, straight: int = 300) -> dict:
    """A synthetic Alpine profile: long straight valleys between tight hairpins.

    This is the shape that separates the two algorithms. An even stride spends
    its budget uniformly, so most of it goes on the straights where nothing
    happens and the hairpins fall between samples.
    """
    lat: list[float] = []
    lng: list[float] = []
    la, lo = 46.5, 11.9
    for p in range(passes):
        for i in range(straight):          # a valley road, dead straight
            la += 0.00012
            lat.append(la); lng.append(lo)
        for i in range(per):               # then a set of hairpins
            la += 0.00025
            lo += 0.0016 if (i // 4) % 2 else -0.0016
            lat.append(la); lng.append(lo)
    return {"latitude": lat, "longitude": lng}


def _traced_km(poly) -> float:
    r = 6371.0
    out = 0.0
    for a, b in zip(poly, poly[1:]):
        p1, p2 = math.radians(a[0]), math.radians(b[0])
        dl = math.radians(b[1] - a[1])
        x = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        out += 2 * r * math.asin(math.sqrt(x))
    return out


def test_the_reduction_keeps_the_corners_a_stride_would_miss():
    """THE WHOLE POINT. Douglas-Peucker spends points where the line CHANGES;
    an even stride spends them evenly and therefore mostly on the straights.

    Measured on the real Maratona at the SAME budget: the strided sketch traced
    87.3 km of a 138.6 km ride with a worst deviation of 1 316 m, and the
    shape-aware one traced 102.3 km at 425 m. Here the same effect is asserted
    against a track whose straights and hairpins are known by construction.
    """
    s = _switchbacks()
    full = _traced_km(list(zip(s["latitude"], s["longitude"])))
    detail = route_sketch_polyline(s, max_points=ROUTE_DETAIL_POINTS,
                                   tolerance_m=ROUTE_DETAIL_TOLERANCE_M)
    assert detail is not None
    # Within a couple of percent of the real road, where an even stride at this
    # budget loses a third of it.
    assert _traced_km(detail) > full * 0.97


def test_it_spends_nothing_on_a_straight_line():
    """A dead-straight ride needs two points, whatever its budget. An even
    stride would return the full 48 and call it a sketch."""
    n = 2000
    s = {"latitude": [52.5 + i * 1e-5 for i in range(n)], "longitude": [13.4] * n}
    out = route_sketch_polyline(s)
    assert out is not None
    assert len(out) <= 4


def test_the_budget_is_a_ceiling_and_the_ends_always_survive():
    """A track wiggly enough to defeat the tolerance still comes back
    simplified rather than truncated — and a route that has lost its start or
    its finish is not that route."""
    s = _switchbacks(passes=14, per=90, straight=40)
    out = route_sketch_polyline(s, max_points=ROUTE_SKETCH_POINTS)
    assert out is not None
    assert len(out) <= ROUTE_SKETCH_POINTS
    assert out[0] == [s["latitude"][0], s["longitude"][0]]
    assert out[-1] == [s["latitude"][-1], s["longitude"][-1]]


def test_a_short_track_is_returned_untouched():
    """Below the budget there is nothing to decide, and simplifying anyway
    would move points for no reason."""
    s = {"latitude": [52.0, 52.1, 52.2], "longitude": [13.0, 13.1, 13.05]}
    assert route_sketch_polyline(s) == [[52.0, 13.0], [52.1, 13.1], [52.2, 13.05]]


def test_no_gps_is_still_none():
    assert route_sketch_polyline({}) is None
    assert route_sketch_polyline({"latitude": [1.0], "longitude": [2.0]}) is None
    assert route_sketch_polyline(None) is None


def test_longitude_is_scaled_so_a_metre_means_one_thing():
    """Without the cos(lat) correction a tolerance is ~1.5x looser east-west at
    Alpine latitudes, and the reduction quietly straightens the wrong corners:
    an east-west hairpin would be dropped where an identical north-south one
    survives."""
    def zigzag(axis: str, lat0: float) -> int:
        lat, lng = [], []
        for i in range(600):
            d = 0.0008 if (i // 3) % 2 else -0.0008
            lat.append(lat0 + (d if axis == "ns" else 0) + i * 1e-5)
            lng.append(11.9 + (d if axis == "ew" else 0))
        out = route_sketch_polyline({"latitude": lat, "longitude": lng},
                                    max_points=ROUTE_DETAIL_POINTS, tolerance_m=20)
        return len(out or [])

    ns, ew = zigzag("ns", 46.5), zigzag("ew", 46.5)
    # Same physical zigzag, so the same number of points should survive it.
    assert abs(ns - ew) <= max(4, 0.1 * max(ns, ew))


# ── gradient, the one thing a cycling map can say ───────────────────────────

def test_gradient_is_smoothed_hard_enough_to_survive_a_real_file():
    """Gradient is a DERIVATIVE, so it amplifies whatever the altimeter did.
    The Maratona export steps more than 5 m between adjacent points 620 times
    over a median spacing of 18 m — single steps range −37 % to +36 % on roads
    that never exceed about 12 %. Without a wide window and a ceiling, a map
    paints 45 % walls across a Dolomites pass."""
    from app.services.activity_stream_analysis import route_grades

    n = 900
    lat = [46.5 + i * 0.00009 for i in range(n)]          # ~10 m apart
    lng = [11.9] * n
    # A steady 6 % climb, with the kind of jitter a barometer actually produces.
    alt = [1000 + i * 0.6 + (7.0 if i % 3 == 0 else -7.0) for i in range(n)]
    poly = [[a, b] for a, b in zip(lat, lng)]
    g = route_grades({"latitude": lat, "longitude": lng, "altitude": alt}, poly)

    assert g is not None and len(g) == len(poly)
    middle = g[len(g) // 4: -len(g) // 4]
    # The real gradient is 6 %; the raw jitter alone is ±140 %.
    assert all(2.0 < x < 11.0 for x in middle), (min(middle), max(middle))


def test_gradient_is_capped_at_what_a_road_can_be():
    from app.services.activity_stream_analysis import _GRADE_MAX_PCT, route_grades

    n = 400
    lat = [46.5 + i * 0.00009 for i in range(n)]
    lng = [11.9] * n
    alt = [1000 + i * 8.0 for i in range(n)]   # an absurd 80 %
    g = route_grades({"latitude": lat, "longitude": lng, "altitude": alt},
                     [[a, b] for a, b in zip(lat, lng)])
    assert g is not None
    assert max(g) <= _GRADE_MAX_PCT


def test_gradient_lines_up_with_the_line_that_is_drawn():
    """The polyline the client gets is simplified, and on a matched ride it is
    the ROAD's geometry, which shares no points with the recording. One colour
    per vertex is what MapLibre needs, so the lengths must agree however the
    line was produced."""
    from app.services.activity_stream_analysis import (
        ROUTE_DETAIL_POINTS, ROUTE_DETAIL_TOLERANCE_M, route_grades, route_sketch_polyline,
    )
    n = 3000
    lat = [46.5 + i * 0.00003 for i in range(n)]
    lng = [11.9 + (0.0004 if (i // 50) % 2 else -0.0004) for i in range(n)]
    alt = [1000 + i * 0.2 for i in range(n)]
    s = {"latitude": lat, "longitude": lng, "altitude": alt}
    poly = route_sketch_polyline(s, max_points=ROUTE_DETAIL_POINTS,
                                 tolerance_m=ROUTE_DETAIL_TOLERANCE_M)
    assert poly is not None and len(poly) < n
    assert len(route_grades(s, poly)) == len(poly)


def test_no_altitude_means_no_claim_about_terrain():
    from app.services.activity_stream_analysis import route_grades

    poly = [[46.5, 11.9], [46.6, 11.9], [46.7, 11.9], [46.8, 11.9]]
    assert route_grades({"latitude": [46.5], "longitude": [11.9]}, poly) is None
    assert route_grades({}, poly) is None
    assert route_grades({"altitude": [1, 2, 3, 4]}, None) is None
