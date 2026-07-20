"""POST /plan/build + GET /plan/change/interview + POST /plan/change/apply.

Pattern mirrors tests/api/test_programs_endpoint.py: dependency_overrides for
auth + db, module-level patches for the services that would hit Postgres.
"""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user


def _profile(**overrides) -> SimpleNamespace:
    base = dict(
        user_id=1,
        ftp_watts=240,
        primary_sport="cycling",
        weekly_hours_available=12.0,
        target_event_date=date(2026, 12, 5),
        target_event_type="fondo",
        target_priority="A",
        timezone="Europe/Berlin",
        days_available={"mon": True, "long_day": "sat"},
        motivation_style=None,
        variety_dial=None,
        experience_level="returning",
        hard_day_blackouts=[],
        goals={},
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _make_user(user_id: int = 1) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


def _make_db(profile):
    db = AsyncMock()
    db.add = MagicMock()

    async def _execute(query, *args, **kwargs):  # noqa: ANN001
        result = MagicMock()
        result.scalar_one_or_none.return_value = profile
        result.scalars.return_value.all.return_value = []
        return result

    db.execute = AsyncMock(side_effect=_execute)
    return db


@pytest.fixture()
def client_factory():
    def _make(profile):
        user = _make_user()
        db = _make_db(profile)
        app.dependency_overrides[get_current_active_user] = lambda: user
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db_for_user] = lambda: db
        return TestClient(app), db

    yield _make
    app.dependency_overrides.clear()


_SUMMARY = {
    "rebuilt": True,
    "plan_start_date": "2026-07-20",
    "week": [
        {"date": "2026-07-20", "sport": "cycling", "title": "Rest",
         "template_id": "rest_day", "blocks_source": "ai_prescribed"},
        {"date": "2026-07-21", "sport": "cycling", "title": "VO2 5x4",
         "template_id": "vo2_5x4", "blocks_source": "ai_prescribed"},
    ],
    "phase": "base1",
    "weekly_tss_targets": [246, 253, 253, 152],
    "preserved_sessions": 0,
    "ctl_anchor": 36.7,
}

_STATE = {
    "weeks_completed": 2,
    "sessions_done": 9,
    "planned_sessions": 12,
    "compliance_pct": 75,
    "ctl_delta_since_start": 3.2,
    "favorite_session": {"template_id": "vo2_5x4", "completed": 3},
}


# ──────────────────────────────────────────────────────────────────────────
#  POST /plan/build
# ──────────────────────────────────────────────────────────────────────────

def test_build_requires_auth():
    app.dependency_overrides.clear()
    client = TestClient(app)
    assert client.post("/plan/build", json={}).status_code == 401


def test_build_409_without_profile(client_factory):
    client, _db = client_factory(None)
    res = client.post("/plan/build", json={})
    assert res.status_code == 409


def test_build_409_with_low_ftp(client_factory):
    client, _db = client_factory(_profile(ftp_watts=50))
    res = client.post("/plan/build", json={})
    assert res.status_code == 409
    assert "FTP" in res.json()["detail"]


def test_build_calls_rebuild_idempotently(client_factory):
    client, db = client_factory(_profile())
    rebuild = AsyncMock(return_value=dict(_SUMMARY))
    with patch("app.api.plan.rebuild_plan", rebuild):
        res = client.post("/plan/build", json={})
    assert res.status_code == 200
    body = res.json()
    assert body["rebuilt"] is True
    assert body["phase"] == "base1"
    assert body["ctl_anchor"] == 36.7
    assert len(body["week"]) == 2

    kwargs = rebuild.await_args.kwargs
    assert kwargs["source"] == "onboarding"           # default
    assert kwargs["signal"] == "plan_build"
    assert kwargs["idempotent_per_day"] is True       # idempotent per day


def test_build_passes_plan_change_source(client_factory):
    client, _db = client_factory(_profile())
    rebuild = AsyncMock(return_value=dict(_SUMMARY))
    with patch("app.api.plan.rebuild_plan", rebuild):
        res = client.post("/plan/build", json={"source": "plan_change"})
    assert res.status_code == 200
    assert rebuild.await_args.kwargs["source"] == "plan_change"


# ──────────────────────────────────────────────────────────────────────────
#  GET /plan/change/interview
# ──────────────────────────────────────────────────────────────────────────

