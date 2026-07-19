"""Garmin weight ingestion — parse + apply (clean retry)."""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.garmin_weight import apply_weigh_ins, parse_weigh_ins


def test_parse_typical_payload():
    payload = {
        "dailyWeightSummaries": [
            {
                "summaryDate": "2026-07-18",
                "allWeightMetrics": [
                    {"weight": 82500.0, "timestampGMT": 1},
                    {"weight": 82100.0, "timestampGMT": 2},  # later wins
                ],
            },
            {"summaryDate": "2026-07-19", "latestWeight": {"weight": 81900.0}},
        ]
    }
    out = parse_weigh_ins(payload)
    assert out == {date(2026, 7, 18): 82.1, date(2026, 7, 19): 81.9}


@pytest.mark.parametrize("payload", [None, {}, {"dailyWeightSummaries": None}, {"dailyWeightSummaries": [{"summaryDate": "bad"}]}, "junk"])
def test_parse_garbage_is_empty(payload):
    assert parse_weigh_ins(payload) == {}


def test_parse_sanity_bounds():
    payload = {"dailyWeightSummaries": [
        {"summaryDate": "2026-07-18", "latestWeight": {"weight": 5000.0}},     # 5 kg — junk
        {"summaryDate": "2026-07-19", "latestWeight": {"weight": 500000.0}},   # 500 kg — junk
    ]}
    assert parse_weigh_ins(payload) == {}


def _db(metric_row, profile):
    db = MagicMock()

    async def execute(stmt):  # noqa: ANN001
        result = MagicMock()
        text = str(stmt).lower()
        result.scalar_one_or_none.return_value = profile if "athlete_profiles" in text else metric_row
        return result

    db.execute = AsyncMock(side_effect=execute)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_apply_updates_row_and_profile():
    row = SimpleNamespace(weight_kg=None)
    profile = SimpleNamespace(weight_kg=84.0)
    db = _db(row, profile)
    n = await apply_weigh_ins(db, 1, {date(2026, 7, 19): 81.9})
    assert n == 1 and row.weight_kg == 81.9 and profile.weight_kg == 81.9
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_apply_never_raises():
    db = MagicMock()
    db.execute = AsyncMock(side_effect=RuntimeError("boom"))
    db.rollback = AsyncMock()
    assert await apply_weigh_ins(db, 1, {date(2026, 7, 19): 80.0}) == 0
