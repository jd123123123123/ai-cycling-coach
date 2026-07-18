"""Breakthrough detector (roadmap P1.2) — conservative by design.

PB fires only on ≥2% gain over the prior 90-day best with ≥5 prior powered
rides; eFTP shift needs ≥5 W; durations under 60 s are never evaluated.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.breakthrough_detector import detect_breakthroughs

NOW = datetime.now(timezone.utc)


def _ride(i: int, days_ago: float, mmp: dict, eftp: float | None = None):
    return (i, NOW - timedelta(days=days_ago), f"Ride {i}", mmp, eftp)


def _db(rows):
    db = MagicMock()

    async def execute(stmt):  # noqa: ANN001
        result = MagicMock()
        result.all.return_value = rows
        return result

    db.execute = AsyncMock(side_effect=execute)
    return db


def _flat_history(n=6, w=230.0, start_days_ago=60.0):
    """n prior rides, identical curves."""
    return [
        _ride(i, start_days_ago - i, {"300": w, "60": w * 1.4}, eftp=200.0)
        for i in range(n)
    ]


@pytest.mark.asyncio
async def test_pb_fires_on_clear_gain():
    rows = _flat_history() + [_ride(99, 0.5, {"300": 245.0, "60": 322.0}, eftp=201.0)]
    out = await detect_breakthroughs(_db(rows), 1)
    kinds = {(b["kind"], b.get("duration_s")) for b in out}
    assert ("power_pb", 300) in kinds  # 245 vs 230 = +6.5%
    pb = next(b for b in out if b.get("duration_s") == 300)
    assert pb["value_w"] == 245 and pb["prior_best_w"] == 230


@pytest.mark.asyncio
async def test_small_gain_below_gate_is_silent():
    rows = _flat_history() + [_ride(99, 0.5, {"300": 233.0})]  # +1.3% < 2%
    out = await detect_breakthroughs(_db(rows), 1)
    assert not [b for b in out if b["kind"] == "power_pb"]


@pytest.mark.asyncio
async def test_sparse_history_is_silent():
    rows = _flat_history(n=3) + [_ride(99, 0.5, {"300": 300.0})]
    out = await detect_breakthroughs(_db(rows), 1)
    assert out == []


@pytest.mark.asyncio
async def test_sprint_durations_never_evaluated():
    rows = _flat_history() + [_ride(99, 0.5, {"5": 1200.0, "300": 230.0})]
    out = await detect_breakthroughs(_db(rows), 1)
    assert not [b for b in out if b.get("duration_s") in (1, 5, 10, 15, 30)]


@pytest.mark.asyncio
async def test_eftp_shift():
    rows = _flat_history() + [_ride(99, 0.5, {"300": 230.0}, eftp=207.0)]
    out = await detect_breakthroughs(_db(rows), 1)
    shift = [b for b in out if b["kind"] == "eftp_shift"]
    assert shift and shift[0]["value_w"] == 207 and shift[0]["prior_best_w"] == 200


@pytest.mark.asyncio
async def test_old_rides_not_celebrated():
    # The PB ride is 10 days old — outside the recent window.
    rows = _flat_history() + [_ride(99, 10, {"300": 260.0})]
    out = await detect_breakthroughs(_db(rows), 1, recent_days=2)
    assert out == []
