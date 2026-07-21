"""GET/PUT /activities/{id}/rpe — the post-ride RPE loop persistence.

Follows the mocked-`db.execute` dependency-override harness used across this
repo's API tests (no real Postgres fixture — RLS + TimescaleDB semantics need
real PG). The endpoint logic (upsert dispatch, 404 guard, read hydration) runs
for real against a query-dispatching fake db.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user


class _ScalarsResult:
    def __init__(self, rows):
        self._rows = rows

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeResult:
    def __init__(self, *, rows=None, first_row=None):
        self._rows = rows or []
        self._first = first_row

    def scalars(self):
        return _ScalarsResult(self._rows)

    def first(self):
        return self._first


def _user():
    u = MagicMock(); u.id = 5; u.is_active = True
    return u


def _override(db):
    async def _u():
        return _user()

    async def _d():
        yield db

    app.dependency_overrides[get_current_active_user] = _u
    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_db_for_user] = _d


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.clear()


def _feedback_row(rpe: str):
    return SimpleNamespace(
        activity_id=1, rpe=rpe,
        updated_at=datetime(2026, 7, 21, 9, 0, tzinfo=timezone.utc),
    )


def test_get_rpe_returns_null_when_unset(client):
    db = AsyncMock()

    async def _execute(stmt, *a, **k):
        assert "ride_feedback" in str(stmt)
        return _FakeResult(rows=[])  # no row yet

    db.execute = _execute
    _override(db)

    resp = client.get("/activities/1/rpe")
    assert resp.status_code == 200
    assert resp.json() == {"activity_id": 1, "rpe": None, "updated_at": None}


def test_get_rpe_returns_stored_value(client):
    db = AsyncMock()

    async def _execute(stmt, *a, **k):
        return _FakeResult(rows=[_feedback_row("hard")])

    db.execute = _execute
    _override(db)

    resp = client.get("/activities/1/rpe")
    assert resp.status_code == 200
    body = resp.json()
    assert body["rpe"] == "hard"
    assert body["activity_id"] == 1


def test_put_rpe_upserts_and_returns_value(client, monkeypatch):
    # Guard: activity must exist — stub the ownership lookup.
    async def _get_activity(*, db, user_id, activity_id):
        return SimpleNamespace(id=activity_id, sport="cycling")

    monkeypatch.setattr("app.api.activities.activity_service.get_activity", _get_activity)

    seen = {}
    db = AsyncMock()

    async def _execute(stmt, *a, **k):
        sql = str(stmt)
        assert "ride_feedback" in sql
        seen["insert"] = "INSERT" in sql.upper()
        return _FakeResult(
            first_row=("moderate", datetime(2026, 7, 21, 9, 0, tzinfo=timezone.utc)),
        )

    db.execute = _execute
    db.commit = AsyncMock()
    _override(db)

    resp = client.put("/activities/1/rpe", json={"rpe": "moderate"})
    assert resp.status_code == 200
    assert resp.json()["rpe"] == "moderate"
    assert seen["insert"] is True
    db.commit.assert_awaited()


def test_put_rpe_404_when_activity_missing(client, monkeypatch):
    async def _get_activity(*, db, user_id, activity_id):
        return None

    monkeypatch.setattr("app.api.activities.activity_service.get_activity", _get_activity)
    db = AsyncMock()
    _override(db)

    resp = client.put("/activities/999/rpe", json={"rpe": "easy"})
    assert resp.status_code == 404


def test_put_rpe_rejects_invalid_value(client):
    db = AsyncMock()
    _override(db)
    resp = client.put("/activities/1/rpe", json={"rpe": "brutal"})
    assert resp.status_code == 422
