"""Integration tests for /workouts (mocked db, dependency_overrides)."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user


def _act(**kw):
    base = dict(
        id=1, started_at=datetime(2026, 1, 1, tzinfo=timezone.utc), title="Zwift - Forge",
        sport="cycling", duration_seconds=3600, distance_meters=30000.0, tss=70.0,
        average_power=200.0, normalized_power=210.0, average_hr=150, max_hr=175,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _db_with_activities(acts):
    db = AsyncMock()

    async def _execute(*a, **k):
        res = MagicMock()
        res.scalars.return_value = list(acts)
        return res

    db.execute = _execute
    return db


def _user():
    u = MagicMock(); u.id = 1; u.is_active = True
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


def test_list_requires_auth(client):
    assert client.get("/workouts").status_code == 401


def test_list_returns_only_repeated_groups_sorted(client):
    acts = [
        _act(id=1, title="Zwift - Forge", started_at=datetime(2026, 1, 1, tzinfo=timezone.utc)),
        _act(id=2, title="Forge", started_at=datetime(2026, 2, 1, tzinfo=timezone.utc)),
        _act(id=3, title="ROUVY - Solo", started_at=datetime(2026, 1, 5, tzinfo=timezone.utc)),  # only 1 → excluded
    ]
    _override(_db_with_activities(acts))
    resp = client.get("/workouts")
    assert resp.status_code == 200
    body = resp.json()
    assert [g["key"] for g in body] == ["forge"]  # 'solo' has <2 reps, dropped
    assert body[0]["count"] == 2


def test_detail_returns_reps_and_trends(client):
    acts = [
        _act(id=1, title="Zwift - Forge", started_at=datetime(2026, 1, 1, tzinfo=timezone.utc), normalized_power=200.0, average_hr=160),
        _act(id=2, title="Forge", started_at=datetime(2026, 2, 1, tzinfo=timezone.utc), normalized_power=220.0, average_hr=160),
    ]
    _override(_db_with_activities(acts))
    resp = client.get("/workouts/forge")
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] in ("Zwift - Forge", "Forge")
    assert [r["activity_id"] for r in body["reps"]] == [1, 2]
    assert any(t["metric"] == "efficiency" for t in body["trends"])


def test_detail_unknown_key_404(client):
    _override(_db_with_activities([_act(id=1, title="Zwift - Forge"), _act(id=2, title="Forge")]))
    assert client.get("/workouts/nope").status_code == 404

