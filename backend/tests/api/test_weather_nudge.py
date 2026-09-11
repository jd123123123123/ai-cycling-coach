from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest

from app.api import weather
from app.services import weather_client


async def test_today_requests_gusts_daylight_and_kmh():
    weather_client._forecast_cache.clear()
    seen = {}

    def reply(request):
        seen.update(dict(request.url.params))
        return httpx.Response(200, json={"hourly": {"time": ["2026-09-11T12:00"]}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(reply)) as client:
        await weather_client.fetch_today_forecast(52.5, 13.4, "Europe/Berlin", client=client)
    weather_client._forecast_cache.clear()
    assert {"wind_gusts_10m", "is_day"} <= set(seen["hourly"].split(","))
    assert seen["wind_speed_unit"] == "kmh"


@pytest.mark.parametrize("gusts,daylight,expected_gust,expected_day", [([21], [1], 21, True), ([], [], None, None), ([0], [0], 0, False)])
async def test_today_preserves_gusts_and_missing_readings(monkeypatch, gusts, daylight, expected_gust, expected_day):
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)))
    monkeypatch.setattr(weather, "set_athlete_tz_from_profile", Mock())
    monkeypatch.setattr(weather, "athlete_tz", lambda: "Europe/Berlin")
    monkeypatch.setattr(weather, "_last_ride_location", AsyncMock(return_value=(52.5, 13.4)))
    monkeypatch.setattr(weather, "fetch_today_forecast", AsyncMock(return_value={"hourly": {
        "time": ["2026-09-11T12:00"], "temperature_2m": [20], "wind_gusts_10m": gusts, "is_day": daylight,
    }}))
    result = await weather.get_today_weather(SimpleNamespace(id=1), db)
    assert result["hours"][0]["wind_gust_kmh"] == expected_gust
    assert result["hours"][0]["is_day"] is expected_day
    assert result["hours"][0]["wind_kmh"] is None


async def test_device_forecast_uses_rounded_position_without_reading_ride_history(monkeypatch):
    fetch = AsyncMock(return_value={"hourly": {"time": ["2026-09-11T12:00"], "temperature_2m": [20]}})
    old = AsyncMock(side_effect=AssertionError("Must not use a previous ride"))
    monkeypatch.setattr(weather, "fetch_today_forecast", fetch)
    monkeypatch.setattr(weather, "_last_ride_location", old)
    result = await weather.get_weather_here(weather.WeatherPosition(lat=52.51234, lng=13.41234, timezone="Europe/Berlin"), SimpleNamespace(id=1))
    fetch.assert_awaited_once_with(52.51, 13.41, "Europe/Berlin")
    assert result["location_source"] == "device"
    old.assert_not_awaited()


@pytest.mark.parametrize("values", [{"lat": 91}, {"lng": -181}, {"lat": float("nan")}, {"timezone": "Invalid/Zone"}])
def test_invalid_device_coordinates_are_rejected(values):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        weather.WeatherPosition(**{"lat": 52, "lng": 13, "timezone": "Europe/Berlin", **values})


async def test_device_endpoint_requires_authentication():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(weather.router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/weather/here", json={"lat":52.5,"lng":13.4,"timezone":"Europe/Berlin"})
    assert response.status_code in (401, 403)
