"""Tests for the pure computation parts of climb_companion."""
from app.services.climb_companion import (
    build_pacing_plan,
    detect_ride_climbs,
    duration_scale,
    group_climbs,
    merge_climb_segments,
    pace_factor,
    profile_bins,
    summarize_group,
    zone_for_gradient,
)
from app.services.ride_segmentation import Segment


# ── helpers ──────────────────────────────────────────────────────────────────

def _seg(kind, start, end, dist, gain, loss, grade, power=None):
    return Segment(
        kind=kind, start_s=start, end_s=end, duration_s=end - start,
        distance_m=dist, elev_gain_m=gain, elev_loss_m=loss,
        avg_grade_pct=grade, avg_power=power, avg_speed_ms=None,
    )


def _synthetic_ride(
    flat_s=600, climb_s=1200, grade_pct=6.0, flat_speed=8.0, climb_speed=3.0,
    base_alt=100.0, flat_power=150.0, climb_power=280.0, with_gps=True,
    lat0=44.0, lng0=7.0,
):
    """Flat → steady climb → flat, 1 Hz arrays like stored streams."""
    altitude, distance, power, speed = [], [], [], []
    lat, lng = [], []
    alt, dist = base_alt, 0.0
    la = lat0
    for _ in range(flat_s):
        altitude.append(alt); distance.append(dist); power.append(flat_power)
        speed.append(flat_speed); lat.append(la); lng.append(lng0)
        dist += flat_speed
    for _ in range(climb_s):
        altitude.append(alt); distance.append(dist); power.append(climb_power)
        speed.append(climb_speed); lat.append(la); lng.append(lng0)
        dist += climb_speed
        alt += climb_speed * grade_pct / 100.0
        la += 0.000005
    for _ in range(flat_s):
        altitude.append(alt); distance.append(dist); power.append(flat_power)
        speed.append(flat_speed); lat.append(la); lng.append(lng0)
        dist += flat_speed
    streams = {
        "altitude": altitude, "distance": distance,
        "power": power, "speed": speed,
    }
    if with_gps:
        streams["latitude"] = lat
        streams["longitude"] = lng
    return streams


# ── zones & pacing factors ───────────────────────────────────────────────────

def test_zone_for_gradient_boundaries():
    assert zone_for_gradient(-4.0) == 1
    assert zone_for_gradient(2.9) == 1
    assert zone_for_gradient(3.0) == 2
    assert zone_for_gradient(5.9) == 2
    assert zone_for_gradient(6.0) == 3
    assert zone_for_gradient(9.0) == 4
    assert zone_for_gradient(12.0) == 5
    assert zone_for_gradient(18.0) == 5


def test_pace_factor_monotonic_with_gradient():
    grades = [-5.0, 1.0, 4.0, 7.0, 10.0, 14.0]
    factors = [pace_factor(g) for g in grades]
    assert factors == sorted(factors)
    assert factors[0] < 0.6          # descents are easy
    assert factors[-1] <= 1.0        # never above CP


def test_duration_scale_longer_climbs_scaled_down():
    assert duration_scale(None) == 1.0
    assert duration_scale(600) == 1.0
    assert duration_scale(1800) < 1.0
    assert duration_scale(3600) < duration_scale(1800)


# ── profile bins ─────────────────────────────────────────────────────────────

def test_profile_bins_linear_ramp():
    n = 700
    alt = [100.0 + i * 0.25 for i in range(n)]     # 0.25 m/s at 5 m/s = 5 %
    dist = [i * 5.0 for i in range(n)]
    bins = profile_bins(alt, dist, 0, n)
    assert len(bins) >= 8
    assert bins[0]["km"] == 0.0
    kms = [b["km"] for b in bins]
    assert kms == sorted(kms)
    for b in bins:
        assert 4.0 <= b["gradient_pct"] <= 6.0
    assert bins[-1]["alt_m"] > bins[0]["alt_m"]


