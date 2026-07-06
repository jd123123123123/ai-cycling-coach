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


def _rec2(offset_s, **kw):
    rec = {"timestamp": T0 + timedelta(seconds=offset_s)}
    for k in ("power", "heart_rate", "cadence", "altitude", "latitude",
              "longitude", "speed", "distance", "temperature",
              "left_right_balance", "torque_effectiveness", "pedal_smoothness"):
        rec[k] = kw.get(k)
    return rec


class TestExtraChannels:
    def test_gps_speed_align_and_forward_fill(self):
        recs = [
            _rec2(0, power=200, latitude=47.0, longitude=8.0, speed=10.0),
            _rec2(2, power=210, latitude=47.1, longitude=8.1, speed=11.0),  # gap bridged
        ]
        s = records_to_streams(recs)
        assert s.latitude == [47.0, 47.0, 47.1]
        assert s.longitude == [8.0, 8.0, 8.1]
        assert s.speed == [10.0, 10.0, 11.0]

    def test_extra_channels_none_until_first_reading(self):
        recs = [_rec2(0, power=200), _rec2(1, power=205, temperature=20.0)]
        s = records_to_streams(recs)
        assert s.temperature == [None, 20.0]

    def test_large_gap_excluded_for_extra_channels_too(self):
        recs = [_rec2(0, power=200, speed=10.0), _rec2(100, power=210, speed=12.0)]
        s = records_to_streams(recs, max_gap_s=10)
        assert s.speed == [10.0, 12.0]
        assert len(s.speed) == len(s.power) == 2
