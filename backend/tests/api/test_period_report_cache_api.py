"""GET /analytics/period-report serves from the read-through cache."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user
from app.schemas.period_report import PeriodReport


def _user():
    u = MagicMock(); u.id = 1; u.is_active = True
    return u


def _report():
    return PeriodReport(
        days=7, start_date="2026-06-18", end_date="2026-06-24",
        prev_start_date="2026-06-11", prev_end_date="2026-06-17",
        has_baseline=False, grade_letter=None, grade_score=None,
        radar=[], improvements=[], weaknesses=[], milestones=[],
        ai_verdict="x", ai_model="rule-based-fallback",
        generated_at=datetime(2026, 6, 24, 7, 0, tzinfo=timezone.utc),
    )


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.clear()


def _override():
    async def _u():
        return _user()

    async def _d():
        yield AsyncMock()

    app.dependency_overrides[get_current_active_user] = _u
    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_db_for_user] = _d


def test_get_period_report_uses_cache_wrapper(client, monkeypatch):
    wrapper = AsyncMock(return_value=_report())
    monkeypatch.setattr("app.api.analytics.get_or_build_report", wrapper)
    _override()
    resp = client.get("/analytics/period-report?days=7")
    assert resp.status_code == 200
    assert resp.json()["generated_at"] is not None
    wrapper.assert_awaited_once()
