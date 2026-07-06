"""Tests for the Open-Meteo weather client (mocked HTTP, no network)."""
from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest

from app.services.weather_client import fetch_ride_weather

_START = datetime(2026, 6, 21, 10, 0, tzinfo=timezone.utc)
_END = datetime(2026, 6, 21, 13, 0, tzinfo=timezone.utc)

_OK_BODY = {
    "hourly": {
        "time": ["2026-06-21T10:00", "2026-06-21T11:00"],
        "wind_speed_10m": [3.2, 4.1],
        "wind_direction_10m": [220, 240],
        "temperature_2m": [19.0, 21.0],
    }
}


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_returns_hourly_weather_on_success():
    async with _client(lambda req: httpx.Response(200, json=_OK_BODY)) as c:
        out = await fetch_ride_weather(47.0, 8.0, _START, _END, client=c)
    assert out["hourly"]["wind_speed_10m"] == [3.2, 4.1]
    assert out["hourly"]["temperature_2m"] == [19.0, 21.0]


@pytest.mark.asyncio
async def test_returns_none_on_http_error():
    async with _client(lambda req: httpx.Response(500)) as c:
        out = await fetch_ride_weather(47.0, 8.0, _START, _END, client=c)
    assert out is None


@pytest.mark.asyncio
async def test_returns_none_on_transport_exception():
    def boom(req):
        raise httpx.ConnectError("no network")
    async with _client(boom) as c:
        out = await fetch_ride_weather(47.0, 8.0, _START, _END, client=c)
    assert out is None
