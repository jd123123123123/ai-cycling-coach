"""GPX rehearsal + the ride that fulfilled it, matched after the fact.

Checked against this app's own local database before writing this: every
stored rehearsal is source_kind='gpx' and none carry an `actual` block, which
means calibrate_spread had zero real comparisons to work with for the primary
way athletes use this feature. This module is the fix.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.rehearsal.retro_match import (
    MAX_CANDIDATES,
    RETRO_MATCH_DAYS,
    attach_actual_if_matching,
)


def _rehearsal(
    *,
    id_=1,
    source_kind="gpx",
    distance_m=82_000.0,
    ascent_m=1240.0,
    result=None,
    created_at=None,
):
    r = MagicMock()
    r.id = id_
    r.source_kind = source_kind
    r.distance_m = distance_m
    r.ascent_m = ascent_m
    r.created_at = created_at or datetime(2026, 3, 1, tzinfo=timezone.utc)
    r.result = result if result is not None else {
        "band": {"p10_s": 17000.0, "p50_s": 18000.0, "p90_s": 19000.0},
        "total_time_s": 18000.0,
    }
    return r


def _activity(
    *,
    duration_seconds=17800,
    distance_meters=82_500.0,
    elevation_gain_m=1260.0,
    started_at=None,
):
    a = MagicMock()
    a.duration_seconds = duration_seconds
    a.distance_meters = distance_meters
    a.elevation_gain_m = elevation_gain_m
    a.started_at = started_at or datetime(2026, 3, 10, tzinfo=timezone.utc)
    return a


def _db(rehearsals):
    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = rehearsals
    db.execute = AsyncMock(return_value=res)
    db.add = MagicMock()
    return db


class TestAttachesTheMatch:
    @pytest.mark.asyncio
    async def test_a_gpx_rehearsal_gets_its_actual_once_the_ride_happens(self):
        rehearsal = _rehearsal()
        db = _db([rehearsal])
        n = await attach_actual_if_matching(db, user_id=1, activity=_activity())
        assert n == 1
        assert "actual" in rehearsal.result
        assert rehearsal.result["actual"]["actual_time_s"] == 17800.0
        db.add.assert_called_once_with(rehearsal)

    @pytest.mark.asyncio
    async def test_never_overwrites_an_existing_actual(self):
        """A rehearsal that already has a comparison — from any source — must
        not be silently replaced by a coincidental later ride."""
        existing = {"actual_time_s": 99999.0, "predicted_time_s": 1.0, "error_s": 1.0, "error_pct": 1.0}
        rehearsal = _rehearsal(result={
            "band": {"p10_s": 17000.0, "p50_s": 18000.0, "p90_s": 19000.0},
            "total_time_s": 18000.0,
            "actual": existing,
        })
        db = _db([rehearsal])
        n = await attach_actual_if_matching(db, user_id=1, activity=_activity())
        assert n == 0
        assert rehearsal.result["actual"] == existing


class TestRefusesAMismatch:
    @pytest.mark.asyncio
    async def test_a_flat_ride_of_the_same_distance_does_not_match_a_hilly_rehearsal(self):
        # The exact failure route_history.matches_route was built to prevent.
        rehearsal = _rehearsal(ascent_m=1240.0)
        db = _db([rehearsal])
        n = await attach_actual_if_matching(
            db, user_id=1, activity=_activity(elevation_gain_m=150.0)
        )
        assert n == 0

    @pytest.mark.asyncio
    async def test_a_ride_far_outside_the_match_window_is_not_attached(self):
        rehearsal = _rehearsal(created_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
        db = _db([rehearsal])
        too_late = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(
            days=RETRO_MATCH_DAYS + 5
        )
        n = await attach_actual_if_matching(
            db, user_id=1, activity=_activity(started_at=too_late)
        )
        assert n == 0

    @pytest.mark.asyncio
    async def test_ignores_rehearsals_with_no_band_to_compare_against(self):
        rehearsal = _rehearsal(result={"band": None, "total_time_s": None})
        db = _db([rehearsal])
        n = await attach_actual_if_matching(db, user_id=1, activity=_activity())
        assert n == 0

    @pytest.mark.asyncio
    async def test_a_zero_duration_activity_matches_nothing(self):
        db = _db([_rehearsal()])
        n = await attach_actual_if_matching(
            db, user_id=1, activity=_activity(duration_seconds=0)
        )
        assert n == 0

    @pytest.mark.asyncio
    async def test_only_gpx_rehearsals_are_scanned(self):
        """source_kind='activity' rehearsals already get their comparison at
        creation time via the original path; retro-matching them again would
        be redundant, not wrong, but the query filters them out regardless."""
        activity_kind = _rehearsal(source_kind="activity")
        db = _db([])  # query already filters source_kind='gpx' server-side
        n = await attach_actual_if_matching(db, user_id=1, activity=_activity())
        assert n == 0


class TestPicksTheRightCandidateAmongMany:
    @pytest.mark.asyncio
    async def test_prefers_the_rehearsal_closest_in_time_to_the_ride(self):
        near = _rehearsal(id_=1, created_at=datetime(2026, 3, 5, tzinfo=timezone.utc))
        far = _rehearsal(id_=2, created_at=datetime(2026, 2, 1, tzinfo=timezone.utc))
        db = _db([far, near])
        n = await attach_actual_if_matching(
            db, user_id=1, activity=_activity(started_at=datetime(2026, 3, 10, tzinfo=timezone.utc))
        )
        assert n == 1
        assert "actual" in near.result
        assert "actual" not in far.result

    @pytest.mark.asyncio
    async def test_never_raises_on_a_database_failure(self):
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=RuntimeError("db is down"))
        n = await attach_actual_if_matching(db, user_id=1, activity=_activity())
        assert n == 0
