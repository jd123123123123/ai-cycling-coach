"""Elevation gain (Höhenmeter) end-to-end: extraction helper + NULL backfill.

The Garmin activity summary carries total ascent (camelCase `elevationGain`);
synthetic/seeded rows use `total_ascent`; COROS-preserved rows use
`elevation_gain`. One helper parses them all, tolerates JSON-string blobs, and
stays honest — indoor/no-elevation rides (0 or missing) yield None, never a
fabricated 0.
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.activity_service import backfill_missing_elevation
from app.services.garmin_mapper import extract_elevation_gain_m, map_garmin_activity


class TestExtractElevationGain:
    def test_real_garmin_payload_camelcase(self):
        # Real Garmin activity summary key.
        assert extract_elevation_gain_m({"elevationGain": 842.0}) == 842.0

    def test_snake_case_total_ascent(self):
        # Synthetic/seeded rows + COROS `total_ascent` alias.
        assert extract_elevation_gain_m({"total_ascent": 1240}) == 1240.0

    def test_coros_elevation_gain_key(self):
        assert extract_elevation_gain_m({"elevation_gain": 300}) == 300.0

    def test_missing_key_returns_none(self):
        # A blob with unrelated keys → no elevation.
        assert extract_elevation_gain_m({"peak_power": 900}) is None

    def test_indoor_zero_ascent_returns_none(self):
        # Indoor/trainer ride reports 0 ascent — must NOT surface a real climb.
        assert extract_elevation_gain_m({"elevationGain": 0}) is None

    def test_none_blob_returns_none(self):
        assert extract_elevation_gain_m(None) is None

    def test_json_string_blob_tolerated(self):
        assert extract_elevation_gain_m(json.dumps({"total_ascent": 500})) == 500.0

    def test_malformed_string_returns_none(self):
        assert extract_elevation_gain_m("not json at all") is None

    def test_non_numeric_value_returns_none(self):
        assert extract_elevation_gain_m({"elevationGain": "N/A"}) is None

    def test_priority_prefers_first_present_key(self):
        # camelCase Garmin key wins over the snake_case alias.
        assert extract_elevation_gain_m({"elevationGain": 100, "total_ascent": 999}) == 100.0


class TestMapGarminActivityElevation:
    def _raw(self, **extra) -> dict:
        base = {
            "activityId": 123,
            "activityType": {"typeKey": "cycling"},
            "startTimeGMT": "2026-07-18 09:00:00",
            "duration": 3600,
            "distance": 40000.0,
        }
        base.update(extra)
        return base

    def test_outdoor_ride_surfaces_elevation(self):
        mapped = map_garmin_activity(self._raw(elevationGain=642.0))
        assert mapped is not None
        assert mapped.elevation_gain_m == 642.0

    def test_indoor_ride_leaves_elevation_none(self):
        # virtual_ride with no elevation figure → honest None.
        raw = self._raw(elevationGain=0)
        raw["activityType"] = {"typeKey": "indoor_cycling"}
        mapped = map_garmin_activity(raw)
        assert mapped is not None
        assert mapped.elevation_gain_m is None


@pytest.mark.asyncio
class TestBackfillMissingElevation:
    def _db(self, activities):
        db = MagicMock()

        async def execute(stmt):  # noqa: ANN001
            result = MagicMock()
            result.scalars.return_value.all.return_value = activities
            return result

        db.execute = AsyncMock(side_effect=execute)
        db.commit = AsyncMock()
        return db

    async def test_fills_null_rows_from_raw_data(self):
        a1 = SimpleNamespace(elevation_gain_m=None, raw_data={"total_ascent": 300})
        a2 = SimpleNamespace(elevation_gain_m=None, raw_data={"elevationGain": 1240})
        db = self._db([a1, a2])
        updated = await backfill_missing_elevation(db, user_id=1)
        assert updated == 2
        assert a1.elevation_gain_m == 300.0
        assert a2.elevation_gain_m == 1240.0
        db.commit.assert_awaited_once()

    async def test_skips_rows_without_extractable_elevation(self):
        # raw_data present but no ascent figure → left NULL, not counted.
        a1 = SimpleNamespace(elevation_gain_m=None, raw_data={"peak_power": 900})
        db = self._db([a1])
        updated = await backfill_missing_elevation(db, user_id=1)
        assert updated == 0
        assert a1.elevation_gain_m is None
        db.commit.assert_not_called()

    async def test_indoor_zero_stays_null(self):
        a1 = SimpleNamespace(elevation_gain_m=None, raw_data={"total_ascent": 0})
        db = self._db([a1])
        updated = await backfill_missing_elevation(db, user_id=1)
        assert updated == 0
        assert a1.elevation_gain_m is None
