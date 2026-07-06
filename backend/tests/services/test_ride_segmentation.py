"""Tests for segmenting a ride into climbs/descents/flats."""
from __future__ import annotations

from app.services.ride_segmentation import Segment, segment_ride


def _ramp(start_alt, grade_frac, seconds, start_dist=0.0, speed_ms=10.0):
    """Altitude+distance for a constant-gradient section.

    grade_frac is the slope as a fraction (0.06 = 6%). Vertical gain per second
    is grade_frac * speed_ms, so grade = d_alt/d_dist = grade_frac exactly.
    """
    per_s_gain = grade_frac * speed_ms
    alt = [start_alt + per_s_gain * i for i in range(seconds)]
    dist = [start_dist + speed_ms * i for i in range(seconds)]
    return alt, dist


class TestSegmentRide:
    def test_no_altitude_returns_empty(self):
        assert segment_ride([None, None], [0.0, 10.0]) == []
        assert segment_ride([], []) == []

    def test_long_all_none_altitude_returns_empty(self):
        # A sufficiently long ride whose altitude never has a reading → _clean
        # returns None → []. (Length guard alone wouldn't catch this.)
        n = 60
        assert segment_ride([None] * n, [10.0 * i for i in range(n)]) == []

    def test_detects_a_sustained_climb(self):
        # 300 s climbing at 6% grade (0.6 m/s vertical at 10 m/s → ~179 m gained).
        alt, dist = _ramp(100.0, 0.06, 300)
        segs = segment_ride(alt, dist, min_segment_s=30)
        climbs = [s for s in segs if s.kind == "climb"]
        assert len(climbs) == 1
        c = climbs[0]
        assert c.duration_s == 300
        assert c.elev_gain_m > 100  # ~179 m gained
        assert c.avg_grade_pct > 3.0

    def test_flat_section_is_flat(self):
        alt = [100.0] * 120
        dist = [10.0 * i for i in range(120)]
        segs = segment_ride(alt, dist)
        assert all(s.kind == "flat" for s in segs)

    def test_climb_then_descent(self):
        up_alt, up_dist = _ramp(100.0, 0.08, 120)
        down_alt, down_dist = _ramp(up_alt[-1], -0.08, 120, start_dist=up_dist[-1] + 10)
        segs = segment_ride(up_alt + down_alt, up_dist + down_dist, min_segment_s=30)
        kinds = [s.kind for s in segs]
        assert "climb" in kinds and "descent" in kinds

    def test_short_climb_run_below_min_segment_is_merged(self):
        # 60 s flat, a genuine 20 s @ 8% climb (classified climb per-second, but
        # < min_segment_s=30), then 60 s flat. Use a small smoothing window so the
        # short ramp does read as a climb; it must then be merged into its flat
        # neighbours, not survive as its own sub-threshold climb segment.
        flat1_alt = [100.0] * 60
        flat1_dist = [10.0 * i for i in range(60)]
        climb_alt, climb_dist = _ramp(100.0, 0.08, 20, start_dist=flat1_dist[-1] + 10)
        f2_start = climb_dist[-1] + 10
        flat2_alt = [climb_alt[-1]] * 60
        flat2_dist = [f2_start + 10.0 * i for i in range(60)]
        segs = segment_ride(
            flat1_alt + climb_alt + flat2_alt,
            flat1_dist + climb_dist + flat2_dist,
            min_segment_s=30, smooth_window_s=5,
        )
        # The 20 s climb must not spawn its own sub-threshold climb segment.
        assert not any(s.kind == "climb" and s.duration_s < 30 for s in segs)
        # Segments remain contiguous and cover the whole ride.
        assert segs[0].start_s == 0
        assert segs[-1].end_s == len(flat1_alt) + len(climb_alt) + len(flat2_alt)

    def test_averages_power_and_speed_over_segment(self):
        alt, dist = _ramp(100.0, 0.08, 60)
        power = [200.0] * 60
        speed = [10.0] * 60
        segs = segment_ride(alt, dist, power=power, speed=speed, min_segment_s=30)
        assert segs[0].avg_power == 200.0
        assert segs[0].avg_speed_ms == 10.0
