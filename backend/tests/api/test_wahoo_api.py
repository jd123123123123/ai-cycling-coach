"""API tests for /wahoo — auth guard, not-configured 409, connect URL, status."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.dependencies import (
    get_current_active_user,
    get_current_user,
    get_db_for_user,
)
from app.main import app


def _make_user(user_id: int = 1) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


def _make_mock_db(existing_row=None):
    db = AsyncMock()

    async def _execute(query, *args, **kwargs):  # noqa: ANN001
        result = MagicMock()
        result.scalar_one_or_none.return_value = existing_row
        return result

    db.execute = _execute
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.delete = AsyncMock()
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


def test_connect_requires_auth(client):
    assert client.get("/wahoo/connect").status_code == 401


def test_connect_not_configured_returns_409(client, monkeypatch):
    monkeypatch.setattr(settings, "WAHOO_CLIENT_ID", "")
    monkeypatch.setattr(settings, "WAHOO_CLIENT_SECRET", "")
    _override(_make_user(), _make_mock_db())
    resp = client.get("/wahoo/connect")
    assert resp.status_code == 409
    assert "not configured" in resp.json()["detail"].lower()


def test_connect_returns_authorize_url_when_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "WAHOO_CLIENT_ID", "test-client")
    monkeypatch.setattr(settings, "WAHOO_CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "WAHOO_REDIRECT_URI", "https://app.example.com/wahoo/callback")
    _override(_make_user(), _make_mock_db())
    resp = client.get("/wahoo/connect")
    assert resp.status_code == 200
    url = resp.json()["authorize_url"]
    assert url.startswith("https://api.wahooligan.com/oauth/authorize")
    assert "client_id=test-client" in url
    assert "response_type=code" in url
    assert "user_read" in url  # scope present
    assert "state=" in url


def test_status_disconnected(client):
    _override(_make_user(), _make_mock_db(existing_row=None))
    resp = client.get("/wahoo/status")
    assert resp.status_code == 200
    assert resp.json() == {"connected": False, "wahoo_user_id": None, "last_sync": None}


def test_status_connected(client):
    cred = MagicMock()
    cred.wahoo_user_id = "999"
    cred.last_sync_at = None
    _override(_make_user(), _make_mock_db(existing_row=cred))
    resp = client.get("/wahoo/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["connected"] is True
    assert body["wahoo_user_id"] == "999"


def test_disconnect_404_when_not_connected(client):
    _override(_make_user(), _make_mock_db(existing_row=None))
    resp = client.delete("/wahoo")
    assert resp.status_code == 404


def test_webhook_not_configured_returns_409(client, monkeypatch):
    monkeypatch.setattr(settings, "WAHOO_CLIENT_ID", "")
    monkeypatch.setattr(settings, "WAHOO_CLIENT_SECRET", "")
    # webhook uses get_db (not get_db_for_user); no auth override needed
    resp = client.post("/wahoo/webhook", json={"workout": {}, "user_id": 1})
    assert resp.status_code == 409
