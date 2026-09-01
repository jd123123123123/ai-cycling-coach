"""GET /activities/rhythm — the Fahrten dock's SAISON / MONAT / WOCHE payload.

Pattern mirrors the other tests/api modules: dependency_overrides for auth + db.
The arithmetic itself is covered in tests/test_ride_rhythm.py; what is tested
here is that the route exists at the path the screen calls, that it is behind
auth, that it survives the `/{activity_id}` route sitting next to it, and that
the JSON keys are exactly the ones the frontend is being built against.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_current_active_user, get_db_for_user
from app.main import app

GRAINS = ("season", "month", "week")


def _row(when: datetime, km: float | None, minutes: int | None, ascent: float | None):
    return (
        1,
        when,
        None if km is None else km * 1000,
        None if minutes is None else minutes * 60,
        ascent,
        "Fahrt",
    )


@pytest.fixture()
def client_factory():
    def _make(rows) -> TestClient:
        user = MagicMock()
        user.id = 7
        user.is_active = True
        result = MagicMock()
        result.all.return_value = rows
        db = MagicMock()
        db.execute = AsyncMock(return_value=result)
        app.dependency_overrides[get_current_active_user] = lambda: user
        app.dependency_overrides[get_db_for_user] = lambda: db
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


def test_rhythm_requires_auth():
    app.dependency_overrides.clear()
    assert TestClient(app).get("/activities/rhythm").status_code == 401


def test_rhythm_is_not_swallowed_by_the_activity_id_route(client_factory):
    """`/activities/{activity_id}` is declared right after this one; below it
    "rhythm" would be parsed as an id and 422."""
    res = client_factory([]).get("/activities/rhythm")
    assert res.status_code == 200


def test_rhythm_returns_the_three_grains_in_the_agreed_shape(client_factory):
    body = client_factory([]).get("/activities/rhythm").json()
    assert set(body) == set(GRAINS)
    for g in GRAINS:
        grain = body[g]
        assert set(grain) == {"label", "km", "rides", "hours", "elevation_m", "buckets"}
        assert grain["buckets"], "a window with no rides still has its buckets"
        for b in grain["buckets"]:
            assert set(b) == {"start", "km", "rides", "hours", "elevation_m"}
    assert len(body["season"]["buckets"]) == 12
    assert len(body["week"]["buckets"]) == 7


def test_an_empty_account_reads_as_zeroes_not_as_nulls(client_factory):
    body = client_factory([]).get("/activities/rhythm").json()
    for g in GRAINS:
        assert body[g]["km"] == 0.0 and body[g]["rides"] == 0
        assert body[g]["hours"] == 0.0 and body[g]["elevation_m"] == 0


def test_rides_reach_every_grain_they_belong_to(client_factory):
    now = datetime.now(timezone.utc)
    rows = [
        _row(now - timedelta(days=1), 40.0, 120, 500.0),
        _row(now - timedelta(days=20), 60.0, 180, None),
    ]
    body = client_factory(rows).get("/activities/rhythm").json()
    assert body["week"]["rides"] == 1
    assert body["week"]["km"] == 40.0
    assert body["week"]["elevation_m"] == 500
    assert body["month"]["rides"] == 2
    assert body["month"]["km"] == 100.0
    assert body["month"]["hours"] == 5.0
    for g in GRAINS:
        assert body[g]["rides"] == sum(b["rides"] for b in body[g]["buckets"])
