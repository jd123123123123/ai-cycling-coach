"""GET /analytics/activity-debrief/{id} for a ride with no power meter.

Verified live before this change: three real rides belonging to a crew member
who rides without a meter answered 404 here, while their route, altitude and
heart rate sat recorded in `activity_streams`. The endpoint keeps a 404 for a
ride that genuinely has nothing to report — but a missing power channel is no
longer that.

Same mocked-`db.execute` harness as tests/api/test_activity_debrief_endpoint.py
(no real-Postgres fixture exists in this repo): SimpleNamespace stand-ins for
the rows, everything from `get_or_build_debrief` down running for real.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user

N = 1800


def _no_power_streams(n=N):
    return {
        # Present and EMPTY — the shape the sync now writes for a bike with no
        # meter, in place of the zero-filled array that would read as real data.
        "power": [],
        "heart_rate": [130.0 + (i / n) * 20 for i in range(n)],
        "cadence": [],
        "altitude": [100.0 + (0.3 * i if i < n // 2 else 0.3 * (n - i)) for i in range(n)],
        "distance": [5.0 * i for i in range(n)],
        "speed": [5.0] * n,
        "latitude": [47.10 + 0.0001 * i for i in range(n)],
        "longitude": [11.20 + 0.0001 * i for i in range(n)],
    }


def _activity(activity_id=4711):
    return SimpleNamespace(
        id=activity_id, title="Feierabendrunde", sport="cycling",
        started_at=datetime(2026, 8, 20, 15, 45, tzinfo=timezone.utc),
        distance_meters=9000.0, duration_seconds=N, tss=96.0,
        elevation_gain_m=270.0, calories=1240,
    )


def _stream(streams):
    return SimpleNamespace(
        streams=streams, mmp_curve=None, total_kj=None, decoupling_pct=None,
        cp_watts=None, w_prime_j=None, eftp_watts=None, durability_drop_pct=None,
    )


class _ScalarsResult:
    def __init__(self, rows):
        self._rows = rows

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeResult:
    def __init__(self, *, scalar=None, rows=None):
        self._scalar = scalar
        self._rows = rows or []

    def scalars(self):
        return _ScalarsResult(self._rows)

    def scalar_one_or_none(self):
        return self._scalar

    def all(self):
        return self._rows


def _db_with(activity, stream):
    db = AsyncMock()

    async def _execute(stmt, *a, **k):
        sql = str(stmt)
        if "FROM race_debriefs" in sql:
            return _FakeResult(scalar=None)  # cache miss
        if "INSERT INTO race_debriefs" in sql:
            return MagicMock()
        if "FROM activities" in sql:
            return _FakeResult(rows=[activity] if activity is not None else [])
        if "FROM athlete_profiles" in sql:
            return _FakeResult(scalar=None)
        if "activity_streams.mmp_curve" in sql:
            return _FakeResult(rows=[])
        return _FakeResult()

    db.execute = _execute

    async def _get(model, pk):
        return stream

    db.get = _get
    db.commit = AsyncMock()
    return db


def _override(db):
    async def _u():
        u = MagicMock(); u.id = 1; u.is_active = True
        return u

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


def test_a_ride_without_power_answers_200_with_what_it_did_record(client, monkeypatch):
    # No LLM in the loop for this ride by design — see build_debrief — but the
    # key is nulled anyway so the assertion does not depend on the environment.
    monkeypatch.setattr("app.services.race_debrief.settings.ANTHROPIC_API_KEY", None)
    _override(_db_with(_activity(), _stream(_no_power_streams())))

    resp = client.get("/analytics/activity-debrief/4711")

    assert resp.status_code == 200
    body = resp.json()
    assert body["header"]["distance_km"] == 9.0
    assert body["header"]["elevation_m"] == 270.0
    assert body["header"]["calories"] == 1240
    assert body["climbs"], "the climbs come out of the altitude stream"
    assert body["story"]["route"], "the map comes out of the GPS stream"
    assert body["efficiency"]["avg_hr"] is not None


def test_it_nulls_the_watts_rather_than_zeroing_them(client, monkeypatch):
    monkeypatch.setattr("app.services.race_debrief.settings.ANTHROPIC_API_KEY", None)
    _override(_db_with(_activity(), _stream(_no_power_streams())))

    body = client.get("/analytics/activity-debrief/4711").json()

    header = body["header"]
    assert header["np_watts"] is None
    assert header["total_kj"] is None
    assert header["if_"] is None
    assert body["verdict"]["grade_letter"] is None
    assert body["verdict"]["grade_score"] is None
    for block in ("pacing", "matchbook", "quadrant", "fueling", "wko", "cda"):
        assert body[block] is None, f"{block} is a power measurement"
    assert body["efforts"] == []


def test_the_verdict_is_not_written_by_a_model_for_a_ride_it_cannot_see(client, monkeypatch):
    """With no power there is no grade, NP, IF, split or surge count to prompt
    with — a candid two-sentence judgement over that blank scorecard would be
    invented, so the factual line stands."""
    monkeypatch.setattr("app.services.race_debrief.settings.ANTHROPIC_API_KEY", "sk-present")

    async def _boom(*a, **k):
        raise AssertionError("no LLM call for a ride with no power")

    monkeypatch.setattr("app.services.race_debrief._ai_verdict", _boom)
    _override(_db_with(_activity(), _stream(_no_power_streams())))

    body = client.get("/analytics/activity-debrief/4711").json()

    assert body["verdict"]["ai_model"] == "rule-based-fallback"
    assert "power meter" in body["verdict"]["ai_verdict"]


def test_a_stream_with_no_power_no_heart_rate_and_no_gps_is_still_a_404(client):
    """The genuinely empty case. The message no longer blames the power meter —
    it used to read "No analyzable ride (with power streams) found", which is
    what a rider without one got on every ride they owned."""
    streams = {"power": [], "heart_rate": [], "cadence": [80.0] * 600,
               "altitude": [], "distance": [], "speed": []}
    _override(_db_with(_activity(), _stream(streams)))

    resp = client.get("/analytics/activity-debrief/4711")

    assert resp.status_code == 404
    assert "power" not in resp.json()["detail"]


def test_an_activity_with_no_stream_row_at_all_is_a_404(client):
    _override(_db_with(_activity(), None))

    resp = client.get("/analytics/activity-debrief/4711")

    assert resp.status_code == 404
