"""Achievement detection — pure helpers (no DB).

Unlock dates must be the date of the *triggering ride/day*, progress must be
honest numbers (or None where no meaningful number exists), and the climb
scanner must categorize a real synthetic climb while staying silent on flat
rides.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.services.achievement_service import (
    CATALOG,
    CATALOG_BY_KEY,
    RideRow,
    build_progress,
    detect_ctl_milestones,
    detect_kj_milestone,
    detect_ride_milestones,
    scan_ride_for_climbs,
    unlocked_value_label,
)

T0 = datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc)


def _rides(n: int, dist_m: float = 30_000.0) -> list[RideRow]:
    return [RideRow(i + 1, T0 + timedelta(days=i), dist_m, 3600) for i in range(n)]


# ── ride milestones ──────────────────────────────────────────────────────

def test_ride_count_unlocks_on_nth_ride_date():
    out = detect_ride_milestones(_rides(12))
    assert "rides_10" in out and "rides_50" not in out
    # the 10th ride (index 9) is the trigger
    assert out["rides_10"]["unlocked_at"] == T0 + timedelta(days=9)
    assert out["rides_10"]["context"]["activity_id"] == 10


def test_century_uses_first_qualifying_ride_not_best():
    rides = _rides(5)
    rides[2] = RideRow(3, T0 + timedelta(days=2), 104_500.0, 14_000)
    rides[4] = RideRow(5, T0 + timedelta(days=4), 132_000.0, 18_000)
    out = detect_ride_milestones(rides)
    assert out["first_century"]["unlocked_at"] == T0 + timedelta(days=2)
    assert out["first_century"]["context"]["km"] == 104.5
    # longest ride reflects the current record
    assert out["longest_ride"]["context"]["km"] == 132.0


def test_no_rides_no_unlocks():
    assert detect_ride_milestones([]) == {}


def test_kj_milestone_first_crossing():
    rows = [
        (1, T0, 640.0),
        (2, T0 + timedelta(days=1), 1210.0),
        (3, T0 + timedelta(days=2), 2400.0),
    ]
    out = detect_kj_milestone(rows)
    assert out["first_1000kj"]["unlocked_at"] == T0 + timedelta(days=1)
    assert out["first_1000kj"]["context"]["kj"] == 1210
    assert detect_kj_milestone([(1, T0, 999.9)]) == {}


def test_ctl_milestones_first_crossing_date():
    series = [
        {"date": date(2026, 1, 1), "ctl": 35.0},
        {"date": date(2026, 1, 2), "ctl": 41.2},
        {"date": date(2026, 1, 3), "ctl": 44.0},
    ]
    out = detect_ctl_milestones(series)
    assert out["ctl_40"]["unlocked_at"].date() == date(2026, 1, 2)
    assert out["ctl_40"]["context"]["ctl"] == 41.2
    assert "ctl_60" not in out and "ctl_80" not in out


# ── progress (locked side) ───────────────────────────────────────────────

def test_progress_labels_en_and_de():
    p_en = build_progress(
        "first_1000kj", n_rides=5, best_km=40.0, best_kj=743.2,
        current_ctl=None, best_climb_score=None, de=False,
    )
    assert p_en == {"current": 743, "target": 1000, "label": "743 of 1,000 kJ"}
    p_de = build_progress(
        "rides_100", n_rides=57, best_km=None, best_kj=None,
        current_ctl=None, best_climb_score=None, de=True,
    )
    assert p_de["label"] == "57 von 100 Fahrten"


def test_breakthroughs_have_no_fake_progress():
    for key in ("power_pb_60", "power_pb_3600", "eftp_up"):
        assert build_progress(
            key, n_rides=50, best_km=90.0, best_kj=900.0,
            current_ctl=50.0, best_climb_score=500.0, de=False,
        ) is None


def test_climb_progress_absent_without_altitude_scan():
    assert build_progress(
        "first_cat_climb", n_rides=50, best_km=90.0, best_kj=900.0,
        current_ctl=50.0, best_climb_score=None, de=False,
    ) is None


# ── climb scanner ────────────────────────────────────────────────────────

def _synthetic_climb_ride(climb_s: int = 600, vam_ms: float = 0.5, speed: float = 10.0):
    """5 min flat → climb (vam_ms vertical m/s at `speed` m/s) → 5 min flat."""
    flat = 300
    n = flat + climb_s + flat
    altitude, distance = [], []
    alt, dist = 100.0, 0.0
    for i in range(n):
        if flat <= i < flat + climb_s:
            alt += vam_ms
        dist += speed
        altitude.append(alt)
        distance.append(dist)
    return altitude, distance


def test_scan_finds_categorized_climb():
    altitude, distance = _synthetic_climb_ride()  # 300 m gain at ~5% → Cat 3-ish
    ascent, best = scan_ride_for_climbs(altitude, distance)
    assert best is not None
    assert best["category"] in {"HC", "1", "2", "3", "4"}
    assert best["elev_gain_m"] > 250
    assert ascent >= best["elev_gain_m"]


def test_scan_flat_ride_finds_no_climb():
    n = 1200
    altitude = [100.0] * n
    distance = [i * 9.0 for i in range(n)]
    ascent, best = scan_ride_for_climbs(altitude, distance)
    assert best is None
    assert ascent == 0.0


def test_scan_handles_missing_streams():
    assert scan_ride_for_climbs(None, None) == (0.0, None)
    assert scan_ride_for_climbs([100.0] * 5, None) == (0.0, None)


# ── value chips + catalog sanity ─────────────────────────────────────────

def test_unlocked_value_labels():
    assert unlocked_value_label("longest_ride", {"km": 133.1}, de=False) == "133.1 km"
    assert unlocked_value_label("longest_ride", {"km": 133.1}, de=True) == "133,1 km"
    assert unlocked_value_label("first_1000kj", {"kj": 1376}, de=True) == "1.376 kJ"
    assert unlocked_value_label("power_pb_300", {"value_w": 286}, de=False) == "286 W"
    assert unlocked_value_label("first_cat_climb", {"category": "4"}, de=False) == "Cat 4"
    assert unlocked_value_label("first_cat_climb", {"category": "HC"}, de=True) == "HC"
    assert unlocked_value_label("rides_50", {"rides": 50}, de=False) is None
    assert unlocked_value_label("rides_50", None, de=False) is None


def test_catalog_is_bilingual_and_unique():
    keys = [d.key for d in CATALOG]
    assert len(keys) == len(set(keys))
    assert not any(k.startswith("_") for k in keys)
    for d in CATALOG:
        assert d.title_en and d.title_de and d.detail_en and d.detail_de
    assert CATALOG_BY_KEY["first_century"].icon == "trophy"
