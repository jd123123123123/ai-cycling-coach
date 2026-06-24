"""Tests for normalizing raw activity records into aligned 1 Hz streams."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.stream_extraction import records_to_streams

T0 = datetime(2026, 6, 21, 10, 0, 0, tzinfo=timezone.utc)


def _rec(offset_s, power=None, hr=None, cad=None, alt=None):
    return {
        "timestamp": T0 + timedelta(seconds=offset_s),
        "power": power, "heart_rate": hr, "cadence": cad, "altitude": alt,
    }


class TestRecordsToStreams:
    def test_regular_1hz_records_align(self):
        recs = [_rec(i, power=200 + i, hr=130 + i) for i in range(5)]
        s = records_to_streams(recs)
        assert s.power == [200.0, 201.0, 202.0, 203.0, 204.0]
        assert s.heart_rate == [130.0, 131.0, 132.0, 133.0, 134.0]
        assert s.duration_s == 5

    def test_short_dropout_forward_fills_power(self):
        # Smart-recording / sensor dropout: t=0 and t=2 (t=1 missing). A short
        # gap is a recording artefact, not coasting — forward-fill power (and HR)
        # from the last sample rather than inserting a fake 0 W second.
        recs = [_rec(0, power=200, hr=130), _rec(2, power=220, hr=140)]
        s = records_to_streams(recs)
        assert s.power == [200.0, 200.0, 220.0]
        assert s.heart_rate == [130.0, 130.0, 140.0]

    def test_large_gap_is_treated_as_a_stop_not_zero_filled(self):
        # Auto-pause: a 100 s gap (> max_gap_s) is stopped time, not riding.
        # It must be excluded, not filled with 100 zero-power seconds (which
        # would crater Normalized Power).
        recs = [_rec(0, power=200), _rec(100, power=210)]
        s = records_to_streams(recs, max_gap_s=10)
        assert s.power == [200.0, 210.0]      # stop compressed out
        assert s.duration_s == 2
        assert 0.0 not in s.power

    def test_explicit_zero_power_sample_is_kept(self):
        # A *recorded* 0 W sample (genuine coasting) is preserved as-is.
        recs = [_rec(0, power=200), _rec(1, power=0), _rec(2, power=210)]
        s = records_to_streams(recs)
        assert s.power == [200.0, 0.0, 210.0]

    def test_out_of_order_records_are_sorted(self):
        recs = [_rec(2, power=220), _rec(0, power=200), _rec(1, power=210)]
        s = records_to_streams(recs)
        assert s.power == [200.0, 210.0, 220.0]

    def test_empty_returns_empty_streams(self):
        s = records_to_streams([])
        assert s.power == []
        assert s.duration_s == 0

    def test_missing_power_field_treated_as_zero(self):
        recs = [_rec(0, hr=130), _rec(1, power=200, hr=131)]
        s = records_to_streams(recs)
        assert s.power == [0.0, 200.0]
