from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.ride_matching import select_rival_activity


def _act(id, user_id, start, dur=3600, dist=100000.0):
    return SimpleNamespace(id=id, user_id=user_id, started_at=start,
                           duration_seconds=dur, distance_meters=dist)


BASE = datetime(2026, 7, 5, 4, 20, tzinfo=timezone.utc)


def test_picks_closest_overlapping_same_distance_ride():
    ref = _act(71, 5, BASE, dist=106000.0)
    near = _act(200, 9, BASE + timedelta(minutes=10), dist=104000.0)   # match
    far_time = _act(201, 9, BASE + timedelta(hours=5), dist=106000.0)  # start out of window
    far_dist = _act(202, 9, BASE + timedelta(minutes=5), dist=40000.0)  # distance off
    best = select_rival_activity(ref, [far_time, far_dist, near])
    assert best is not None and best.id == 200


def test_returns_none_when_no_candidate_qualifies():
    ref = _act(71, 5, BASE, dist=106000.0)
    off = _act(300, 9, BASE + timedelta(hours=6), dist=106000.0)
    assert select_rival_activity(ref, [off]) is None


def test_prefers_smaller_combined_delta_among_two_matches():
    ref = _act(71, 5, BASE, dist=106000.0)
    a = _act(400, 9, BASE + timedelta(minutes=30), dist=100000.0)
    b = _act(401, 9, BASE + timedelta(minutes=5), dist=105000.0)  # closer on both
    assert select_rival_activity(ref, [a, b]).id == 401
