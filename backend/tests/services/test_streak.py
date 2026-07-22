"""Forgiving plan-aware streak semantics (roadmap P0.2).

trained → counts · planned rest → counts · sick/injured/break → pauses ·
skipped planned session → breaks · unplanned gap → breaks · today never breaks.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.streak import LOOKBACK_DAYS, build_streak, repair_streak

TODAY = date(2026, 7, 17)  # a Friday


def _db(
    activity_days: list[date | datetime],
    planned: list[tuple[date, str, str]],
    goals: dict | None,
    timezone_name: str = "Europe/Berlin",
):
    """Fake db.execute dispatching on the selected columns.

    `activity_days` accepts plain dates (stored as 12:00 UTC — safely inside
    the same Berlin local day) or full datetimes for boundary cases.
    """
    db = MagicMock()

    def _as_dt(d: date | datetime) -> datetime:
        if isinstance(d, datetime):
            return d
        return datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc).replace(hour=12)

    async def execute(stmt):  # noqa: ANN001
        text = str(stmt).lower()
        result = MagicMock()
        if "activities" in text:
            result.all.return_value = [(_as_dt(d),) for d in activity_days]
        elif "planned_workouts" in text:
            result.all.return_value = [
                (d, template_id, title) for d, template_id, title in planned
            ]
        else:  # athlete_profiles row (goals + timezone)
            result.scalar_one_or_none.return_value = SimpleNamespace(
                goals=goals, timezone=timezone_name
            )
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
async def test_late_evening_activity_attributed_to_local_day():
    """A 22:30-UTC ride is 00:30 *next day* Berlin time — the trained-day set
    must use the athlete-local date (audit P0-2), so a streak whose day-1
    training was logged late UTC on day-2 stays unbroken."""
    # Day-1's session stored at 22:30 UTC on day-2 → local date is day-1.
    late_utc = datetime.combine(
        TODAY - timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc
    ).replace(hour=22, minute=30)
    activity_days: list[date | datetime] = [TODAY, late_utc, TODAY - timedelta(days=2)]
    db = _db(activity_days, [], None)
    out = await build_streak(db, 1, today=TODAY)
    # today + yesterday (late-UTC ride) + day-2 all trained → streak of 3.
    assert out["streak"] == 3


@pytest.mark.asyncio
async def test_week_states_present():
    db = _db(_days(2), [], None)
    out = await build_streak(db, 1, today=TODAY)
    assert len(out["week"]) == 7
    states = {w["state"] for w in out["week"]}
    assert states <= {"trained", "rest", "paused", "missed", "unplanned", "today", "upcoming"}


# ─── Weekly consistency (usability audit P1-11) ──────────────────────────────
# consistency = {met, planned}: planned training days met so far vs planned
# training days in the WHOLE athlete-local week. Planned rest days never enter
# the denominator; days later this week are never "missed", only not-yet-met.

MONDAY = TODAY - timedelta(days=TODAY.weekday())  # 2026-07-13


@pytest.mark.asyncio
async def test_consistency_met_vs_planned_week():
    mon, tue, wed = MONDAY, MONDAY + timedelta(days=1), MONDAY + timedelta(days=2)
    fri, sat = MONDAY + timedelta(days=4), MONDAY + timedelta(days=5)  # fri == TODAY
    planned = [
        (mon, "z2_long_120", "Long Z2 — 2h"),
        (tue, "rest_day", "Rest day"),          # rest: never in the denominator
        (wed, "vo2_5x3", "VO2 5x3"),
        (fri, "z2_90", "Z2 — 90min"),           # today, not yet trained
        (sat, "z2_180", "Long ride"),           # future: not missed, not met
    ]
    db = _db([mon, wed], planned, None)
    out = await build_streak(db, 1, today=TODAY)
    assert out["consistency"] == {"met": 2, "planned": 4}


@pytest.mark.asyncio
async def test_consistency_training_today_counts_immediately():
    planned = [(TODAY, "z2_90", "Z2 — 90min")]
    db = _db([TODAY], planned, None)
    out = await build_streak(db, 1, today=TODAY)
    assert out["consistency"] == {"met": 1, "planned": 1}


@pytest.mark.asyncio
async def test_consistency_rest_only_week_is_zero_of_zero():
    planned = [
        (MONDAY + timedelta(days=i), "rest_day", "Rest day") for i in range(7)
    ]
    db = _db([], planned, None)
    out = await build_streak(db, 1, today=TODAY)
    assert out["consistency"] == {"met": 0, "planned": 0}


@pytest.mark.asyncio
async def test_consistency_unplanned_week_is_zero_of_zero():
    # Training without a plan never manufactures a denominator.
    db = _db(_days(3), [], None)
    out = await build_streak(db, 1, today=TODAY)
    assert out["consistency"] == {"met": 0, "planned": 0}


@pytest.mark.asyncio
async def test_consistency_paused_days_drop_from_denominator():
    # Sick since Wednesday: Wed + Fri planned sessions drop out entirely —
    # illness must not read as broken consistency (no-guilt rule).
    mon, wed, fri = MONDAY, MONDAY + timedelta(days=2), MONDAY + timedelta(days=4)
    planned = [
        (mon, "z2_long_120", "Long Z2"),
        (wed, "vo2_5x3", "VO2"),
        (fri, "z2_90", "Z2"),
    ]
    goals = {"athlete_status": {"state": "sick", "since": wed.isoformat()}}
    db = _db([mon], planned, goals)
    out = await build_streak(db, 1, today=TODAY)
    assert out["consistency"] == {"met": 1, "planned": 1}


@pytest.mark.asyncio
async def test_consistency_trained_through_pause_still_counts():
    # Trained anyway on a paused day → the day stays in both counters.
    mon, wed = MONDAY, MONDAY + timedelta(days=2)
    planned = [(mon, "z2_long_120", "Long Z2"), (wed, "vo2_5x3", "VO2")]
    goals = {"athlete_status": {"state": "sick", "since": wed.isoformat()}}
    db = _db([mon, wed], planned, goals)
    out = await build_streak(db, 1, today=TODAY)
    assert out["consistency"] == {"met": 2, "planned": 2}


# ─── break_day anchor + morning-after repair (backlog 03·C2) ─────────────────
# `break_day` marks the most recent PAST day that broke the streak — the anchor
# the one-tap repair re-checks after a fresh sync. `repair_streak` restores only
# when a real qualifying ride now covers that day; otherwise it is honest.


@pytest.mark.asyncio
async def test_break_day_marks_the_missed_day():
    gap = TODAY - timedelta(days=2)
    activity_days = [d for d in _days(5) if d != gap]
    db = _db(activity_days, [], None)
    out = await build_streak(db, 1, today=TODAY)
    assert out["break_day"] == gap.isoformat()


@pytest.mark.asyncio
async def test_break_day_none_when_fully_trained_window():
    # Every day in the lookback trained → no break anywhere.
    db = _db(_days(LOOKBACK_DAYS + 1), [], None)
    out = await build_streak(db, 1, today=TODAY)
    assert out["break_day"] is None


@pytest.mark.asyncio
async def test_repair_nothing_when_gap_still_empty():
    # The missed day still has no ride after the re-check: honest, no restore.
    gap = TODAY - timedelta(days=2)
    activity_days = [d for d in _days(5) if d != gap]
    db = _db(activity_days, [], None)
    out = await repair_streak(db, 1, gap.isoformat(), today=TODAY)
    assert out["repaired"] is False
    assert out["reason"] == "nothing_to_repair"
    assert out["repaired_date"] == gap.isoformat()
    assert out["streak"] == 2  # unchanged, still broken at the gap


@pytest.mark.asyncio
async def test_repair_restores_when_late_ride_now_present():
    # The break was on `gap`; a late-synced ride has now arrived for that day, so
    # the streak's break has moved earlier → restored, longer streak stands.
    gap = TODAY - timedelta(days=2)
    filled = _days(5)  # every day incl. the previously-missed one
    db = _db(filled, [], None)
    out = await repair_streak(db, 1, gap.isoformat(), today=TODAY)
    assert out["repaired"] is True
    assert out["reason"] == "restored"
    assert out["streak"] == 5