def test_profile_bins_too_short_returns_empty():
    assert profile_bins([100.0, 101.0], [0.0, 5.0], 0, 2) == []


# ── pacing plan ──────────────────────────────────────────────────────────────

def _bins(grades, bin_km=0.3):
    return [
        {"km": round(i * bin_km, 2), "gradient_pct": g, "alt_m": 100.0 + i}
        for i, g in enumerate(grades)
    ]


def test_pacing_plan_uniform_grade_single_section():
    bins = _bins([5.0] * 10)
    plan = build_pacing_plan(bins, 300.0, 3.0, 600)
    assert len(plan) == 1
    assert plan[0]["target_watts"] == round(300 * 0.85)   # 3–6 % band
    assert plan[0]["from_km"] == 0.0
    assert plan[0]["to_km"] == 3.0
    assert plan[0]["zone"] == 2
    assert plan[0]["effort"] == "steady"


def test_pacing_plan_steeper_sections_get_more_watts():
    bins = _bins([4.0] * 6 + [10.0] * 6)
    plan = build_pacing_plan(bins, 300.0, 3.6, 600)
    assert len(plan) == 2
    assert plan[1]["target_watts"] > plan[0]["target_watts"]
    assert plan[1]["zone"] > plan[0]["zone"]
    # contiguous coverage of the climb
    assert plan[0]["to_km"] == plan[1]["from_km"]
    assert plan[1]["to_km"] == 3.6


def test_pacing_plan_capped_at_max_sections():
    grades = [3.0, 8.0] * 10                       # wildly alternating
    plan = build_pacing_plan(_bins(grades), 300.0, 6.0, 600)
    assert 1 <= len(plan) <= 6


def test_pacing_plan_without_cp_is_empty():
    assert build_pacing_plan(_bins([5.0] * 10), None, 3.0, 600) == []
    assert build_pacing_plan([], 300.0, 3.0, 600) == []


# ── merging interrupted climbs ───────────────────────────────────────────────

def test_merge_bridges_short_flat_between_climbs():
    segs = [
        _seg("climb", 0, 300, 900.0, 54.0, 0.0, 6.0, power=280.0),
        _seg("flat", 300, 360, 480.0, 2.0, 1.0, 0.2, power=200.0),
        _seg("climb", 360, 660, 900.0, 54.0, 0.0, 6.0, power=280.0),
    ]
    merged = merge_climb_segments(segs)
    assert len(merged) == 1
    m = merged[0]
    assert m.kind == "climb"
    assert m.duration_s == 660
    assert m.distance_m == 2280.0
    assert m.elev_gain_m == 110.0
    assert m.avg_power is not None and 270 < m.avg_power < 280


def test_merge_keeps_separate_climbs_apart():
    segs = [
        _seg("climb", 0, 300, 900.0, 54.0, 0.0, 6.0),
        _seg("flat", 300, 900, 4800.0, 2.0, 1.0, 0.0),   # 10 min of flat
        _seg("climb", 900, 1200, 900.0, 54.0, 0.0, 6.0),
    ]
    merged = merge_climb_segments(segs)
    assert [s.kind for s in merged] == ["climb", "flat", "climb"]


def test_merge_respects_interruption_elevation_loss():
    segs = [
        _seg("climb", 0, 300, 900.0, 54.0, 0.0, 6.0),
        _seg("descent", 300, 400, 800.0, 0.0, 60.0, -7.5),  # a real descent
        _seg("climb", 400, 700, 900.0, 54.0, 0.0, 6.0),
    ]
    merged = merge_climb_segments(segs)
    assert len(merged) == 3


# ── end-to-end detection on synthetic streams ───────────────────────────────

