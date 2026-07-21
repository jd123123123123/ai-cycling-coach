"""POST /coach/plan/preview-text — free-text → Proposal Card (LLM-free).

Contract:
    1. A typed adjustment ("nur 45 min heute") parses to an intent and returns
       a concrete PlanProposal — and PERSISTS NOTHING.
    2. A week-scope phrase ("mach die Woche leichter") returns a week proposal.
    3. Gibberish / analytical questions return actionable=False (no proposal),
       so the UI can fall back to plain chat.

Mock pattern mirrors tests/api/test_plan_proposal.py.
"""
from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import (
    get_current_active_user,
    get_current_user,
    get_db_for_user,
)


def _make_user(user_id: int = 1) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


def _make_pw(template_id: str = "sweet_spot_2x20", duration_min: int = 90):
    return SimpleNamespace(
        id=42, user_id=1, date=date.today(), sport="cycling",
        title="Sweet Spot 2x20", duration_seconds_target=duration_min * 60,
        description=None, interval_structure=None, indoor=False,
        blocks_source="ai_prescribed", template_id=template_id,
    )


def _make_profile(ftp: int | None = 250, injury: bool = False):
    return SimpleNamespace(
        user_id=1, ftp_watts=ftp, injury_flag=injury, timezone="Europe/Berlin",
    )


def _make_db(*, planned_workout=None, athlete_profile=None):
    captured: list = []

    async def _execute_side(stmt, *args, **kwargs):
        stmt_str = str(stmt).lower()
        out = MagicMock()
        if "planned_workouts" in stmt_str and "activities" not in stmt_str:
            out.scalar_one_or_none = MagicMock(return_value=planned_workout)
        elif "activities" in stmt_str:
            out.scalar_one_or_none = MagicMock(return_value=None)
        elif "athlete_profiles" in stmt_str:
            out.scalar_one_or_none = MagicMock(return_value=athlete_profile)
        else:
            out.scalar_one_or_none = MagicMock(return_value=None)
        return out

    db = MagicMock()
    db.execute = AsyncMock(side_effect=_execute_side)
    db.add = MagicMock(side_effect=lambda obj: captured.append(obj))
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    return db, captured


def _make_week_db(*, week_pws, athlete_profile):
    async def _execute_side(stmt, *args, **kwargs):
        stmt_str = str(stmt).lower()
        out = MagicMock()
        if "planned_workouts" in stmt_str and "activities" not in stmt_str:
            scalars = MagicMock()
            scalars.all = MagicMock(return_value=week_pws)
            out.scalars = MagicMock(return_value=scalars)
        elif "athlete_profiles" in stmt_str:
            out.scalar_one_or_none = MagicMock(return_value=athlete_profile)
        else:
            out.scalar_one_or_none = MagicMock(return_value=None)
        return out

    db = MagicMock()
    db.execute = AsyncMock(side_effect=_execute_side)
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


@pytest.fixture()
def client_factory():
    def _make(db):
        user = _make_user()
        app.dependency_overrides[get_current_active_user] = lambda: user
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db_for_user] = lambda: db
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


class TestTextPreview:
    def test_typed_shorten_yields_proposal_persists_nothing(self, client_factory):
        pw = _make_pw(template_id="sweet_spot_2x20", duration_min=90)
        db, captured = _make_db(planned_workout=pw, athlete_profile=_make_profile())
        client = client_factory(db)

        res = client.post("/coach/plan/preview-text",
                          json={"text": "nur 45 min heute", "locale": "de"})
        assert res.status_code == 200
        body = res.json()
        assert body["actionable"] is True
        assert body["intent"]["modification_type"] == "shorten"
        assert body["intent"]["params"]["duration_min"] == 45
        assert body["proposal"]["applicable"] is True
        assert body["proposal"]["scope"] == "day"
        # Shortened from the 90-min session (may cascade to a shorter template).
        assert body["proposal"]["after"]["duration_min"] < body["proposal"]["before"]["duration_min"]
        # PERSISTS NOTHING.
        assert captured == []
        db.commit.assert_not_called()

    def test_typed_easier_week(self, client_factory):
        mon = date.today() - timedelta(days=date.today().weekday())
        week = [
            SimpleNamespace(id=1, user_id=1, date=mon, sport="cycling",
                            title="Sweet Spot", duration_seconds_target=90 * 60,
                            interval_structure=None, indoor=False,
                            blocks_source="ai_prescribed", template_id="sweet_spot_2x20"),
            SimpleNamespace(id=3, user_id=1, date=mon + timedelta(days=4), sport="cycling",
                            title="VO2", duration_seconds_target=60 * 60,
                            interval_structure=None, indoor=False,
                            blocks_source="ai_prescribed", template_id="vo2_5x4"),
        ]
        db = _make_week_db(week_pws=week, athlete_profile=_make_profile())
        client = client_factory(db)

        res = client.post("/coach/plan/preview-text",
                          json={"text": "mach die Woche leichter", "locale": "de"})
        assert res.status_code == 200
        body = res.json()
        assert body["actionable"] is True
        assert body["intent"]["scope"] == "week"
        assert body["proposal"]["scope"] == "week"
        assert body["proposal"]["applicable"] is True
        db.commit.assert_not_called()

    def test_gibberish_is_not_actionable(self, client_factory):
        db, captured = _make_db(planned_workout=_make_pw(), athlete_profile=_make_profile())
        client = client_factory(db)

        res = client.post("/coach/plan/preview-text",
                          json={"text": "warum bin ich müde?", "locale": "de"})
        assert res.status_code == 200
        body = res.json()
        assert body["actionable"] is False
        assert body["proposal"] is None
        assert body["message"]
        assert captured == []
        db.commit.assert_not_called()

    def test_harder_typed(self, client_factory):
        pw = _make_pw(template_id="z2_endurance_60", duration_min=60)
        db, captured = _make_db(planned_workout=pw, athlete_profile=_make_profile())
        client = client_factory(db)

        res = client.post("/coach/plan/preview-text",
                          json={"text": "make it harder", "locale": "en"})
        assert res.status_code == 200
        body = res.json()
        assert body["actionable"] is True
        assert body["intent"]["modification_type"] == "harder"
        assert captured == []
