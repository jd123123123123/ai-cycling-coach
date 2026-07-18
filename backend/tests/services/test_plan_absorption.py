"""Absorb-and-replan (roadmap P1.4).

Unplanned rides ≥40 TSS and rides ≥140% of plan get absorbed exactly once;
the week rebalances by downgrading the biggest remaining session only when
running >110% of the planned total; absorption never raises.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.plan_absorption import absorb_new_activities

NOW = datetime.now(timezone.utc)
TODAY = NOW.date()


def _act(aid: int, tss: float, hours_ago: float = 5.0):
    return SimpleNamespace(id=aid, sport="cycling", tss=tss, started_at=NOW - timedelta(hours=hours_ago))


def _plan(d: date, template_id: str, title: str = ""):
    return SimpleNamespace(
        date=d, template_id=template_id, title=title or template_id,
        duration_seconds_target=3600, blocks_source="ai_prescribed", interval_structure={},
    )


def _db(acts, audits, day_plans, week_plans, week_tss_rows):
    db = MagicMock()

    async def execute(stmt):  # noqa: ANN001
        text = str(stmt)
        low = text.lower()
        result = MagicMock()
        if "coach_briefs" in low:
            result.scalars.return_value.all.return_value = audits
        elif "planned_workouts" in low and "planned_workouts.date = " in low:
            result.scalars.return_value.all.return_value = day_plans
        elif "planned_workouts" in low:
            result.scalars.return_value.all.return_value = week_plans
        elif "activities.tss" in low and "activities.id" not in low:
            result.all.return_value = week_tss_rows
        else:  # full Activity select
            result.scalars.return_value.all.return_value = acts
        return result

    db.execute = AsyncMock(side_effect=execute)
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_unplanned_ride_absorbed_without_rebalance():
    # 82-TSS unplanned ride; week has no plan rows → absorb, no rebalance.
    db = _db([_act(1, 82.0)], [], [], [], [])
    out = await absorb_new_activities(db, 1)
    assert len(out) == 1
    assert out[0]["kind"] == "unplanned"
    assert out[0]["rebalance"] is None
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_small_unplanned_ride_ignored():
    db = _db([_act(1, 25.0)], [], [], [], [])
    out = await absorb_new_activities(db, 1)
    assert out == []


@pytest.mark.asyncio
async def test_planned_ride_within_tolerance_ignored():
    plans = [_plan(TODAY, "z2_progressive_90")]  # ~68 TSS
    db = _db([_act(1, 80.0)], [], plans, plans, [])
    out = await absorb_new_activities(db, 1)
    assert out == []  # 80 < 68*1.4


@pytest.mark.asyncio
async def test_big_week_downgrades_biggest_remaining_session():
    # Unplanned 200-TSS ride; week planned 5×z2_progressive_90 (~340 TSS);
    # banked 400 already → projected way over → biggest remaining downgraded.
    future1 = _plan(TODAY + timedelta(days=1), "z2_long_120", "Long Z2 — 2h")
    future2 = _plan(TODAY + timedelta(days=2), "z2_progressive_90", "Progressive Z2")
    week = [_plan(TODAY - timedelta(days=1), "z2_progressive_90"), future1, future2]
    db = _db([_act(1, 200.0)], [], [], week, [(200.0,), (200.0,)])
    out = await absorb_new_activities(db, 1)
    assert len(out) == 1
    rb = out[0]["rebalance"]
    assert rb is not None
    assert rb["from"] == "z2_long_120"  # biggest remaining
    assert rb["to"] in ("rest_day", "recovery_60")
    assert future1.blocks_source == "coach_absorbed"


@pytest.mark.asyncio
async def test_already_absorbed_not_repeated():
    audits = [{"absorption": {"activity_id": 1}}]
    db = _db([_act(1, 82.0)], audits, [], [], [])
    out = await absorb_new_activities(db, 1)
    assert out == []


@pytest.mark.asyncio
async def test_absorption_never_raises():
    db = MagicMock()
    db.execute = AsyncMock(side_effect=RuntimeError("db down"))
    out = await absorb_new_activities(db, 1)
    assert out == []
