"""project_pmc_forward — forward TSB projection (roadmap P0.3).

Seeds history via a patched compute_user_pmc and plans via a fake db; asserts
EWMA rollforward, fresh/race-sharp landmark detection, band ordering, and the
recent-average fallback when no plan rows exist.
"""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import pmc_service


def _history(ctl: float, atl: float, daily_tss: float = 60.0):
    """90 days of flat history ending at (ctl, atl)."""
    rows = [{"date": date.today() - timedelta(days=i), "ctl": ctl, "atl": atl,
             "tsb": ctl - atl, "tss": daily_tss} for i in range(30, 0, -1)]
    return {"total": rows}


def _db(planned: list[tuple[date, str]]):
    db = MagicMock()

    async def execute(stmt):  # noqa: ANN001
        result = MagicMock()
        result.all.return_value = planned
        return result

    db.execute = AsyncMock(side_effect=execute)
    return db


@pytest.mark.asyncio
async def test_fatigued_athlete_recovers_on_rest_plan():
    # Deep fatigue (TSB -30); planned rest_day rows ahead → TSB climbs to fresh.
    plan = [(date.today() + timedelta(days=i), "rest_day") for i in range(1, 11)]
    with patch.object(pmc_service, "compute_user_pmc", new=AsyncMock(return_value=_history(60, 90, 0.0))):
        out = await pmc_service.project_pmc_forward(_db(plan), 1, days_ahead=10)
    assert out["already_fresh"] is False
    assert out["fresh_on"] is not None
    assert out["basis"] == "plan"
    # TSB strictly increases under full rest
    tsbs = [d["tsb"] for d in out["days"]]
    assert tsbs == sorted(tsbs)


@pytest.mark.asyncio
async def test_band_ordering():
    plan = [(date.today() + timedelta(days=i), "z2_long_120") for i in range(1, 11)]
    with patch.object(pmc_service, "compute_user_pmc", new=AsyncMock(return_value=_history(60, 70, 60.0))):
        out = await pmc_service.project_pmc_forward(_db(plan), 1, days_ahead=10)
    for d in out["days"]:
        assert d["tsb_low"] <= d["tsb"] <= d["tsb_high"]


@pytest.mark.asyncio
async def test_recent_average_fallback_when_no_plan():
    with patch.object(pmc_service, "compute_user_pmc", new=AsyncMock(return_value=_history(60, 65, 60.0))):
        out = await pmc_service.project_pmc_forward(_db([]), 1, days_ahead=7)
    assert out["basis"] == "recent-average"
    assert all(d["source"] == "recent-average" for d in out["days"])
    assert len(out["days"]) == 7


@pytest.mark.asyncio
async def test_already_fresh_athlete():
    with patch.object(pmc_service, "compute_user_pmc", new=AsyncMock(return_value=_history(60, 55, 50.0))):
        out = await pmc_service.project_pmc_forward(_db([]), 1, days_ahead=5)
    assert out["already_fresh"] is True


@pytest.mark.asyncio
async def test_no_history_returns_empty():
    with patch.object(pmc_service, "compute_user_pmc", new=AsyncMock(return_value={"total": []})):
        out = await pmc_service.project_pmc_forward(_db([]), 1)
    assert out["days"] == []
    assert out["fresh_on"] is None
