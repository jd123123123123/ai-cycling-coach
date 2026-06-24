"""Integration tests for /tab-layouts (mocked db, dependency_overrides)."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user


def _make_user(user_id: int = 1) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


def _make_mock_db(existing_row=None):
    """AsyncMock session whose execute().scalar_one_or_none() returns existing_row."""
    db = AsyncMock()

    async def _execute(query, *args, **kwargs):  # noqa: ANN001
        result = MagicMock()
        result.scalar_one_or_none.return_value = existing_row
        return result

    db.execute = _execute
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


def _override(user, db):
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


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.clear()


def test_get_requires_auth(client):
    assert client.get("/tab-layouts").status_code == 401


def test_get_returns_empty_when_no_row(client):
    _override(_make_user(), _make_mock_db(existing_row=None))
    resp = client.get("/tab-layouts")
    assert resp.status_code == 200
    assert resp.json() == {"layouts": {}}


def test_get_returns_saved_layouts(client):
    row = MagicMock()
    row.layouts = {"today": [{"id": "coach-brief", "hidden": True}]}
    _override(_make_user(), _make_mock_db(existing_row=row))
    resp = client.get("/tab-layouts")
    assert resp.json()["layouts"]["today"][0]["id"] == "coach-brief"


def test_put_creates_when_no_row(client):
    db = _make_mock_db(existing_row=None)
    _override(_make_user(), db)
    body = {"layouts": {"today": [{"id": "today-hero", "hidden": False}]}}
    resp = client.put("/tab-layouts", json=body)
    assert resp.status_code == 200
    assert resp.json() == body
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


def test_put_updates_existing_row(client):
    row = MagicMock()
    row.layouts = {"today": []}
    db = _make_mock_db(existing_row=row)
    _override(_make_user(), db)
    body = {"layouts": {"trends": [{"id": "trends-hero", "hidden": False}]}}
    resp = client.put("/tab-layouts", json=body)
    assert resp.status_code == 200
    assert row.layouts == body["layouts"]
    db.add.assert_not_called()


def test_put_rejects_oversized_payload(client):
    _override(_make_user(), _make_mock_db(existing_row=None))
    body = {"layouts": {f"tab{i}": [] for i in range(33)}}
    assert client.put("/tab-layouts", json=body).status_code == 422
