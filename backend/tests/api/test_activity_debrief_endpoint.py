"""GET /analytics/activity-debrief/{activity_id} — exercises the real
`build_debrief` DB-load + analyzer-assembly path (cache-miss), not just the
pure `assemble_debrief` unit (see tests/services/test_race_debrief.py).

Mirrors the mocked-`db.execute`-dependency-override harness used by
tests/api/test_period_report_cache_api.py and tests/api/test_workouts.py:
there is no real-Postgres test fixture in this repo (RLS + TimescaleDB
hypertable semantics require real Postgres — see app/dependencies.py), so
seeded `Activity`/`ActivityStream` rows are SimpleNamespace stand-ins
(same shape used by tests/services/test_race_debrief.py) returned by a
query-dispatching fake `db.execute`, while `get_or_build_debrief` →
`build_debrief` → `assemble_debrief` → `_ai_verdict` all run for real.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user
from app.services.race_debrief import assemble_debrief


def _synthetic_power(n=1200):
    # Steady base with periodic surges — enough signal for pacing/matchbook/wko.
    return [400.0 if (i % 200) < 30 else 180.0 for i in range(n)]


def _activity(activity_id=1):
    return SimpleNamespace(
        id=activity_id, title="Sunday Race", sport="cycling",
        started_at=datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc),
        distance_meters=18000.0, duration_seconds=1200, tss=90.0,
    )


def _stream(power):
    return SimpleNamespace(
        streams={"power": power, "heart_rate": [], "cadence": [], "altitude": [],
                  "distance": [], "speed": []},
        mmp_curve={5: 400.0, 60: 380.0, 300: 300.0, 600: 280.0, 1200: 260.0},
        total_kj=None, decoupling_pct=None,
        cp_watts=250.0, w_prime_j=20000.0, eftp_watts=256.0,
        durability_drop_pct=None,
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
            rows = [(stream.mmp_curve,)] if stream is not None else []
            return _FakeResult(rows=rows)
        return _FakeResult()

    db.execute = _execute

    async def _get(model, pk):
        return stream

    db.get = _get
    db.commit = AsyncMock()
    return db


def _user():
    u = MagicMock(); u.id = 1; u.is_active = True
    return u


def _override(db):
    async def _u():
        return _user()

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


def test_activity_debrief_200_builds_from_db_cache_miss(client, monkeypatch):
    # Force the rule-based fallback path regardless of whether this environment
    # happens to have a real ANTHROPIC_API_KEY configured (dev .env may set one).
    monkeypatch.setattr("app.services.race_debrief.settings.ANTHROPIC_API_KEY", None)
    activity = _activity(activity_id=1)
    stream = _stream(_synthetic_power())
    _override(_db_with(activity, stream))

    resp = client.get("/analytics/activity-debrief/1")

    assert resp.status_code == 200
    body = resp.json()
    assert body["verdict"]["grade_letter"] in {"A", "B", "C", "D", "F"}
    assert body["header"]["title"] == "Sunday Race"
    assert body["header"]["distance_km"] == 18.0
    assert body["verdict"]["ai_model"] == "rule-based-fallback"
    assert body["matchbook"] is not None
    assert body["wko"] is not None


def _db_with_cache_hit(cached_report_payload, generated_at):
    """A cache-HIT variant: the race_debriefs lookup returns a row, and the
    activities/streams lookups blow up if touched — proving the endpoint
    short-circuits on the cached row instead of rebuilding via build_debrief.
    """
    db = AsyncMock()
    cached_row = SimpleNamespace(report=cached_report_payload, generated_at=generated_at)

    async def _execute(stmt, *a, **k):
        sql = str(stmt)
        if "FROM race_debriefs" in sql:
            return _FakeResult(scalar=cached_row)  # cache hit
        if "mmp_curve" in sql:
            # _refresh_pr_flags legitimately re-reads the MMP envelope on the
            # cache-hit path (stale PRs are demoted on read); empty envelope
            # means the cached flags are served unchanged.
            return _FakeResult(rows=[])
        raise AssertionError(f"unexpected query on cache-hit path: {sql}")

    db.execute = _execute

    async def _get(model, pk):
        raise AssertionError("build_debrief should not run on a cache hit")

    db.get = _get
    db.commit = AsyncMock()
    return db


def test_activity_debrief_200_from_cache_hit_skips_rebuild(client, monkeypatch):
    # Build a real RaceDebrief via the pure assembler (no DB/AI involved), the
    # same way _upsert_debrief's payload is produced, then hand it back as the
    # cached row's `.report` to exercise the model_validate re-hydration path.
    monkeypatch.setattr("app.services.race_debrief.settings.ANTHROPIC_API_KEY", None)
    activity = _activity(activity_id=2)
    stream = _stream(_synthetic_power())
    cached = assemble_debrief(activity, stream, None, {})
    cached.verdict.ai_verdict = "Cached verdict from a prior build."
    cached.verdict.ai_model = "rule-based-fallback"
    payload = cached.model_dump(mode="json")
    generated_at = datetime.now(timezone.utc)

    _override(_db_with_cache_hit(payload, generated_at))

    resp = client.get("/analytics/activity-debrief/2")

    assert resp.status_code == 200
    body = resp.json()
    assert body["verdict"]["grade_letter"] == payload["verdict"]["grade_letter"]
    assert body["verdict"]["ai_verdict"] == "Cached verdict from a prior build."


def test_activity_debrief_404_for_missing_activity(client):
    _override(_db_with(None, None))

    resp = client.get("/analytics/activity-debrief/999999")

    assert resp.status_code == 404
