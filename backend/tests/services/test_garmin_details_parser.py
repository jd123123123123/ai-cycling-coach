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
