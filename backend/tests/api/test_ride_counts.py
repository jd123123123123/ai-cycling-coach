"""GET /analytics/ride-counts — one honest denominator (audit P0-5).

Pattern mirrors the other tests/api modules: dependency_overrides for auth + db.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user


def _make_user(user_id: int = 1) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


@pytest.fixture()
def client_factory():
    def _make(row) -> TestClient:
        user = _make_user()
        result = MagicMock()
        result.one.return_value = row
        db = MagicMock()
        db.execute = AsyncMock(return_value=result)
        app.dependency_overrides[get_current_active_user] = lambda: user
        app.dependency_overrides[get_db_for_user] = lambda: db
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


def test_ride_counts_requires_auth():
    app.dependency_overrides.clear()
    client = TestClient(app)
    assert client.get("/analytics/ride-counts").status_code == 401


def test_ride_counts_returns_all_three_counters(client_factory):
    row = MagicMock()
    row.total_rides = 42
    row.rides_with_power = 17
    row.rides_with_gps = 12
    client = client_factory(row)
    res = client.get("/analytics/ride-counts")
    assert res.status_code == 200
    assert res.json() == {
        "total_rides": 42,
        "rides_with_power": 17,
        "rides_with_gps": 12,
    }


def test_ride_counts_null_safe(client_factory):
    row = MagicMock()
    row.total_rides = 0
    row.rides_with_power = None
    row.rides_with_gps = None
    client = client_factory(row)
    res = client.get("/analytics/ride-counts")
    assert res.status_code == 200
    assert res.json() == {
        "total_rides": 0,
        "rides_with_power": 0,
        "rides_with_gps": 0,
    }
