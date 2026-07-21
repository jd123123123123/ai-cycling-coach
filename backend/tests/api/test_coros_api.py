"""API tests for /coros — auth guard, not-configured 409/honest status, connect
URL, status configured flag, disconnect."""
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
    assert client.get("/coros/connect").status_code == 401


def test_connect_not_configured_returns_409(client, monkeypatch):
    monkeypatch.setattr(settings, "COROS_CLIENT_ID", "")
    monkeypatch.setattr(settings, "COROS_CLIENT_SECRET", "")
    _override(_make_user(), _make_mock_db())
    resp = client.get("/coros/connect")
    assert resp.status_code == 409
    assert "not configured" in resp.json()["detail"].lower()


def test_connect_returns_authorize_url_when_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "COROS_CLIENT_ID", "test-client")
    monkeypatch.setattr(settings, "COROS_CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(settings, "COROS_REDIRECT_URI", "https://app.example.com/coros/callback")
    _override(_make_user(), _make_mock_db())
    resp = client.get("/coros/connect")
    assert resp.status_code == 200
    url = resp.json()["authorize_url"]
    assert url.startswith("https://open.coros.com/oauth2/authorize")
    assert "client_id=test-client" in url
    assert "response_type=code" in url
    assert "state=" in url


def test_status_disconnected_reports_configured_false(client, monkeypatch):
    monkeypatch.setattr(settings, "COROS_CLIENT_ID", "")
    monkeypatch.setattr(settings, "COROS_CLIENT_SECRET", "")
    _override(_make_user(), _make_mock_db(existing_row=None))
    resp = client.get("/coros/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["connected"] is False
    assert body["configured"] is False


def test_status_disconnected_reports_configured_true(client, monkeypatch):
    monkeypatch.setattr(settings, "COROS_CLIENT_ID", "cid")
    monkeypatch.setattr(settings, "COROS_CLIENT_SECRET", "secret")
    _override(_make_user(), _make_mock_db(existing_row=None))
    resp = client.get("/coros/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["connected"] is False
    assert body["configured"] is True


def test_status_connected(client):
    cred = MagicMock()
    cred.coros_user_id = "open-999"
    cred.last_sync_at = None
    _override(_make_user(), _make_mock_db(existing_row=cred))
    resp = client.get("/coros/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["connected"] is True
    assert body["coros_user_id"] == "open-999"


def test_disconnect_404_when_not_connected(client):
    _override(_make_user(), _make_mock_db(existing_row=None))
    resp = client.delete("/coros")
    assert resp.status_code == 404


def test_sync_not_configured_returns_409(client, monkeypatch):
    monkeypatch.setattr(settings, "COROS_CLIENT_ID", "")
    monkeypatch.setattr(settings, "COROS_CLIENT_SECRET", "")
    _override(_make_user(), _make_mock_db())
    resp = client.post("/coros/sync")
    assert resp.status_code == 409


def test_status_isolated_per_user(client):
    """RLS: a user with no credential row sees connected=False (rows are
    user_id-scoped exactly like Wahoo)."""
    _override(_make_user(user_id=42), _make_mock_db(existing_row=None))
    resp = client.get("/coros/status")
    assert resp.status_code == 200
    assert resp.json()["connected"] is False
