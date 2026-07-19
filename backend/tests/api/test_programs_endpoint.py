"""Per-sport program endpoints — GET /weeks/programs + POST /weeks/program.

Pattern mirrors tests/api/test_weeks.py: dependency_overrides for auth + db,
module-level patches for services that would hit real Postgres. flag_modified
is patched because the profile here is a plain stub, not an instrumented ORM
instance.
"""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user


class _Profile:
    """Plain stub — attribute writes must behave like a real object."""

    def __init__(self, goals: dict | None):
        self.user_id = 1
        self.goals = goals


def _make_user(user_id: int = 1) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


def _make_db(profile: _Profile | None):
    db = AsyncMock()
    db.add = MagicMock()  # sync in SQLAlchemy — avoid un-awaited coroutine noise

    async def _execute(query, *args, **kwargs):  # noqa: ANN001
        result = MagicMock()
        result.scalar_one_or_none.return_value = profile
        result.scalars.return_value.all.return_value = []
        return result

    db.execute = AsyncMock(side_effect=_execute)
    return db


@pytest.fixture()
def client_factory():
    def _make(profile: _Profile | None):
        user = _make_user()
        db = _make_db(profile)
        app.dependency_overrides[get_current_active_user] = lambda: user
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db_for_user] = lambda: db
        return TestClient(app), db

    yield _make
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /weeks/programs
# ---------------------------------------------------------------------------

def test_list_programs_requires_auth():
    app.dependency_overrides.clear()
    client = TestClient(app)
    assert client.get("/weeks/programs").status_code == 401


def test_list_programs_returns_both_sports(client_factory):
    # Legacy flat storage → bike program, run defaults to race.
    prof = _Profile({"program": {"id": "ftp_builder", "started": "2026-07-01"}})
    client, _db = client_factory(prof)
    res = client.get("/weeks/programs")
    assert res.status_code == 200
    body = res.json()
    assert body["bike"]["current"] == "ftp_builder"
    assert body["bike"]["started"] == "2026-07-01"
    assert body["run"]["current"] == "race"
    assert body["run"]["started"] is None
    # Metas for both sports; run metas are bilingual.
    assert set(body["programs"]["bike"]) == {"ftp_builder", "vo2_builder", "endurance_200k"}
    assert set(body["programs"]["run"]) == {"run_5k_speed", "run_10k_builder", "run_endurance_hm"}
    for meta in body["programs"]["run"].values():
        assert meta["name_en"] and meta["name_de"] and meta["tagline_en"] and meta["tagline_de"]
    # Legacy flat keys still expose the bike program.
    assert body["current"] == "ftp_builder"


def test_list_programs_no_profile_defaults_to_race(client_factory):
    client, _db = client_factory(None)
    body = client.get("/weeks/programs").json()
    assert body["bike"]["current"] == "race"
    assert body["run"]["current"] == "race"


# ---------------------------------------------------------------------------
# POST /weeks/program — run path
# ---------------------------------------------------------------------------

@patch("sqlalchemy.orm.attributes.flag_modified")
def test_select_run_program_writes_14_days(mock_flag, client_factory):
    prof = _Profile({})
    client, db = client_factory(prof)
    res = client.post("/weeks/program", json={"sport": "run", "program": "run_5k_speed"})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["run"]["current"] == "run_5k_speed"
    assert body["bike"]["current"] == "race"

    rows = [c.args[0] for c in db.add.call_args_list]
    # Any 14-day window holds exactly two Tuesdays, Thursdays and Saturdays.
    assert len(rows) == 6
    today = date.today()
    for row in rows:
        assert row.sport == "running"
        assert row.title
        assert row.template_id.startswith("run_")
        assert today < row.date <= today + timedelta(days=14)
        assert row.date.weekday() in (1, 3, 5)  # Tue/Thu/Sat
        intervals = row.interval_structure["intervals"]
        assert intervals
        for iv in intervals:
            for key in ("duration_s", "zone", "rpe", "description"):
                assert key in iv
        assert row.duration_seconds_target == sum(iv["duration_s"] for iv in intervals)
    # Selection is stored per-sport.
    assert prof.goals["program"]["run"]["id"] == "run_5k_speed"
    assert prof.goals["program"]["bike"] is None
    db.commit.assert_awaited()


@patch("sqlalchemy.orm.attributes.flag_modified")
def test_clear_run_program_writes_nothing(mock_flag, client_factory):
    prof = _Profile({"program": {
        "bike": {"id": "vo2_builder", "started": "2026-07-01"},
        "run": {"id": "run_5k_speed", "started": "2026-07-01"},
    }})
    client, db = client_factory(prof)
    res = client.post("/weeks/program", json={"sport": "run", "program": "none"})
    assert res.status_code == 200
    body = res.json()
    assert body["run"]["current"] == "race"
    assert body["bike"]["current"] == "vo2_builder"  # untouched
    db.add.assert_not_called()


def test_sport_program_mismatch_is_422(client_factory):
    prof = _Profile({})
    client, _db = client_factory(prof)
    # A run id under bike (and vice versa) is rejected before any writes.
    assert client.post(
        "/weeks/program", json={"sport": "bike", "program": "run_5k_speed"}
    ).status_code == 422
    assert client.post(
        "/weeks/program", json={"sport": "run", "program": "ftp_builder"}
    ).status_code == 422


# ---------------------------------------------------------------------------
# POST /weeks/program — bike path (regeneration preserved)
# ---------------------------------------------------------------------------

@patch("sqlalchemy.orm.attributes.flag_modified")
@patch("app.services.pmc_service.compute_user_pmc", new_callable=AsyncMock)
@patch("app.services.mesocycle_generator.generate_mesocycle", new_callable=AsyncMock)
def test_select_bike_program_regenerates(mock_gen, mock_pmc, mock_flag, client_factory):
    mock_pmc.return_value = {"total": []}
    prof = _Profile({"program": {"run": {"id": "run_10k_builder", "started": "2026-07-01"}}})
    client, db = client_factory(prof)
    res = client.post("/weeks/program", json={"sport": "bike", "program": "vo2_builder"})
    assert res.status_code == 200
    body = res.json()
    assert body["bike"]["current"] == "vo2_builder"
    assert body["run"]["current"] == "run_10k_builder"  # run selection survives
    mock_gen.assert_awaited_once()
    # Legacy payload without sport still lands on bike.
    res2 = client.post("/weeks/program", json={"program": "ftp_builder"})
    assert res2.status_code == 200
    assert res2.json()["bike"]["current"] == "ftp_builder"


@patch("sqlalchemy.orm.attributes.flag_modified")
def test_select_program_no_profile_409(mock_flag, client_factory):
    client, _db = client_factory(None)
    res = client.post("/weeks/program", json={"sport": "run", "program": "run_5k_speed"})
    assert res.status_code == 409
