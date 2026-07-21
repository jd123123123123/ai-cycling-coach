"""Integration smoke tests for GET /health/morning-check.

Strategy mirrors test_weeks.py: dependency_overrides swap out auth + the
RLS db dep with an AsyncMock that returns DailyMetric-like rows, so the
endpoint's real query → detector → schema path runs without Postgres.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user


def _row(day: date, *, rhr, hrv, resp, spo2, sleep):
    return SimpleNamespace(
        date=day,
        recorded_at=datetime(day.year, day.month, day.day, tzinfo=timezone.utc),
        resting_hr=rhr, hrv_status=hrv, respiration_avg=resp, spo2_avg=spo2, sleep_score=sleep,
    )


def _mock_db(rows):
    db = AsyncMock()

    async def _execute(query, *a, **k):  # noqa: ANN001
        result = MagicMock()
        result.scalars.return_value.all.return_value = rows
        return result

    db.execute = _execute
    db.close = AsyncMock()
    return db


def _install(rows, user_id=1):
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    db = _mock_db(rows)

    async def _u():
        return user

    async def _d():
        yield db

    app.dependency_overrides[get_current_active_user] = _u
    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_db_for_user] = _d


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


class TestUnauthenticated:
    def test_401(self, client):
        assert client.get("/health/morning-check").status_code == 401


class TestNormal:
    def test_normal_vitals_return_level_none_no_card(self, client):
        rows = [
            _row(date.today() - timedelta(days=i), rhr=48, hrv=65, resp=13.0, spo2=96.0, sleep=82)
            for i in range(20, -1, -1)
        ]
        _install(rows)
        try:
            resp = client.get("/health/morning-check?locale=de")
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200
        body = resp.json()
        assert body["level"] == "none"
        assert body["signals"] == []
        assert body["recommendation"] is None


class TestClusterEndToEnd:
    def test_illness_cluster_returns_high_with_localized_recommendation(self, client):
        rows = [
            _row(date.today() - timedelta(days=i), rhr=48, hrv=65, resp=13.0, spo2=96.0, sleep=82)
            for i in range(20, 0, -1)
        ]
        rows.append(_row(date.today(), rhr=55, hrv=45, resp=16.0, spo2=95.0, sleep=70))
        _install(rows)
        try:
            resp = client.get("/health/morning-check?locale=de")
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200
        body = resp.json()
        assert body["level"] == "high"
        assert body["headline"] is not None
        assert "Ruhepuls" in body["recommendation"]
        metrics = {s["metric"] for s in body["signals"]}
        assert {"resting_hr", "hrv", "respiration"} <= metrics
