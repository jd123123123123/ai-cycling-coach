"""Tests for the pure stream-blob builder used by stream_ingestion."""
from __future__ import annotations

from app.services.stream_extraction import ActivityStreams
from app.services.stream_ingestion import build_streams_blob, has_gps


class TestBuildStreamsBlob:
    def test_includes_core_channels_always(self):
        s = ActivityStreams(power=[100.0, 110.0], heart_rate=[130.0, 131.0])
        blob = build_streams_blob(s)
        assert blob["power"] == [100.0, 110.0]
        assert blob["heart_rate"] == [130.0, 131.0]

    def test_omits_all_none_optional_channels(self):
        s = ActivityStreams(power=[100.0], temperature=[None])
        blob = build_streams_blob(s)
        assert "temperature" not in blob  # nothing recorded → don't store

    def test_includes_gps_when_present(self):
        s = ActivityStreams(power=[100.0], latitude=[47.0], longitude=[8.0])
        blob = build_streams_blob(s)
        assert blob["latitude"] == [47.0]
        assert has_gps(s) is True

    def test_has_gps_false_without_coordinates(self):
        s = ActivityStreams(power=[100.0], latitude=[None])
        assert has_gps(s) is False
