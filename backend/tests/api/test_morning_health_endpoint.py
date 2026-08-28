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
from app.services.athlete_time import today_local


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


def _baseline_rows(*, anchor, n=20, offset=0):
    """`n` steady baseline days ending `offset` days before `anchor`."""
    return [
        _row(anchor - timedelta(days=i + offset), rhr=48, hrv=65, resp=13.0, spo2=96.0, sleep=82)
        for i in range(n, 0, -1)
    ]


class TestNormal:
    def test_normal_vitals_return_level_none_no_card(self, client):
        today = today_local()
        rows = _baseline_rows(anchor=today) + [
            _row(today, rhr=48, hrv=65, resp=13.0, spo2=96.0, sleep=82)
        ]
        _install(rows)
        try:
            resp = client.get("/health/morning-check?locale=de")
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200
        body = resp.json()
        assert body["level"] == "none"
        assert body["recommendation"] is None
        assert body["polarity"] is None
        # NOT `signals == []`. That assertion used to stand in for "no card
        # renders", and the service matched it — which is why a rider having a
        # perfectly ordinary morning got a response with no markers at all, and
        # why HRV was missing from the Today nudge and from the morning
        # report's spectrum. `level` is what suppresses the card; what must
        # hold here is that nothing claims to be a reason.
        assert not any(s["triggered"] for s in body["signals"])
        assert "hrv" in {s["metric"] for s in body["signals"]}


class TestClusterEndToEnd:
    def test_illness_cluster_returns_high_with_localized_recommendation(self, client):
        today = today_local()
        rows = _baseline_rows(anchor=today)
        rows.append(_row(today, rhr=55, hrv=45, resp=16.0, spo2=95.0, sleep=70))
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


class TestStaleVitals:
    """The early-warning card must never fire off a reading that isn't today's.

    Regression cover for the live 2026-07-27 defect: with the newest
    daily_metrics row dated 2026-07-20 the endpoint still rendered a
    role="alert" health warning ("Rest today and listen to your body") off a
    week-old vitals cluster, because the detector takes its last row as "today".
    """

    def test_illness_cluster_dated_yesterday_returns_none(self, client):
        today = today_local()
        yesterday = today - timedelta(days=1)
        rows = _baseline_rows(anchor=today, offset=1)
        rows.append(_row(yesterday, rhr=55, hrv=45, resp=16.0, spo2=95.0, sleep=70))
        _install(rows)
        try:
            resp = client.get("/health/morning-check?locale=de")
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200
        body = resp.json()
        assert body["level"] == "none"
        assert body["signals"] == []
        assert body["headline"] is None
        assert body["recommendation"] is None

    def test_week_old_illness_cluster_returns_none(self, client):
        today = today_local()
        stale = today - timedelta(days=7)
        rows = _baseline_rows(anchor=today, offset=7)
        rows.append(_row(stale, rhr=55, hrv=45, resp=16.0, spo2=95.0, sleep=70))
        _install(rows)
        try:
            resp = client.get("/health/morning-check?locale=de")
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200
        assert resp.json()["level"] == "none"

    def test_no_rows_at_all_returns_none(self, client):
        _install([])
        try:
            resp = client.get("/health/morning-check?locale=de")
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200
        assert resp.json()["level"] == "none"
