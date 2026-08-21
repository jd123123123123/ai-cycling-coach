"""Integration smoke tests for GET /workshop/nearby.

Same strategy as test_morning_health_endpoint: dependency_overrides swap out
auth + the RLS db dep, and the Overpass call is monkeypatched — so the real
endpoint path (position resolution → normalisation → shop/station split) runs
without Postgres and without touching a donated public API.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_current_active_user, get_current_user, get_db_for_user
from app.main import app
from app.services import bike_shops

ELEMENTS = [
    {
        "type": "node",
        "id": 1,
        "lat": 52.5219,
        "lon": 13.4132,
        "tags": {"shop": "bicycle", "name": "Radhaus Mitte", "opening_hours": "24/7"},
    },
    {
        "type": "node",
        "id": 3,
        "lat": 52.5230,
        "lon": 13.4100,
        "tags": {"amenity": "bicycle_repair_station", "name": "Reparatursäule Alex"},
    },
]

RIDE_STREAMS = {"latitude": [52.5200, 52.5201], "longitude": [13.4050, 13.4051]}


def _install(*, profile=None, stream_rows=()):
    user = MagicMock()
    user.id = 1
    user.is_active = True

    db = AsyncMock()
    calls = {"n": 0}

    async def _execute(query, *a, **k):  # noqa: ANN001
        result = MagicMock()
        calls["n"] += 1
        # First query is the athlete profile, second (if reached) the streams.
        if calls["n"] == 1:
            result.scalar_one_or_none.return_value = profile
        else:
            result.scalars.return_value.all.return_value = list(stream_rows)
        return result

    db.execute = _execute
    db.close = AsyncMock()

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
def _no_network(monkeypatch):
    async def fake_fetch(query, client=None):
        return ELEMENTS

    monkeypatch.setattr(bike_shops, "_fetch", fake_fetch)
    bike_shops._cache.clear()
    bike_shops._locks.clear()
    yield
    bike_shops._cache.clear()
    bike_shops._locks.clear()
    app.dependency_overrides.clear()


class TestUnauthenticated:
    def test_401(self, client):
        assert client.get("/workshop/nearby").status_code == 401


class TestWithDeviceCoordinates:
    def test_splits_shops_and_stations(self, client):
        _install(profile=SimpleNamespace(timezone="Europe/Berlin"))
        body = client.get("/workshop/nearby?lat=52.52&lng=13.405&radius_m=5000").json()
        assert body["available"] is True
        assert body["origin"] == {"lat": 52.52, "lng": 13.405, "source": "device"}
        assert [s["name"] for s in body["shops"]] == ["Radhaus Mitte"]
        assert [s["name"] for s in body["stations"]] == ["Reparatursäule Alex"]
        assert body["shops"][0]["distance_m"] > 0
        assert "OpenStreetMap" in body["attribution"]

    def test_rejects_impossible_coordinates(self, client):
        _install(profile=SimpleNamespace(timezone="Europe/Berlin"))
        assert client.get("/workshop/nearby?lat=99&lng=13.4").status_code == 422

    def test_rejects_absurd_radius(self, client):
        _install(profile=SimpleNamespace(timezone="Europe/Berlin"))
        assert client.get("/workshop/nearby?lat=52.5&lng=13.4&radius_m=500000").status_code == 422


class TestFallbackToLastRide:
    def test_uses_last_ride_gps_when_no_coordinates_given(self, client):
        _install(profile=SimpleNamespace(timezone="Europe/Berlin"), stream_rows=[RIDE_STREAMS])
        body = client.get("/workshop/nearby").json()
        assert body["available"] is True
        assert body["origin"]["source"] == "last_ride"
        assert body["origin"]["lat"] == pytest.approx(52.52, abs=1e-4)

    def test_no_gps_history_is_honest_absence(self, client):
        _install(profile=SimpleNamespace(timezone="Europe/Berlin"), stream_rows=[])
        body = client.get("/workshop/nearby").json()
        assert body["available"] is False
        assert body["reason"] == "no_location"
        assert body["shops"] == [] and body["stations"] == []


class TestUpstreamOutage:
    def test_overpass_down_reports_none_found_not_500(self, client, monkeypatch):
        async def dead(query, client=None):
            return None

        monkeypatch.setattr(bike_shops, "_fetch", dead)
        _install(profile=SimpleNamespace(timezone="Europe/Berlin"))
        resp = client.get("/workshop/nearby?lat=52.52&lng=13.405")
        assert resp.status_code == 200
        body = resp.json()
        assert body["available"] is False and body["reason"] == "none_found"