def test_detect_ride_climbs_finds_the_climb():
    streams = _synthetic_ride()
    out = detect_ride_climbs(streams, mass_kg=70.0, title="Morning Ride",
                             date="2026-07-01", activity_id=1)
    assert len(out) == 1
    c = out[0]
    # 1200 s at 3 m/s, 6 % → 3600 m, ~216 m gain, VAM ~648
    assert 3000 <= c["distance_m"] <= 4200
    assert 190 <= c["elev_gain_m"] <= 240
    assert 5.0 <= c["avg_grade_pct"] <= 7.0
    assert 550 <= c["vam_m_per_h"] <= 750
    assert c["w_per_kg"] == 4.0
    assert c["start_lat"] is not None
    assert c["profile"], "expected gradient profile bins"
    for b in c["profile"]:
        assert 3.0 <= b["gradient_pct"] <= 9.0
    assert c["title"] == "Morning Ride"


def test_detect_ride_climbs_no_altitude_returns_empty():
    assert detect_ride_climbs({}) == []
    assert detect_ride_climbs({"power": [200.0] * 100}) == []


def test_detect_ride_climbs_flat_ride_returns_empty():
    n = 1800
    streams = {
        "altitude": [100.0] * n,
        "distance": [i * 8.0 for i in range(n)],
        "power": [180.0] * n,
    }
    assert detect_ride_climbs(streams) == []


# ── grouping & summary ───────────────────────────────────────────────────────

def _instance(**over):
    base = {
        "activity_id": 1, "title": "Ride", "date": "2026-07-01",
        "start_s": 0, "duration_s": 2400, "distance_m": 3600.0,
        "elev_gain_m": 216.0, "avg_grade_pct": 6.0, "max_grade_pct": 8.0,
        "vam_m_per_h": 648.0, "w_per_kg": 4.0, "avg_power": 280.0,
        "category": "4", "start_km": 5.0, "summit_m": 316.0,
        "start_lat": 44.0, "start_lng": 7.0, "end_lat": 44.03, "end_lng": 7.0,
        "profile": _bins([6.0] * 10),
    }
    base.update(over)
    return base


def test_group_climbs_matches_same_start_and_length():
    a = _instance(date="2026-07-01")
    b = _instance(date="2026-07-08", start_lat=44.001, duration_s=2500)
    c = _instance(date="2026-07-09", start_lat=45.0)      # ~110 km away
    groups = group_climbs([a, b, c])
    assert sorted(len(g) for g in groups) == [1, 2]


def test_group_climbs_never_groups_without_gps():
    a = _instance(start_lat=None, start_lng=None, end_lat=None, end_lng=None)
    b = _instance(start_lat=None, start_lng=None, end_lat=None, end_lng=None)
    assert len(group_climbs([a, b])) == 2


def test_summarize_group_pr_and_deltas():
    fast = _instance(date="2026-06-12", duration_s=2400, vam_m_per_h=680.0)
    slow = _instance(date="2026-07-01", duration_s=2520, vam_m_per_h=640.0,
                     avg_power=260.0)
    s = summarize_group([fast, slow], cp_watts=300.0)
    assert s["best_time_s"] == 2400
    assert s["best_date"] == "2026-06-12"
    assert s["best_vam"] == 680
    assert s["attempts"] == 2
    assert s["last_date"] == "2026-07-01"
    deltas = {h["date"]: h["delta_s"] for h in s["history"]}
    assert deltas["2026-06-12"] == 0
    assert deltas["2026-07-01"] == 120
    assert s["pacing"], "expected a pacing plan with CP present"
    assert s["name"] == "Ride · km 5"
    assert s["bearing_deg"] is not None
    assert s["vam_target"] is not None


def test_summarize_group_flags_virtual_platforms():
    real = summarize_group([_instance(title="Badia Rennradfahren")], 300.0)
    virt = summarize_group([_instance(title="Zwift - The Gorby")], 300.0)
    assert real["is_virtual"] is False
    assert virt["is_virtual"] is True


def test_summarize_group_without_power_omits_vam_target():
    inst = _instance(avg_power=None, w_per_kg=None)
    s = summarize_group([inst], cp_watts=300.0)
    assert s["vam_target"] is None
    assert s["best_wkg"] is None
