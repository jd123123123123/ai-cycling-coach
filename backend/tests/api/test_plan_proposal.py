"""POST /coach/plan/preview + /coach/plan/apply — the AI Coach Proposal Card.

Contract under test:
    1. preview returns a concrete before→after (BlockBars-ready blocks + TSS /
       intensity / duration deltas) and PERSISTS NOTHING (no db.add, no commit).
    2. preview is honest when nothing can change (no plan → applicable=False).
    3. apply runs the SAME intent through the audited pipeline
       (modify_planned_workout_for_user): PlannedWorkout mutated, CoachBrief
       audit row + PlanAdaptation feed row added, week cache invalidated.

Mock pattern mirrors tests/api/test_workout_modify_endpoint.py.
"""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import (
    get_current_active_user,
    get_current_user,
    get_db_for_user,
)
from app.models.coach_brief import CoachBrief
from app.models.plan_adaptation import PlanAdaptation


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


def _make_db(*, planned_workout=None, athlete_profile=None, latest_brief=None,
             has_today_activity: bool = False):
    captured: list = []

    async def _execute_side(stmt, *args, **kwargs):
        stmt_str = str(stmt).lower()
        out = MagicMock()
        if "planned_workouts" in stmt_str and "activities" not in stmt_str:
            out.scalar_one_or_none = MagicMock(return_value=planned_workout)
        elif "activities" in stmt_str:
            out.scalar_one_or_none = MagicMock(
                return_value=1 if has_today_activity else None)
        elif "athlete_profiles" in stmt_str:
            out.scalar_one_or_none = MagicMock(return_value=athlete_profile)
        elif "coach_briefs" in stmt_str:
            out.scalar_one_or_none = MagicMock(return_value=latest_brief)
        else:
            out.scalar_one_or_none = MagicMock(return_value=None)
        return out

    db = MagicMock()
    db.execute = AsyncMock(side_effect=_execute_side)
    db.add = MagicMock(side_effect=lambda obj: captured.append(obj))
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    return db, captured


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


class TestPreview:
    def test_easier_preview_is_concrete_and_persists_nothing(self, client_factory):
        pw = _make_pw(template_id="sweet_spot_2x20", duration_min=90)
        db, captured = _make_db(planned_workout=pw, athlete_profile=_make_profile())
        client = client_factory(db)

        res = client.post("/coach/plan/preview",
                          json={"modification_type": "easier"})
        assert res.status_code == 200
        body = res.json()
        assert body["applicable"] is True
        assert body["scope"] == "day"
        # Concrete before→after with BlockBars-ready blocks.
        assert body["before"]["template_id"] == "sweet_spot_2x20"
        assert body["after"]["template_id"] != "sweet_spot_2x20"
        assert len(body["before"]["blocks"]) > 0
        assert len(body["after"]["blocks"]) > 0
        # Deltas present; easier → lower or equal load.
        assert body["tss_delta"] is not None
        assert body["after"]["predicted_tss"] <= body["before"]["predicted_tss"]
        assert body["rationale"] and body["rationale_de"]
        # PERSISTS NOTHING — the whole point of propose-before-apply.
        assert captured == []
        db.commit.assert_not_called()

    def test_preview_not_applicable_without_plan(self, client_factory):
        db, captured = _make_db(planned_workout=None, athlete_profile=_make_profile())
        client = client_factory(db)
        res = client.post("/coach/plan/preview",
                          json={"modification_type": "easier"})
        assert res.status_code == 200
        body = res.json()
        assert body["applicable"] is False
        assert body["reason"]
        assert captured == []

    def test_preview_not_applicable_without_ftp(self, client_factory):
        pw = _make_pw()
        db, captured = _make_db(planned_workout=pw, athlete_profile=_make_profile(ftp=0))
        client = client_factory(db)
        res = client.post("/coach/plan/preview",
                          json={"modification_type": "easier"})
        assert res.status_code == 200
        assert res.json()["applicable"] is False
        assert captured == []


def _make_week_db(*, week_pws, athlete_profile):
    """db mock whose planned_workouts SELECT returns a LIST (scalars().all())."""
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


class TestWeekPreview:
    def test_easier_week_steps_hard_days_down_and_persists_nothing(self, client_factory):
        mon = date.today() - __import__("datetime").timedelta(days=date.today().weekday())
        td = __import__("datetime").timedelta
        week = [
            SimpleNamespace(id=1, user_id=1, date=mon, sport="cycling",
                            title="Sweet Spot", duration_seconds_target=90 * 60,
                            interval_structure=None, indoor=False,
                            blocks_source="ai_prescribed", template_id="sweet_spot_2x20"),
            SimpleNamespace(id=2, user_id=1, date=mon + td(days=2), sport="cycling",
                            title="Endurance", duration_seconds_target=60 * 60,
                            interval_structure=None, indoor=False,
                            blocks_source="ai_prescribed", template_id="z2_endurance_60"),
            SimpleNamespace(id=3, user_id=1, date=mon + td(days=4), sport="cycling",
                            title="VO2", duration_seconds_target=60 * 60,
                            interval_structure=None, indoor=False,
                            blocks_source="ai_prescribed", template_id="vo2_5x4"),
        ]
        db = _make_week_db(week_pws=week, athlete_profile=_make_profile())
        client = client_factory(db)
        res = client.post("/coach/plan/preview",
                          json={"modification_type": "easier", "scope": "week"})
        assert res.status_code == 200
        body = res.json()
        assert body["applicable"] is True
        assert body["scope"] == "week"
        assert len(body["day_diffs"]) == 3
        # The two intensity days changed; the endurance day did not.
        changed = [d for d in body["day_diffs"] if d["changed"]]
        assert len(changed) == 2
        assert body["week_after_tss"] <= body["week_before_tss"]
        db.commit.assert_not_called()


class TestApply:
    def test_accept_applies_via_audited_pipeline(self, client_factory):
        """Accept → the shared pipeline mutates the PW + writes audit + feed +
        invalidates the week cache. Same guarantees as the chat modify tool."""
        pw = _make_pw(template_id="sweet_spot_2x20", duration_min=90)
        db, captured = _make_db(planned_workout=pw, athlete_profile=_make_profile())
        client = client_factory(db)

        with patch("app.api.weeks.invalidate_personalized_week_cache") as inval:
            res = client.post("/coach/plan/apply",
                              json={"modification_type": "easier"})
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["modification_type"] == "easier"
        # PW mutated to a PROTECTED source.
        assert pw.blocks_source == "user_modified"
        # Audit row + feed row written; cache invalidated.
        assert any(isinstance(o, CoachBrief) for o in captured)
        assert any(isinstance(o, PlanAdaptation) for o in captured)
        db.commit.assert_awaited()
        inval.assert_called_once()
