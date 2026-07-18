"""Forgiving plan-aware streak semantics (roadmap P0.2).

trained → counts · planned rest → counts · sick/injured/break → pauses ·
skipped planned session → breaks · unplanned gap → breaks · today never breaks.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.streak import build_streak

TODAY = date(2026, 7, 17)  # a Friday


def _db(activity_days: list[date], planned: list[tuple[date, str, str]], goals: dict | None):
    """Fake db.execute dispatching on the selected columns."""
    db = MagicMock()

    async def execute(stmt):  # noqa: ANN001
        text = str(stmt).lower()
        result = MagicMock()
        if "activities" in text:
            result.all.return_value = [
                (datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc),)
                for d in activity_days
            ]
        elif "planned_workouts" in text:
            result.all.return_value = [
                (d, template_id, title) for d, template_id, title in planned
            ]
        else:  # athlete_profiles goals
            result.scalar_one_or_none.return_value = goals
        return result

    db.execute = AsyncMock(side_effect=execute)
    return db


def _days(n: int, end: date = TODAY) -> list[date]:
    """n consecutive days ending at `end` (inclusive)."""
    return [end - timedelta(days=i) for i in range(n)]


@pytest.mark.asyncio
async def test_consecutive_training_counts():
    db = _db(_days(5), [], None)
    out = await build_streak(db, 1, today=TODAY)
    assert out["streak"] == 5
    assert out["paused"] is False


@pytest.mark.asyncio
async def test_planned_rest_day_extends_streak():
    # Trained 3 days, then a planned rest day, then 2 more trained days.
    rest_day = TODAY - timedelta(days=3)
    activity_days = [d for d in _days(6) if d != rest_day]
    db = _db(activity_days, [(rest_day, "rest_day", "Rest day")], None)
    out = await build_streak(db, 1, today=TODAY)
    assert out["streak"] == 6  # rest day counted as adherence


@pytest.mark.asyncio
async def test_skipped_planned_session_breaks():
    missed = TODAY - timedelta(days=3)
    activity_days = [d for d in _days(6) if d != missed]
    db = _db(activity_days, [(missed, "z2_long_120", "Long Z2 — 2h")], None)
    out = await build_streak(db, 1, today=TODAY)
    assert out["streak"] == 3  # broken at the skipped session


@pytest.mark.asyncio
async def test_unplanned_gap_breaks():
    gap = TODAY - timedelta(days=2)
    activity_days = [d for d in _days(5) if d != gap]
    db = _db(activity_days, [], None)
    out = await build_streak(db, 1, today=TODAY)
    assert out["streak"] == 2


@pytest.mark.asyncio
async def test_sick_days_pause_not_break():
    # Trained through day-6..day-4, sick day-3..today (no training).
    activity_days = _days(3, TODAY - timedelta(days=4))
    goals = {"athlete_status": {"state": "sick", "since": (TODAY - timedelta(days=3)).isoformat()}}
    db = _db(activity_days, [], goals)
    out = await build_streak(db, 1, today=TODAY)
    assert out["paused"] is True
    assert out["streak"] == 3  # pre-sickness streak preserved


@pytest.mark.asyncio
async def test_today_unlogged_never_breaks():
    db = _db(_days(4, TODAY - timedelta(days=1)), [], None)
    out = await build_streak(db, 1, today=TODAY)
    assert out["streak"] == 4


@pytest.mark.asyncio
async def test_week_states_present():
    db = _db(_days(2), [], None)
    out = await build_streak(db, 1, today=TODAY)
    assert len(out["week"]) == 7
    states = {w["state"] for w in out["week"]}
    assert states <= {"trained", "rest", "paused", "missed", "unplanned", "today", "upcoming"}
