"""Unit tests for the COROS integration: activity→ActivityCreate mapping and
OAuth token exchange/refresh — all with a mocked httpx transport (no real
network / no COROS partner credentials required)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import httpx
import pytest

from app.models.coros_credential import CorosCredential
from app.services import coros_client, coros_service


# ── activity → ActivityCreate mapping ────────────────────────────────────────
def _activity(**over):
    base = {
        "labelId": "act-12345",
        "name": "Morning Ride",
        "sportType": 200,  # Bike
        "startTime": 1752129000,  # epoch seconds → 2025-07-10-ish UTC
        "totalTime": 3600,
        "distance": 30000,
        "avgPower": 210.5,
        "avgHeartRate": 150.2,
        "calorie": 720,
    }
    base.update(over)
    return base


def test_map_activity_cycling_fields():
    act = coros_service.map_activity(_activity())
    assert act is not None
    assert act.sport == "cycling"
    assert act.duration_seconds == 3600
    assert act.distance_meters == 30000.0
    assert act.average_power == 210.5
    assert act.average_hr == 150  # rounded
    assert act.calories == 720
    assert act.source == "coros"
    assert act.external_id == "coros-act-12345"
    assert act.title == "Morning Ride"


@pytest.mark.parametrize(
    "type_id,expected",
    [
        (200, "cycling"),
        (201, "cycling"),   # Indoor Bike
        (100, "running"),
        (102, "running"),   # Trail Run
        (900, "gym"),       # Strength
        (99999, "cycling"),  # unknown → default cycling
    ],
)
def test_sport_mapping(type_id, expected):
    act = coros_service.map_activity(_activity(sportType=type_id))
    assert act is not None
    assert act.sport == expected


def test_map_activity_skips_without_id_or_duration():
    assert coros_service.map_activity({"name": "x"}) is None
    assert coros_service.map_activity(_activity(totalTime=0)) is None
    assert coros_service.map_activity(_activity(startTime=None)) is None


def test_map_activity_missing_optional_metrics():
    act = coros_service.map_activity(
        {"labelId": "y", "sportType": 200, "startTime": 1752129000, "totalTime": 1800}
    )
    assert act is not None
    assert act.duration_seconds == 1800
    assert act.distance_meters is None
    assert act.average_power is None
    assert act.average_hr is None
    assert act.calories is None


def test_map_activity_iso_start_time():
    act = coros_service.map_activity(_activity(startTime="2026-07-10T06:30:00Z"))
    assert act is not None
    assert act.started_at.year == 2026 and act.started_at.month == 7


# ── OAuth token exchange / refresh via mocked httpx transport ────────────────
def _mock_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_build_authorize_url_shape(monkeypatch):
    monkeypatch.setattr("app.config.settings.COROS_CLIENT_ID", "cid")
    url = coros_client.build_authorize_url(
        redirect_uri="https://app.example.com/coros/callback", state="st8"
    )
    assert url.startswith("https://open.coros.com/oauth2/authorize")
    assert "client_id=cid" in url
    assert "response_type=code" in url
    assert "state=st8" in url


@pytest.mark.asyncio
async def test_exchange_code_calls_token_endpoint(monkeypatch):
    monkeypatch.setattr("app.config.settings.COROS_CLIENT_ID", "cid")
    monkeypatch.setattr("app.config.settings.COROS_CLIENT_SECRET", "secret")

    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = request.content.decode()
        return httpx.Response(
            200,
            json={
                "access_token": "acc",
                "refresh_token": "ref",
                "expires_in": 7200,
                "openId": "open-1",
            },
        )

    async with _mock_client(handler) as client:
        tokens = await coros_client.exchange_code(
            "the-code", "https://app.example.com/coros/callback", client=client
        )

    assert tokens["access_token"] == "acc"
    assert tokens["openId"] == "open-1"
    assert coros_client.TOKEN_URL in seen["url"]
    assert "grant_type=authorization_code" in seen["body"]
    assert "the-code" in seen["body"]


@pytest.mark.asyncio
async def test_refresh_access_token_calls_token_endpoint(monkeypatch):
    monkeypatch.setattr("app.config.settings.COROS_CLIENT_ID", "cid")
    monkeypatch.setattr("app.config.settings.COROS_CLIENT_SECRET", "secret")

    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = request.content.decode()
        return httpx.Response(
            200,
            json={"access_token": "new-access", "refresh_token": "new-refresh", "expires_in": 7200},
        )

    async with _mock_client(handler) as client:
        tokens = await coros_client.refresh_access_token("old-refresh", client=client)

    assert tokens["access_token"] == "new-access"
    assert "grant_type=refresh_token" in seen["body"]
    assert "old-refresh" in seen["body"]


@pytest.mark.asyncio
async def test_token_endpoint_wraps_data_envelope():
    """COROS may nest the token under a {result,message,data} envelope."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"result": "0000", "message": "OK", "data": {"access_token": "wrapped"}},
        )

    async with _mock_client(handler) as client:
        tokens = await coros_client.refresh_access_token("r", client=client)
    assert tokens["access_token"] == "wrapped"


@pytest.mark.asyncio
async def test_token_endpoint_error_raises_auth_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, text="invalid_grant")

    async with _mock_client(handler) as client:
        with pytest.raises(coros_client.CorosAuthError):
            await coros_client.refresh_access_token("dead", client=client)


@pytest.mark.asyncio
async def test_fetch_activities_unwraps_list():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"result": "0000", "message": "OK", "data": {"dataList": [_activity()]}},
        )

    async with _mock_client(handler) as client:
        items = await coros_client.fetch_activities(
            "tok", open_id="open-1", start_date="20260601", end_date="20260701", client=client
        )
    assert len(items) == 1
    assert items[0]["labelId"] == "act-12345"


@pytest.mark.asyncio
async def test_ensure_fresh_token_refreshes_when_expired(monkeypatch):
    monkeypatch.setattr("app.config.settings.COROS_CLIENT_ID", "cid")
    monkeypatch.setattr("app.config.settings.COROS_CLIENT_SECRET", "secret")

    cred = CorosCredential(
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
        token = await coros_service.ensure_fresh_token(db, cred, client=client)

    assert token == "fresh"
    assert cred.access_token == "fresh"
    assert cred.refresh_token == "rt2"
    assert cred.token_expires_at > datetime.now(timezone.utc)
    db.flush.assert_awaited()


@pytest.mark.asyncio
async def test_ensure_fresh_token_skips_when_valid():
    cred = CorosCredential(
        user_id=1,
        access_token="good",
        refresh_token="rt",
        token_expires_at=datetime.now(timezone.utc) + timedelta(hours=2),  # valid
    )
    db = AsyncMock()

    def handler(request: httpx.Request) -> httpx.Response:  # should never be called
        raise AssertionError("token endpoint must not be hit when token is valid")

    async with _mock_client(handler) as client:
        token = await coros_service.ensure_fresh_token(db, cred, client=client)

    assert token == "good"
    db.flush.assert_not_awaited()


def test_apply_tokens_keeps_old_refresh_when_absent():
    cred = CorosCredential(user_id=1, access_token="a", refresh_token="keep-me")
    coros_service.apply_tokens(cred, {"access_token": "b", "expires_in": 100, "openId": "o1"})
    assert cred.access_token == "b"
    assert cred.refresh_token == "keep-me"  # unchanged when payload omits it
    assert cred.coros_user_id == "o1"
    assert cred.token_expires_at is not None
