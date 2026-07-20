"""Tests for parsing Garmin activity-details payloads into stream records."""
from __future__ import annotations

from datetime import timezone

from app.services.garmin_details_parser import garmin_details_to_records


def _detail(rows):
    """Build a minimal Garmin activity-details payload with the real key layout."""
    return {
        "metricDescriptors": [
            {"key": "directBikeCadence", "metricsIndex": 0},
            {"key": "directElevation", "metricsIndex": 1},
            {"key": "directHeartRate", "metricsIndex": 2},
            {"key": "directTimestamp", "metricsIndex": 3},
            {"key": "directPower", "metricsIndex": 4},
        ],
        "activityDetailMetrics": [{"metrics": r} for r in rows],
    }


class TestGarminDetailsToRecords:
    def test_maps_indices_to_named_fields(self):
        # cadence, elevation, hr, timestamp(ms), power
        rows = [
            [90.0, 100.0, 130.0, 1_782_024_082_000.0, 200.0],
            [92.0, 101.0, 132.0, 1_782_024_083_000.0, 210.0],
        ]
        recs = garmin_details_to_records(_detail(rows))
        assert len(recs) == 2
        assert recs[0]["power"] == 200.0
        assert recs[0]["heart_rate"] == 130.0
        assert recs[0]["cadence"] == 90.0
        assert recs[0]["altitude"] == 100.0
        assert recs[0]["timestamp"].tzinfo == timezone.utc
        # 1 s apart
        delta = recs[1]["timestamp"] - recs[0]["timestamp"]
        assert delta.total_seconds() == 1.0

    def test_missing_power_descriptor_yields_none_power(self):
        detail = {
            "metricDescriptors": [
                {"key": "directHeartRate", "metricsIndex": 0},
                {"key": "directTimestamp", "metricsIndex": 1},
            ],
            "activityDetailMetrics": [{"metrics": [130.0, 1_782_024_082_000.0]}],
        }
        recs = garmin_details_to_records(detail)
        assert recs[0]["power"] is None
        assert recs[0]["heart_rate"] == 130.0

    def test_rows_without_timestamp_are_skipped(self):
        detail = {
            "metricDescriptors": [
                {"key": "directTimestamp", "metricsIndex": 0},
                {"key": "directPower", "metricsIndex": 1},
            ],
            "activityDetailMetrics": [
                {"metrics": [None, 200.0]},                 # no timestamp → skip
                {"metrics": [1_782_024_082_000.0, 210.0]},  # kept
            ],
        }
        recs = garmin_details_to_records(detail)
        assert len(recs) == 1
        assert recs[0]["power"] == 210.0

    def test_empty_or_missing_payload_returns_empty(self):
        assert garmin_details_to_records({}) == []
        assert garmin_details_to_records({"metricDescriptors": []}) == []
        assert garmin_details_to_records(None) == []


class TestGarminDetailsExtraChannels:
    def test_captures_gps_speed_distance_temperature(self):
        detail = {
            "metricDescriptors": [
                {"key": "directTimestamp", "metricsIndex": 0},
                {"key": "directLatitude", "metricsIndex": 1},
                {"key": "directLongitude", "metricsIndex": 2},
                {"key": "directSpeed", "metricsIndex": 3},
                {"key": "sumDistance", "metricsIndex": 4},
                {"key": "directAirTemperature", "metricsIndex": 5},
            ],
            "activityDetailMetrics": [
                {"metrics": [1_782_024_082_000.0, 47.1, 8.5, 9.7, 1234.0, 21.0]},
            ],
        }
        rec = garmin_details_to_records(detail)[0]
        assert rec["latitude"] == 47.1
        assert rec["longitude"] == 8.5
        assert rec["speed"] == 9.7
        assert rec["distance"] == 1234.0
        assert rec["temperature"] == 21.0

    def test_captures_biomechanics_when_present(self):
        detail = {
            "metricDescriptors": [
                {"key": "directTimestamp", "metricsIndex": 0},
                {"key": "directLeftRightBalance", "metricsIndex": 1},
                {"key": "directLeftTorqueEffectiveness", "metricsIndex": 2},
                {"key": "directLeftPedalSmoothness", "metricsIndex": 3},
            ],
            "activityDetailMetrics": [{"metrics": [1_782_024_082_000.0, 48.0, 78.0, 24.0]}],
        }
        rec = garmin_details_to_records(detail)[0]
        assert rec["right_balance"] == 48.0
        assert rec["torque_effectiveness"] == 78.0
        assert rec["pedal_smoothness"] == 24.0

    def test_absent_extra_channels_are_none(self):
        # The existing minimal payload (cadence/elev/hr/ts/power) → new keys None.
        rows = [[90.0, 100.0, 130.0, 1_782_024_082_000.0, 200.0]]
        rec = garmin_details_to_records(_detail(rows))[0]
        for k in ("latitude", "longitude", "speed", "distance", "temperature",
                  "right_balance", "torque_effectiveness", "pedal_smoothness"):
            assert rec[k] is None
