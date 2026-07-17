"""Unit tests for the Wahoo integration: workout→ActivityCreate mapping and
OAuth token refresh — all with a mocked httpx transport (no real network)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import httpx
import pytest

from app.models.wahoo_credential import WahooCredential
from app.services import wahoo_client, wahoo_service


# ── workout → ActivityCreate mapping ─────────────────────────────────────────
def _workout(**over):
    base = {
        "id": 12345,
        "name": "Morning Ride",
        "workout_type_id": 0,  # BIKING
        "starts": "2026-07-10T06:30:00Z",
        "workout_summary": {
            "duration_accum": "3600",
            "distance_accum": "30000",
            "power_avg": "210.5",
            "heart_rate_avg": "150.2",
            "calories_accum": "720",
            "ascent_accum": "350",
        },
    }
    base.update(over)
    return base


def test_map_workout_cycling_fields():
    act = wahoo_service.map_workout(_workout())
    assert act is not None
    assert act.sport == "cycling"
    assert act.duration_seconds == 3600
    assert act.distance_meters == 30000.0
    assert act.average_power == 210.5
    assert act.average_hr == 150  # rounded
    assert act.calories == 720
    assert act.source == "wahoo"
    assert act.external_id == "wahoo-12345"
    assert act.title == "Morning Ride"
    assert act.started_at.year == 2026 and act.started_at.month == 7


@pytest.mark.parametrize(
    "type_id,expected",
    [
        (0, "cycling"),
        (15, "cycling"),   # BIKING_ROAD
        (12, "cycling"),   # BIKING_INDOOR
        (1, "running"),
        (5, "running"),    # RUNNING_TREADMILL
        (9, "running"),    # HIKING
        (2, "gym"),        # FE
        (22, "gym"),       # FE_ROWER
        (61, "gym"),       # STRENGTH
        (99999, "cycling"),  # unknown → default cycling
    ],
)
def test_sport_mapping(type_id, expected):
    act = wahoo_service.map_workout(_workout(workout_type_id=type_id))
    assert act is not None
    assert act.sport == expected


def test_map_workout_skips_without_id_or_duration():
    assert wahoo_service.map_workout({"name": "x"}) is None
    assert wahoo_service.map_workout(_workout(workout_summary={"duration_accum": 0})) is None
    assert wahoo_service.map_workout(_workout(starts=None)) is None


def test_map_workout_missing_optional_metrics():
    act = wahoo_service.map_workout(
        _workout(workout_summary={"duration_accum": "1800"})
    )
    assert act is not None
    assert act.duration_seconds == 1800
    assert act.distance_meters is None
    assert act.average_power is None
    assert act.average_hr is None
    assert act.calories is None


# ── OAuth token exchange / refresh via mocked httpx transport ────────────────
def _mock_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_refresh_access_token_calls_token_endpoint(monkeypatch):
    monkeypatch.setattr("app.config.settings.WAHOO_CLIENT_ID", "cid")
    monkeypatch.setattr("app.config.settings.WAHOO_CLIENT_SECRET", "secret")

    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = request.content.decode()
        return httpx.Response(
            200,
            json={
                "access_token": "new-access",
                "refresh_token": "new-refresh",
                "expires_in": 7200,
            },
        )

    async with _mock_client(handler) as client:
        tokens = await wahoo_client.refresh_access_token("old-refresh", client=client)

    assert tokens["access_token"] == "new-access"
    assert wahoo_client.TOKEN_URL in seen["url"]
    assert "grant_type=refresh_token" in seen["body"]
    assert "old-refresh" in seen["body"]


@pytest.mark.asyncio
async def test_token_endpoint_error_raises_auth_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, text="invalid_grant")

    async with _mock_client(handler) as client:
        with pytest.raises(wahoo_client.WahooAuthError):
            await wahoo_client.refresh_access_token("dead", client=client)


@pytest.mark.asyncio
async def test_ensure_fresh_token_refreshes_when_expired(monkeypatch):
    monkeypatch.setattr("app.config.settings.WAHOO_CLIENT_ID", "cid")
    monkeypatch.setattr("app.config.settings.WAHOO_CLIENT_SECRET", "secret")

    cred = WahooCredential(
        user_id=1,
        access_token="stale",
        refresh_token="rt",
        token_expires_at=datetime.now(timezone.utc) - timedelta(hours=1),  # expired
    )
    db = AsyncMock()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"access_token": "fresh", "refresh_token": "rt2", "expires_in": 3600},
        )

    async with _mock_client(handler) as client:
        token = await wahoo_service.ensure_fresh_token(db, cred, client=client)

    assert token == "fresh"
    assert cred.access_token == "fresh"
    assert cred.refresh_token == "rt2"
    assert cred.token_expires_at > datetime.now(timezone.utc)
    db.flush.assert_awaited()


@pytest.mark.asyncio
async def test_ensure_fresh_token_skips_when_valid():
    cred = WahooCredential(
        user_id=1,
        access_token="good",
        refresh_token="rt",
        token_expires_at=datetime.now(timezone.utc) + timedelta(hours=2),  # valid
    )
    db = AsyncMock()

    def handler(request: httpx.Request) -> httpx.Response:  # should never be called
        raise AssertionError("token endpoint must not be hit when token is valid")

    async with _mock_client(handler) as client:
        token = await wahoo_service.ensure_fresh_token(db, cred, client=client)

    assert token == "good"
    db.flush.assert_not_awaited()


def test_apply_tokens_keeps_old_refresh_when_absent():
    cred = WahooCredential(user_id=1, access_token="a", refresh_token="keep-me")
    wahoo_service.apply_tokens(cred, {"access_token": "b", "expires_in": 100})
    assert cred.access_token == "b"
    assert cred.refresh_token == "keep-me"  # unchanged when payload omits it
    assert cred.token_expires_at is not None
