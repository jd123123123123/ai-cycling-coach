"""Integration tests for PATCH /users/me (mocked db, dependency_overrides)."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db

# A tiny valid 1x1 PNG as a base64 data URI (well under the 300 KB cap).
SMALL_AVATAR = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def _make_user() -> MagicMock:
    user = MagicMock()
    user.id = 1
    user.email = "athlete@example.com"
    user.display_name = None
    user.avatar_url = None
    user.is_active = True
    user.created_at = datetime.now(timezone.utc)
    return user


def _make_mock_db() -> AsyncMock:
    db = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


def _override(user, db) -> None:
    async def _u():
        return user

    async def _d():
        yield db

    app.dependency_overrides[get_current_active_user] = _u
    app.dependency_overrides[get_db] = _d


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.clear()


def test_patch_requires_auth(client):
    # No override → real auth dependency rejects the unauthenticated request.
    assert client.patch("/users/me", json={"display_name": "Nope"}).status_code == 401


def test_patch_updates_name_and_avatar(client):
    user = _make_user()
    db = _make_mock_db()
    _override(user, db)

    resp = client.patch(
        "/users/me",
        json={"display_name": "Jannis D", "avatar_url": SMALL_AVATAR},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["display_name"] == "Jannis D"
    assert body["avatar_url"] == SMALL_AVATAR
    # Endpoint mutated the current_user and committed.
    assert user.display_name == "Jannis D"
    assert user.avatar_url == SMALL_AVATAR
    db.commit.assert_awaited_once()


def test_patch_rejects_non_data_uri_avatar(client):
    _override(_make_user(), _make_mock_db())
    resp = client.patch(
        "/users/me",
        json={"avatar_url": "https://evil.example.com/pic.png"},
    )
    assert resp.status_code == 422


def test_patch_rejects_oversize_avatar(client):
    _override(_make_user(), _make_mock_db())
    huge = "data:image/png;base64," + ("A" * (300 * 1024 + 10))
    resp = client.patch("/users/me", json={"avatar_url": huge})
    assert resp.status_code == 422


def test_patch_rejects_too_long_display_name(client):
    _override(_make_user(), _make_mock_db())
    resp = client.patch("/users/me", json={"display_name": "x" * 81})
    assert resp.status_code == 422
