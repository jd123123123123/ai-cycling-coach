"""One ride's route is a different payload from a list of thumbnails.

Both come out of `route_sketch_polyline`; only the point budget differs, and
that budget is the whole difference between a map a rider recognises and a
shape that is confidently wrong.
"""
import inspect
import json

from app.api import activities
from app.services.activity_stream_analysis import (
    ROUTE_DETAIL_POINTS,
    ROUTE_SKETCH_POINTS,
    route_sketch_polyline,
)


def _switchbacks(n: int) -> dict:
    """A climb of tight hairpins — the case a coarse sketch destroys."""
    lat, lng = [], []
    for i in range(n):
        t = i / (n - 1)
        lat.append(47.0 + t * 0.05)
        lng.append(11.0 + (0.004 if (i // 12) % 2 else -0.004))
    return {"latitude": lat, "longitude": lng}


def test_the_detail_route_is_far_denser_than_a_thumbnail():
    """48 points over a 50 km ride is a point every kilometre: every bend cut,
    every switchback a straight line. A rider looking at roads they know sees a
    ride they did not do."""
    assert ROUTE_DETAIL_POINTS > 10 * ROUTE_SKETCH_POINTS


def test_a_hairpin_climb_survives_the_detail_budget_and_not_the_sketch():
    """THE FAILURE, made concrete. The same track, sampled two ways: the
    thumbnail budget cannot carry the corners and the detail budget can."""
    s = _switchbacks(3000)
    sketch = route_sketch_polyline(s)
    detail = route_sketch_polyline(s, max_points=ROUTE_DETAIL_POINTS)
    assert sketch is not None and detail is not None

    # Count direction reversals in longitude — one per hairpin that survived.
    def turns(poly):
        d = [b[1] - a[1] for a, b in zip(poly, poly[1:]) if b[1] != a[1]]
        return sum(1 for x, y in zip(d, d[1:]) if (x > 0) != (y > 0))

    assert turns(detail) > 3 * turns(sketch)


def test_the_single_activity_endpoint_asks_for_the_detail_budget():
    """It reads the same two GPS channels as the list, so the only thing
    stopping it shipping a thumbnail is this argument."""
    src = inspect.getsource(activities.get_activity)
    assert "ROUTE_DETAIL_POINTS" in src
    assert "route_polyline" in src


def test_the_list_still_ships_thumbnails():
    """A 50-row page must not start carrying 50 full tracks."""
    src = inspect.getsource(activities.list_activities)
    assert "ROUTE_DETAIL_POINTS" not in src


# ── The cached road, and the coercion that decides whether it is used ───────
#
# `matched_polyline` is a jsonb column, and selected as a column expression it
# comes back from asyncpg as raw JSON TEXT rather than a list — which is exactly
# why `_as_points` exists and why every other channel in this endpoint goes
# through it. This one did not: it tested `isinstance(value, list)` directly, so
# the test was always False and every matched ride silently fell back to its raw
# GPS trace. The road geometry sat in the database, unused, while the rider
# looked at a line cutting across a forest.
#
# The failure was invisible from every angle that was checked: the column
# existed, the matcher ran, rows were written. Only the drawn line was wrong.


def test_a_cached_road_survives_arriving_as_json_text():
    """The regression, stated as the thing that broke: a matched route handed
    over as a STRING must be read, not discarded."""
    road = [[47.0, 11.0], [47.1, 11.1], [47.2, 11.2]]
    assert activities._as_points(json.dumps(road)) == road


def test_the_endpoint_does_not_type_check_the_cached_road_by_hand():
    """Pins the fix at its cause rather than its symptom. A bare isinstance on
    the raw column value is the bug; the coercion is the contract."""
    src = inspect.getsource(activities.get_activity)
    assert "_as_points(row[2])" in src, "the cached road must go through the coercion"
    # CODE ONLY. The comment above the fix names the bug on purpose, and a
    # test that cannot tell an explanation from a regression would forbid
    # writing the explanation down.
    code = "\n".join(
        line for line in src.splitlines() if not line.lstrip().startswith("#")
    )
    assert "isinstance(row[2]" not in code, "this is the bug that shipped"


def test_every_json_channel_in_the_detail_route_uses_the_same_door():
    """Four channels are read out of the stream row; all four are jsonb, so all
    four need the same treatment. Counting them is what would have caught this."""
    src = inspect.getsource(activities.get_activity)
    assert src.count("_as_points(") >= 4
