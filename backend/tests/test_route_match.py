"""Snapping a recorded trace onto the roads it was ridden on.

These pin the RULES rather than the network: the service is an external call,
and a test that needs Valhalla to be up is a test that fails on a train.
"""
import inspect

from app.services import route_match as rm


def test_it_decimates_without_drifting():
    """THE BUG THIS PINS. `acc` was reset to zero after each kept point instead
    of carrying the remainder, so the real spacing drifted upward — on the
    Maratona a 30 m target came out at 62 m, which then made every chunk twice
    as long as intended and pushed each one past what the matcher can finish."""
    # A straight north-south line at exactly 10 m per point.
    step = 10.0 / 111_320.0
    poly = [[46.5 + i * step, 11.9] for i in range(400)]
    out = rm._decimate(poly, 30.0)
    # ~4 km at one point per 30 m is ~133; a drifting accumulator gives ~half.
    assert 120 <= len(out) <= 140
    assert out[0] == poly[0] and out[-1] == poly[-1]


def test_chunks_stay_under_what_the_matcher_can_finish():
    """`trace_route` returns at most ~20.7 km of road however much is sent, and
    it TRUNCATES SILENTLY — 135.7 km of trace came back as a clean, plausible,
    complete-looking 20.7 km with nothing in the response admitting it. Chunks
    have to stay well under that ceiling."""
    step = 10.0 / 111_320.0
    poly = [[46.5 + i * step, 11.9] for i in range(9000)]   # ~90 km
    chunks = rm._chunks(poly)
    assert len(chunks) >= 6
    for c in chunks:
        assert rm._length_m(c) <= rm.CHUNK_M * 1.3
    assert rm.CHUNK_M < 20_000


def test_chunks_overlap_so_a_join_has_context():
    """Without overlap each chunk starts cold at whatever junction it lands on
    and can pick the wrong exit for its first few hundred metres."""
    step = 10.0 / 111_320.0
    poly = [[46.5 + i * step, 11.9] for i in range(4000)]
    chunks = rm._chunks(poly)
    assert len(chunks) >= 2
    # Each chunk after the first begins BEFORE the previous one ended.
    for prev, nxt in zip(chunks, chunks[1:]):
        assert nxt[0] in prev


def test_stitching_drops_the_duplicated_overlap():
    a = [[46.500, 11.900], [46.501, 11.900], [46.502, 11.900]]
    b = [[46.502, 11.900], [46.503, 11.900], [46.504, 11.900]]
    out = rm._stitch([a, b])
    assert out == [[46.500, 11.900], [46.501, 11.900], [46.502, 11.900],
                   [46.503, 11.900], [46.504, 11.900]]


def test_unmatched_share_is_the_quality_gate_not_confidence():
    """`confidence_score` is useless here: it came back 1.0 both for a real road
    and for a straight line drawn across open mountainside. What separates them
    is how many points the matcher could not place at all — 0 of 200 on the
    road, 97 of 120 on the nonsense."""
    assert rm.unmatched_share([{"type": "matched"}] * 20) == 0.0
    assert rm.unmatched_share([{"type": "unmatched"}] * 20) == 1.0
    assert rm.unmatched_share([]) == 1.0
    assert rm.MAX_UNMATCHED_SHARE < 0.8   # below open terrain
    assert rm.MAX_UNMATCHED_SHARE > 0.0   # above a clean road


def test_the_final_guard_is_length_not_point_count():
    """The first version compared point counts and rejected every good match:
    2 178 points of spaced recording come back as 1 235 points of ROAD, and
    fewer points is the matcher doing its job — a straight kilometre of road is
    two points where a recording spends thirty-three."""
    src = inspect.getsource(rm.match)
    assert "_length_m(out)" in src
    assert "len(out) >= len(thinned)" not in src


def test_a_short_or_empty_track_is_left_alone():
    assert rm.match([]) is None
    assert rm.match([[46.5, 11.9], [46.6, 11.9]]) is None


def test_it_asks_for_a_bicycle():
    """Costing decides which ways are legal. A ride snapped with car costing
    gets pulled onto the parallel trunk road it was deliberately avoiding."""
    assert '"costing": "bicycle"' in inspect.getsource(rm.match)