def test_interview_returns_credit_and_delta_questions(client_factory):
    client, _db = client_factory(_profile())
    with patch("app.api.plan.interview_state", AsyncMock(return_value=dict(_STATE))):
        res = client.get("/plan/change/interview")
    assert res.status_code == 200
    body = res.json()

    # Credit ledger surfaces what was done — never a guilt frame.
    assert body["current"]["sessions_done"] == 9
    assert body["current"]["compliance_pct"] == 75
    assert body["current"]["favorite_session"]["template_id"] == "vo2_5x4"

    # Fully-populated profile → only the three delta questions.
    ids = [q["id"] for q in body["questions"]]
    assert ids == ["felt_wrong", "goal_changed", "weekly_hours"]
    felt = body["questions"][0]
    assert felt["type"] == "choice"
    assert felt["options"] == ["too_hard", "too_boring", "too_rigid", "life_changed"]
    assert felt["prompt_de"] and felt["prompt_en"]


def test_interview_asks_gap_questions_for_sparse_profile(client_factory):
    client, _db = client_factory(
        _profile(days_available=None, experience_level=None,
                 hard_day_blackouts=None, target_event_date=None)
    )
    with patch("app.api.plan.interview_state", AsyncMock(return_value=dict(_STATE))):
        res = client.get("/plan/change/interview")
    ids = [q["id"] for q in res.json()["questions"]]
    assert "days_available" in ids
    assert "experience_level" in ids
    assert "goal_new" in ids


# ──────────────────────────────────────────────────────────────────────────
#  POST /plan/change/apply
# ──────────────────────────────────────────────────────────────────────────

def test_apply_updates_profile_and_rebuilds(client_factory):
    prof = _profile(variety_dial="steady")
    client, _db = client_factory(prof)

    rebuild = AsyncMock(return_value=dict(_SUMMARY))
    update = AsyncMock(return_value=prof)
    with patch("app.api.plan.rebuild_plan", rebuild), \
         patch("app.api.plan.interview_state", AsyncMock(return_value=dict(_STATE))), \
         patch("app.services.athlete_service.update_profile", update):
        res = client.post(
            "/plan/change/apply",
            json={"answers": {"felt_wrong": "too_boring", "weekly_hours": 10}},
        )

    assert res.status_code == 200
    body = res.json()

    # Answers mapped to profile updates: boring → variety dial up, hours set.
    assert body["profile_updates"]["variety_dial"] == "mixed"
    assert body["profile_updates"]["weekly_hours_available"] == 10.0
    update.assert_awaited_once()

    # Rebuild through the same shared path, crediting completed work.
    kwargs = rebuild.await_args.kwargs
    assert kwargs["source"] == "plan_change"
    assert kwargs["signal"] == "too_boring"
    assert kwargs["carried"]["sessions_done"] == 9
    assert "weekly_hours_available" in kwargs["carried"]["profile_updates"]

    # The response returns the new week summary + the credit ledger.
    assert body["carried"]["compliance_pct"] == 75
    assert body["phase"] == "base1"
    assert len(body["week"]) == 2


def test_apply_without_profile_changes_still_rebuilds(client_factory):
    client, _db = client_factory(_profile())
    rebuild = AsyncMock(return_value=dict(_SUMMARY))
    update = AsyncMock()
    with patch("app.api.plan.rebuild_plan", rebuild), \
         patch("app.api.plan.interview_state", AsyncMock(return_value=dict(_STATE))), \
         patch("app.services.athlete_service.update_profile", update):
        res = client.post(
            "/plan/change/apply", json={"answers": {"felt_wrong": "too_hard"}}
        )
    assert res.status_code == 200
    update.assert_not_awaited()                  # nothing punitive to write
    assert rebuild.await_args.kwargs["signal"] == "too_hard"
    assert res.json()["profile_updates"] == {}


def test_apply_rejects_invalid_answers(client_factory):
    client, _db = client_factory(_profile())
    res = client.post(
        "/plan/change/apply", json={"answers": {"felt_wrong": "hated_it"}}
    )
    assert res.status_code == 422


def test_apply_no_event_clears_goal(client_factory):
    prof = _profile()
    client, _db = client_factory(prof)
    rebuild = AsyncMock(return_value=dict(_SUMMARY))
    update = AsyncMock(return_value=prof)
    with patch("app.api.plan.rebuild_plan", rebuild), \
         patch("app.api.plan.interview_state", AsyncMock(return_value=dict(_STATE))), \
         patch("app.services.athlete_service.update_profile", update):
        res = client.post(
            "/plan/change/apply",
            json={"answers": {"felt_wrong": "life_changed", "goal_changed": "no_event"}},
        )
    assert res.status_code == 200
    body = res.json()
    assert body["profile_updates"]["target_event_type"] == "maintenance"
    assert body["profile_updates"]["target_event_date"] is None
    # The schema-level update carried the explicit None (clears the event).
    schema_arg = update.await_args.args[2]
    assert "target_event_date" in schema_arg.model_fields_set
    assert schema_arg.target_event_date is None
