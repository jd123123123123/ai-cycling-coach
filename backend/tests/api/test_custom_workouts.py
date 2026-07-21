"""Custom-workout builder API — CRUD, ownership isolation, schedule-as-protected,
.zwo export.

Uses the repo's mocked-`db.execute` dependency-override harness (no real
Postgres — RLS is enforced by the migration's row-level policy, verified
separately). The endpoint logic (server-side TSS recompute, ownership 404,
protected schedule write) runs for real against a query-dispatching fake db.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user


class _Scalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _Scalars(self._rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


def _user(uid=8):
    u = MagicMock(); u.id = uid; u.is_active = True
    return u


def _override(db, uid=8):
    async def _u():
        return _user(uid)

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


def _row(**kw):
    base = dict(
        id=1, user_id=8, name="Mein VO2", description="desc", sport="cycling",
        blocks=[{"type": "steady", "duration_s": 3600, "power_pct": 0.85}],
        estimated_tss=72.2, estimated_duration_s=3600,
        created_at=datetime(2026, 7, 21, tzinfo=timezone.utc),
        updated_at=datetime(2026, 7, 21, tzinfo=timezone.utc),
    )
    base.update(kw)
    return SimpleNamespace(**base)


_VALID_BODY = {
    "name": "Mein VO2",
    "description": "4×3min",
    "blocks": [
        {"type": "warmup", "duration_s": 600, "from_pct": 0.50, "to_pct": 0.75},
        {"type": "interval", "reps": 4, "on_s": 180, "off_s": 180, "on_pct": 1.10, "off_pct": 0.50},
        {"type": "cooldown", "duration_s": 300, "from_pct": 0.60, "to_pct": 0.40},
    ],
}


def test_create_recomputes_tss_server_side(client):
    captured = {}
    db = AsyncMock()

    async def _execute(stmt, *a, **k):
        return _Result([])

    def _add(obj):
        captured["obj"] = obj

    async def _refresh(obj):
        obj.id = 99
        obj.created_at = datetime(2026, 7, 21, tzinfo=timezone.utc)
        obj.updated_at = datetime(2026, 7, 21, tzinfo=timezone.utc)

    db.execute = _execute
    db.add = _add
    db.commit = AsyncMock()
    db.refresh = _refresh
    _override(db)

    resp = client.post("/custom-workouts", json=_VALID_BODY)
    assert resp.status_code == 201
    body = resp.json()
    # Server computed TSS + duration from the blocks (client sent none).
    assert body["estimated_duration_s"] == 600 + 1440 + 300
    assert body["estimated_tss"] > 0
    # Persisted object carries server-computed caches, not client input.
    assert captured["obj"].estimated_duration_s == 2340


def test_create_rejects_empty_blocks(client):
    db = AsyncMock()
    _override(db)
    resp = client.post("/custom-workouts", json={"name": "x", "blocks": []})
    assert resp.status_code == 422


def test_list_returns_owned_rows(client):
    db = AsyncMock()

    async def _execute(stmt, *a, **k):
        return _Result([_row(), _row(id=2, name="Sweet Spot")])

    db.execute = _execute
    _override(db)
    resp = client.get("/custom-workouts")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_other_users_workout_is_404(client):
    # RLS + app-layer ownership: a row not matching the user filter is absent.
    db = AsyncMock()

    async def _execute(stmt, *a, **k):
        return _Result([])  # filtered out by user_id — nothing returned

    db.execute = _execute
    _override(db, uid=8)
    resp = client.get("/custom-workouts/1")
    assert resp.status_code == 404


def test_delete_owned(client):
    db = AsyncMock()

    async def _execute(stmt, *a, **k):
        return _Result([_row()])

    db.execute = _execute
    db.delete = AsyncMock()
    db.commit = AsyncMock()
    _override(db)
    resp = client.delete("/custom-workouts/1")
    assert resp.status_code == 204
    db.delete.assert_awaited()


def test_schedule_writes_protected_user_plan_row(client):
    captured = {}
    db = AsyncMock()
    calls = {"n": 0}

    async def _execute(stmt, *a, **k):
        calls["n"] += 1
        sql = str(stmt).lower()
        if "athlete_profile" in sql:
            return _Result([SimpleNamespace(ftp_watts=240)])
        if "custom_workouts" in sql:
            return _Result([_row(blocks=[
                {"type": "interval", "reps": 4, "on_s": 180, "off_s": 180, "on_pct": 1.10, "off_pct": 0.50},
            ])])
        # planned_workouts existing-rows lookup
        return _Result([])

    def _add(obj):
        captured["pw"] = obj

    async def _refresh(obj):
        obj.id = 555

    db.execute = _execute
    db.add = _add
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    db.refresh = _refresh
    _override(db)

    resp = client.post("/custom-workouts/1/schedule", json={"date": "2026-07-25"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["blocks_source"] == "user_plan"  # PROTECTED source
    assert body["planned_workout_id"] == 555
    # The PlannedWorkout carries materialised watts and the protected source.
    pw = captured["pw"]
    assert pw.blocks_source == "user_plan"
    intervals = pw.interval_structure["intervals"]
    assert intervals[0]["target_watts_low"] > 0
    assert intervals[0]["reps"] == 4


def test_schedule_without_ftp_is_409(client):
    db = AsyncMock()

    async def _execute(stmt, *a, **k):
        sql = str(stmt).lower()
        if "athlete_profile" in sql:
            return _Result([SimpleNamespace(ftp_watts=None)])
        return _Result([_row()])

    db.execute = _execute
    _override(db)
    resp = client.post("/custom-workouts/1/schedule", json={"date": "2026-07-25"})
    assert resp.status_code == 409


def test_export_zwo_returns_xml(client):
    db = AsyncMock()

    async def _execute(stmt, *a, **k):
        return _Result([_row(blocks=[
            {"type": "warmup", "duration_s": 600, "from_pct": 0.50, "to_pct": 0.75},
            {"type": "steady", "duration_s": 1200, "power_pct": 0.85},
        ])])

    db.execute = _execute
    _override(db)
    resp = client.get("/custom-workouts/1/export.zwo")
    assert resp.status_code == 200
    assert "attachment" in resp.headers["content-disposition"]
    assert ".zwo" in resp.headers["content-disposition"]
    assert "<workout_file>" in resp.text
    assert "<Warmup" in resp.text and "<SteadyState" in resp.text


def test_schedule_protected_source_is_in_engine_protected_set():
    # Cross-check: the source we write is actually protected from adaptation.
    from app.services.plan_adaptation_engine import PROTECTED_SOURCES

    assert "user_plan" in PROTECTED_SOURCES
