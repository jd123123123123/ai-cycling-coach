"""Tests for the pure stream-blob builder used by stream_ingestion."""
from __future__ import annotations

import pytest

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


class TestIngestGuardPersistence:
    """A guard-flagged corrupt ride keeps its raw streams but persists the
    power model (mmp/CP/W'/eFTP/NP) as None — exactly like runs."""

    def _db(self):
        from unittest.mock import AsyncMock, MagicMock

        db = MagicMock()
        db.get = AsyncMock(return_value=None)
        db.add = MagicMock()
        db.execute = AsyncMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        return db

    @pytest.mark.asyncio
    async def test_corrupt_ride_persists_streams_but_not_power_model(self):
        from app.services.stream_ingestion import ingest_activity_streams

        db = self._db()
        s = ActivityStreams(power=[600.0] * 1200)  # 20 min at 600 W: corrupt
        analysis = await ingest_activity_streams(
            db, user_id=1, activity_id=7, streams=s, ftp=250.0, commit=False
        )
        assert analysis.power_model_valid is False
        row = db.add.call_args[0][0]
        assert row.mmp_curve is None
        assert row.cp_watts is None and row.w_prime_j is None and row.eftp_watts is None
        assert row.normalized_power is None
        assert row.streams["power"]  # raw stream kept
        db.execute.assert_not_awaited()  # no NP backfill either

    @pytest.mark.asyncio
    async def test_normal_ride_persists_power_model(self):
        from app.services.stream_ingestion import ingest_activity_streams

        db = self._db()
        power = (
            [150.0] * 600
            + [300.0] * 300
            + [150.0] * 1200
            + [270.0] * 720
            + [150.0] * 600
        )
        s = ActivityStreams(power=power)
        analysis = await ingest_activity_streams(
            db, user_id=1, activity_id=8, streams=s, ftp=250.0, commit=False,
            weight_kg=70.0,
        )
        assert analysis.power_model_valid is True
        row = db.add.call_args[0][0]
        assert row.mmp_curve
        assert row.cp_watts is not None
        db.execute.assert_awaited()  # NP backfill ran
