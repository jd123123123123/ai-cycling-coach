"""Elevation gain (Höhenmeter) end-to-end: extraction helper + NULL backfill.

The Garmin activity summary carries total ascent (camelCase `elevationGain`);
synthetic/seeded rows use `total_ascent`; COROS-preserved rows use
`elevation_gain`. One helper parses them all, tolerates JSON-string blobs, and
stays honest — indoor/no-elevation rides (0 or missing) yield None, never a
fabricated 0.

AND WHEN THERE IS NO BLOB AT ALL, the recording answers instead. The Garmin,
Wahoo and Apple Health mappers never persist `raw_data`, so the backfill's old
`raw_data IS NOT NULL` filter excluded every row it existed to rescue. It now
falls back to the altitude stream through the climb detector's own smoothing.
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
    def _db(self, activities, streams=None):
        """First execute() answers the activity query, the second the streams.

        `streams` is {activity_id: streams-dict}; omit it for the raw_data-only
        cases, where the second query legitimately returns nothing.
        """
        db = MagicMock()
        calls = {"n": 0}

        async def execute(stmt):  # noqa: ANN001
            calls["n"] += 1
            result = MagicMock()
            if calls["n"] == 1:
                result.scalars.return_value.all.return_value = activities
            else:
                result.all.return_value = list((streams or {}).items())
            return result

        db.execute = AsyncMock(side_effect=execute)
        db.commit = AsyncMock()
        return db

    @staticmethod
    def _ride(activity_id=1, raw_data=None):
        return SimpleNamespace(id=activity_id, elevation_gain_m=None, raw_data=raw_data)

    @staticmethod
    def _climb_streams(gain_m: float, points: int = 60):
        """A steady climb of `gain_m` over 6 km, as altitude + distance streams.

        Long and smooth on purpose: the ascent goes through the climb detector's
        segmentation, which exists to drop altimeter noise, so a two-point spike
        would be smoothed away and prove nothing.
        """
        return {
            "altitude": [i * (gain_m / (points - 1)) for i in range(points)],
            "distance": [i * (6000.0 / (points - 1)) for i in range(points)],
        }

    async def test_fills_null_rows_from_raw_data(self):
        a1 = self._ride(1, {"total_ascent": 300})
        a2 = self._ride(2, {"elevationGain": 1240})
        db = self._db([a1, a2])
        updated = await backfill_missing_elevation(db, user_id=1)
        assert updated == 2
        assert a1.elevation_gain_m == 300.0
        assert a2.elevation_gain_m == 1240.0
        db.commit.assert_awaited_once()

    async def test_skips_rows_without_extractable_elevation(self):
        # raw_data present but no ascent figure → left NULL, not counted.
        a1 = self._ride(1, {"peak_power": 900})
        db = self._db([a1])
        updated = await backfill_missing_elevation(db, user_id=1)
        assert updated == 0
        assert a1.elevation_gain_m is None
        db.commit.assert_not_called()

    async def test_indoor_zero_stays_null(self):
        a1 = self._ride(1, {"total_ascent": 0})
        db = self._db([a1])
        updated = await backfill_missing_elevation(db, user_id=1)
        assert updated == 0
        assert a1.elevation_gain_m is None

    async def test_recovers_ascent_from_the_altitude_stream(self):
        """THE CASE THE OLD BACKFILL COULD NEVER REACH.

        A Garmin ride carries no `raw_data` at all, so the previous query
        excluded it outright. Measured on a real account: 60 of 62 rides had no
        ascent while their altitude sat in the database the whole time.
        """
        ride = self._ride(7, raw_data=None)
        db = self._db([ride], streams={7: self._climb_streams(600.0)})
        updated = await backfill_missing_elevation(db, user_id=1)
        assert updated == 1
        assert ride.elevation_gain_m == pytest.approx(600.0, rel=0.05)
        db.commit.assert_awaited_once()

    async def test_raw_data_wins_and_the_stream_is_not_read_for_that_row(self):
        # The payload's own figure is the provider's; only fall back when there
        # is none. A row filled from raw_data must not then be overwritten.
        ride = self._ride(7, {"total_ascent": 300})
        db = self._db([ride], streams={7: self._climb_streams(600.0)})
        updated = await backfill_missing_elevation(db, user_id=1)
        assert updated == 1
        assert ride.elevation_gain_m == 300.0

    async def test_flat_indoor_stream_stays_null(self):
        # A trainer ride records a constant altitude. Zero ascent is not a
        # measurement of flat ground — it is the absence of one, and the column
        # must keep saying so.
        ride = self._ride(7, raw_data=None)
        flat = {"altitude": [120.0] * 60, "distance": [i * 100.0 for i in range(60)]}
        db = self._db([ride], streams={7: flat})
        updated = await backfill_missing_elevation(db, user_id=1)
        assert updated == 0
        assert ride.elevation_gain_m is None
        db.commit.assert_not_called()

    async def test_ride_without_any_stream_is_left_alone(self):
        ride = self._ride(7, raw_data=None)
        db = self._db([ride], streams={})
        updated = await backfill_missing_elevation(db, user_id=1)
        assert updated == 0
        assert ride.elevation_gain_m is None


class TestSchemasThatUsedToDropRealFields:
    """Two fields the server computed and the schema silently threw away.

    Pydantic drops any key a model does not declare, and neither of these
    failed loudly — the number simply never arrived, and the screen rendered
    the absence as if the data had never existed.
    """

    def test_standing_row_carries_the_hours_the_server_computes(self):
        from app.schemas.crew import StandingRow

        row = StandingRow(
            user_id=5, handle="jannis", is_you=True,
            weekly_score=10, weekly_tss=90, daily_pct=[1], hours=3.2,
        )
        assert row.hours == 3.2

    def test_training_goals_keep_days_per_week(self):
        from app.schemas.athlete import TrainingGoals

        assert TrainingGoals(days_per_week=4).model_dump()["days_per_week"] == 4

    def test_days_per_week_outside_a_week_is_refused(self):
        from pydantic import ValidationError

        from app.schemas.athlete import TrainingGoals

        for bad in (0, 8):
            with pytest.raises(ValidationError):
                TrainingGoals(days_per_week=bad)
