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
    # +3.9% — above the 2% gate, below the 5% suspect threshold that would
    # require a corroborating second ride (audit P0-1).
    rows = _flat_history() + [_ride(99, 0.5, {"300": 239.0, "60": 322.0}, eftp=201.0)]
    out = await detect_breakthroughs(_db(rows), 1)
    kinds = {(b["kind"], b.get("duration_s")) for b in out}
    assert ("power_pb", 300) in kinds  # 239 vs 230 = +3.9%
    pb = next(b for b in out if b.get("duration_s") == 300)
    assert pb["value_w"] == 239 and pb["prior_best_w"] == 230


@pytest.mark.asyncio
async def test_uncorroborated_suspect_gain_is_suppressed():
    # A one-off +30% "PB" is a corrupt file, not physiology — silent.
    rows = _flat_history() + [_ride(99, 0.5, {"300": 300.0})]
    out = await detect_breakthroughs(_db(rows), 1)
    assert not [b for b in out if b["kind"] == "power_pb"]


@pytest.mark.asyncio
async def test_corroborated_large_gain_is_celebrated():
    # The first big ride (300 W, 5 days ago) was suppressed at its time; when
    # the athlete CONFIRMS it (302 W today), the breakthrough fires — measured
    # against the sanitized (pre-spike) baseline of 230 W.
    rows = (
        _flat_history()
        + [_ride(50, 5, {"300": 300.0})]
        + [_ride(99, 0.5, {"300": 302.0})]
    )
    out = await detect_breakthroughs(_db(rows), 1)
    pb = [b for b in out if b["kind"] == "power_pb" and b["duration_s"] == 300]
    assert pb and pb[0]["value_w"] == 302 and pb[0]["prior_best_w"] == 230


@pytest.mark.asyncio
async def test_corrupt_prior_does_not_raise_the_baseline():
    # A corrupt 359-W prior must not suppress a real +3.9% PB vs the sane 230 W.
    rows = (
        _flat_history()
        + [_ride(50, 30, {"300": 359.0})]
        + [_ride(99, 0.5, {"300": 239.0})]
    )
    out = await detect_breakthroughs(_db(rows), 1)
    pb = [b for b in out if b["kind"] == "power_pb" and b["duration_s"] == 300]
    assert pb and pb[0]["prior_best_w"] == 230


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
async def test_uncorroborated_eftp_spike_is_suppressed():
    # +25% eFTP in one ride = corrupt power model, not a new engine.
    rows = _flat_history() + [_ride(99, 0.5, {"300": 230.0}, eftp=250.0)]
    out = await detect_breakthroughs(_db(rows), 1)
    assert not [b for b in out if b["kind"] == "eftp_shift"]


@pytest.mark.asyncio
async def test_old_rides_not_celebrated():
    # The PB ride is 10 days old — outside the recent window.
    rows = _flat_history() + [_ride(99, 10, {"300": 260.0})]
    out = await detect_breakthroughs(_db(rows), 1, recent_days=2)
    assert out == []
