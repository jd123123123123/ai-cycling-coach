"""Tests for the period-report cache: schema field + model import."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.services.garmin_sync_service as sync_mod
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
    assert out.generated_at is not None  # stamped by atomic upsert


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


def test_morning_gate_false_before_morning():
    now = datetime(2026, 6, 24, 6, 0, tzinfo=timezone.utc)  # 06:00 UTC
    assert pr.should_precompute_daily(now, None, None) is False


def test_morning_gate_true_first_time_after_morning():
    now = datetime(2026, 6, 24, 10, 0, tzinfo=timezone.utc)  # 10:00 UTC
    assert pr.should_precompute_daily(now, None, None) is True


def test_morning_gate_false_when_already_done_today():
    now = datetime(2026, 6, 24, 14, 0, tzinfo=timezone.utc)
    last = datetime(2026, 6, 24, 9, 30, tzinfo=timezone.utc)  # generated at 09:30 today
    assert pr.should_precompute_daily(now, None, last) is False


def test_morning_gate_true_when_last_was_yesterday():
    now = datetime(2026, 6, 24, 9, 5, tzinfo=timezone.utc)
    last = datetime(2026, 6, 23, 12, 0, tzinfo=timezone.utc)
    assert pr.should_precompute_daily(now, None, last) is True


def test_morning_gate_respects_athlete_timezone():
    # 08:00 UTC == 10:00 in Europe/Berlin (UTC+2 in June) → past the 09:00 local gate
    now = datetime(2026, 6, 24, 8, 0, tzinfo=timezone.utc)
    assert pr.should_precompute_daily(now, "Europe/Berlin", None) is True


def test_morning_gate_bad_timezone_falls_back_to_utc():
    now = datetime(2026, 6, 24, 6, 0, tzinfo=timezone.utc)  # before 09:00 UTC
    assert pr.should_precompute_daily(now, "Not/AZone", None) is False


@pytest.mark.asyncio
async def test_refresh_cache_warms_on_new_activity(monkeypatch):
    precompute = AsyncMock()
    monkeypatch.setattr(sync_mod, "precompute_preset_reports", precompute)
    monkeypatch.setattr(sync_mod, "should_precompute_daily", lambda *a, **k: False)
    db = _db_returning(None)
    await sync_mod._refresh_period_report_cache(
        db, user_id=1, today=datetime.now(timezone.utc).date(),
        new_activities=3, tz_name=None,
    )
    precompute.assert_awaited_once()  # a workout landed → warm presets


@pytest.mark.asyncio
async def test_refresh_cache_warms_on_daily_gate_without_activity(monkeypatch):
    precompute = AsyncMock()
    monkeypatch.setattr(sync_mod, "precompute_preset_reports", precompute)
    monkeypatch.setattr(sync_mod, "should_precompute_daily", lambda *a, **k: True)
    db = _db_returning(None)
    await sync_mod._refresh_period_report_cache(
        db, user_id=1, today=datetime.now(timezone.utc).date(),
        new_activities=0, tz_name="Europe/Berlin",
    )
    precompute.assert_awaited_once()  # daily morning refresh


@pytest.mark.asyncio
async def test_refresh_cache_skips_when_nothing_due(monkeypatch):
    precompute = AsyncMock()
    monkeypatch.setattr(sync_mod, "precompute_preset_reports", precompute)
    monkeypatch.setattr(sync_mod, "should_precompute_daily", lambda *a, **k: False)
    db = _db_returning(None)
    await sync_mod._refresh_period_report_cache(
        db, user_id=1, today=datetime.now(timezone.utc).date(),
        new_activities=0, tz_name=None,
    )
    precompute.assert_not_called()  # no workout + not morning-due → no warm
