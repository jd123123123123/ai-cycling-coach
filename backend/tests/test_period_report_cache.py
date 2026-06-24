"""Tests for the period-report cache: schema field + model import."""
import types
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.services.period_report as pr
from app.schemas.period_report import PeriodReport


def _minimal_report_kwargs() -> dict:
    return dict(
        days=7, start_date="2026-06-18", end_date="2026-06-24",
        prev_start_date="2026-06-11", prev_end_date="2026-06-17",
        has_baseline=False, grade_letter=None, grade_score=None,
        radar=[], improvements=[], weaknesses=[], milestones=[],
        ai_verdict="x", ai_model="rule-based-fallback",
    )


def _fresh_row(days=7):
    row = MagicMock()
    row.report = _minimal_report_kwargs() | {"days": days}
    row.generated_at = datetime.now(timezone.utc)
    return row


def _db_returning(row):
    db = AsyncMock()

    async def _execute(*a, **k):
        res = MagicMock()
        res.scalar_one_or_none.return_value = row
        return res

    db.execute = _execute
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


def test_generated_at_defaults_none():
    r = PeriodReport(**_minimal_report_kwargs())
    assert r.generated_at is None


def test_generated_at_round_trips_through_dump_and_validate():
    ts = datetime(2026, 6, 24, 7, 30, tzinfo=timezone.utc)
    r = PeriodReport(**_minimal_report_kwargs(), generated_at=ts)
    dumped = r.model_dump(mode="json")
    # merging a stored timestamp back in (the cache read path) validates cleanly
    again = PeriodReport.model_validate({**dumped, "generated_at": ts})
    assert again.generated_at == ts


@pytest.mark.asyncio
async def test_get_or_build_returns_cache_without_building(monkeypatch):
    build = AsyncMock()
    monkeypatch.setattr(pr, "build_report", build)
    db = _db_returning(_fresh_row(7))
    out = await pr.get_or_build_report(db, user_id=1, days=7)
    assert out.days == 7
    build.assert_not_called()  # served from cache


@pytest.mark.asyncio
async def test_get_or_build_builds_and_upserts_on_miss(monkeypatch):
    built = PeriodReport(**_minimal_report_kwargs())
    build = AsyncMock(return_value=built)
    monkeypatch.setattr(pr, "build_report", build)
    db = _db_returning(None)  # no fresh row, no existing row
    out = await pr.get_or_build_report(db, user_id=1, days=7)
    build.assert_awaited_once()
    assert out.generated_at is not None  # stamped on build
    db.add.assert_called_once()          # inserted a new cache row


@pytest.mark.asyncio
async def test_precompute_writes_all_presets(monkeypatch):
    build = AsyncMock(return_value=PeriodReport(**_minimal_report_kwargs()))
    monkeypatch.setattr(pr, "build_report", build)
    db = _db_returning(None)
    await pr.precompute_preset_reports(db, user_id=1)
    assert build.await_count == len(pr.PRESET_WINDOWS)  # one build per preset


@pytest.mark.asyncio
async def test_precompute_continues_when_one_window_fails(monkeypatch):
    calls = {"n": 0}

    async def flaky(db, user_id, days):
        calls["n"] += 1
        if days == 14:
            raise RuntimeError("boom")
        return PeriodReport(**(_minimal_report_kwargs() | {"days": days}))

    monkeypatch.setattr(pr, "build_report", flaky)
    db = _db_returning(None)
    await pr.precompute_preset_reports(db, user_id=1)  # must not raise
    assert calls["n"] == len(pr.PRESET_WINDOWS)  # tried all three
