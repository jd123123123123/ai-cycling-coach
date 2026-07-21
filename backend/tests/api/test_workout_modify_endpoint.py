"""POST /workouts/today/modify + /workouts/today/modify/undo — the direct
"Anpassen" endpoints behind the SessionOfTheDay card (Today + Train tabs).

Contract under test:
    1. The endpoint reuses the EXACT chat-tool pipeline
       (coach_tools.modify_planned_workout_for_user) — PlannedWorkout write,
       blocks_source='user_modified', CoachBrief audit row, PlanAdaptation
       feed row, personalized-week cache invalidation.
    2. Downstream-science semantics: 'user_modified' is a PROTECTED source for
       the hourly adaptation engine (D8) and NOT engine-owned for the plan
       rebuild — the modified row survives a week regeneration.
    3. Validation: unknown modification_type → 422; shorten without
       duration_min → success=False with a clear reason.
    4. Undo delegates to the shared 60-min-window undo pipeline.

Pattern mirrors tests/api/test_plan_build.py: dependency_overrides for
auth + db; the DB mock routes per-table like tests/test_coach_tools.py.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user
from app.models.coach_brief import CoachBrief
from app.models.plan_adaptation import PlanAdaptation


def _make_user(user_id: int = 1) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


def _make_pw(template_id: str = "sweet_spot_2x20", duration_min: int = 90):
    return SimpleNamespace(
        id=42,
        user_id=1,
        date=date.today(),
        sport="cycling",
        title="Sweet Spot 2x20",
        duration_seconds_target=duration_min * 60,
        description=None,
        interval_structure=None,
        indoor=False,
        blocks_source="ai_prescribed",
        template_id=template_id,
    )


def _make_profile(ftp: int | None = 250, injury: bool = False):
    return SimpleNamespace(
        user_id=1, ftp_watts=ftp, injury_flag=injury, timezone="Europe/Berlin",
    )


def _make_db(*, planned_workout=None, athlete_profile=None, latest_brief=None,
             has_today_activity: bool = False):
    """Route the pipeline's per-table SELECTs; capture every db.add object."""
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


class TestModifyTodayEndpoint:
    def test_easier_modifies_pw_audits_feeds_and_invalidates(self, client_factory):
        """The integration contract in one flow: modify via endpoint →
        PlannedWorkout mutated to a PROTECTED source + audit row + feed row +
        week cache invalidated so /weeks serves the change fresh."""
        pw = _make_pw(template_id="sweet_spot_2x20", duration_min=90)
        db, captured = _make_db(planned_workout=pw, athlete_profile=_make_profile())
        client = client_factory(db)

        with patch("app.api.weeks.invalidate_personalized_week_cache") as inval:
            res = client.post("/workouts/today/modify",
                              json={"modification_type": "easier"})
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["modification_type"] == "easier"
        assert body["template_id"] == "tempo_3x10"  # one step down the cascade

        # 1 · PlannedWorkout mutated, marked user-authored
        assert pw.template_id == "tempo_3x10"
        assert pw.blocks_source == "user_modified"

        # 2 · Audit row (undo window) — verdict='modification'
        audits = [c for c in captured if isinstance(c, CoachBrief)]
        assert len(audits) == 1
        assert audits[0].verdict == "modification"
        assert audits[0].evidence["modification"]["before"]["template_id"] == "sweet_spot_2x20"

        # 3 · Feed row — source='user_change', no-guilt German copy
        feeds = [c for c in captured if isinstance(c, PlanAdaptation)]
        assert len(feeds) == 1
        feed = feeds[0]
        assert feed.source == "user_change"
        assert feed.rule == "user_modified"
        assert feed.message_de.startswith("Du hast angepasst")
        assert feed.before["template_id"] == "sweet_spot_2x20"
        assert feed.after["template_id"] == "tempo_3x10"

        # 4 · Week cache invalidated → next /weeks request rebuilds fresh
        inval.assert_called_once_with(1)

        # 5 · One transaction
        db.commit.assert_called_once()

    def test_shorten_carries_duration_min(self, client_factory):
        pw = _make_pw(template_id="z2_endurance_90", duration_min=90)
        db, _ = _make_db(planned_workout=pw, athlete_profile=_make_profile())
        client = client_factory(db)
        res = client.post("/workouts/today/modify",
                          json={"modification_type": "shorten", "duration_min": 45})
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["duration_min"] <= 60  # genuinely shorter than 90

    def test_shorten_without_duration_is_graceful(self, client_factory):
        pw = _make_pw()
        db, captured = _make_db(planned_workout=pw, athlete_profile=_make_profile())
        client = client_factory(db)
        res = client.post("/workouts/today/modify",
                          json={"modification_type": "shorten"})
        assert res.status_code == 200
        assert res.json()["success"] is False
        assert "duration_min" in res.json()["reason"]
        assert captured == []  # nothing persisted

    def test_unknown_modification_type_is_422(self, client_factory):
        db, _ = _make_db(planned_workout=_make_pw(), athlete_profile=_make_profile())
        client = client_factory(db)
        res = client.post("/workouts/today/modify",
                          json={"modification_type": "explode"})
        assert res.status_code == 422

    def test_no_planned_workout_and_no_brief_returns_found_false(self, client_factory):
        db, captured = _make_db(planned_workout=None, athlete_profile=_make_profile())
        client = client_factory(db)
        res = client.post("/workouts/today/modify",
                          json={"modification_type": "harder"})
        assert res.status_code == 200
        assert res.json()["success"] is False
        assert res.json().get("found") is False
        assert captured == []

    def test_rails_downgrade_is_narrated_not_hidden(self, client_factory):
        """Injury flag → the pipeline downgrades and says so."""
        pw = _make_pw(template_id="vo2_5x4", duration_min=57)
        db, _ = _make_db(planned_workout=pw,
                         athlete_profile=_make_profile(injury=True))
        client = client_factory(db)
        res = client.post("/workouts/today/modify",
                          json={"modification_type": "harder"})
        body = res.json()
        assert body["success"] is True
        assert body["rails_downgraded"] is True
        assert "injury" in body["reason"].lower()


class TestDownstreamScienceContracts:
    """The written-back row is what the algorithms consume."""

    def test_user_modified_is_protected_from_the_hourly_engine(self):
        """D8: PROTECTED_SOURCES — the engine never auto-mutates a
        user-modified row (illness interlock excepted by design)."""
        from app.services.plan_adaptation_engine import PROTECTED_SOURCES
        assert "user_modified" in PROTECTED_SOURCES
        assert "user_plan" in PROTECTED_SOURCES

    def test_user_modified_survives_week_regeneration(self):
        """The plan rebuild deletes ONLY engine-owned rows — a user-modified
        row is sacred substrate for the next mesocycle/week generation."""
        from app.services.plan_interview import ENGINE_OWNED_SOURCES
        assert "user_modified" not in ENGINE_OWNED_SOURCES
        assert "user_undo" not in ENGINE_OWNED_SOURCES
        assert set(ENGINE_OWNED_SOURCES) == {"ai_prescribed", "coach_absorbed"}

    def test_engine_filler_detection_skips_protected_rows(self):
        """_is_filler_endurance — the reflow donor picker — must never pick a
        user-authored row, even a perfectly matching endurance filler."""
        from app.services.plan_adaptation_engine import _is_filler_endurance
        sunday = date(2026, 7, 26)
        row = SimpleNamespace(
            date=date(2026, 7, 24), sport="cycling",
            template_id="z2_endurance_60", blocks_source="user_modified",
        )
        assert _is_filler_endurance(row, sunday=sunday) is False
        row.blocks_source = "ai_prescribed"
        assert _is_filler_endurance(row, sunday=sunday) is True


class TestUndoEndpoint:
    def _make_audit(self):
        return SimpleNamespace(
            id=7,
            user_id=1,
            verdict="modification",
            generated_at=datetime.now(timezone.utc) - timedelta(minutes=5),
            evidence={
                "modification": {
                    "date": date.today().isoformat(),
                    "modification_type": "easier",
                    "params": {},
                    "before": {"template_id": "vo2_5x4", "duration_min": 57},
                    "after": {"template_id": "z2_endurance_60",
                              "duration_min": 60, "indoor": False,
                              "predicted_tss": 45},
                    "rails_downgraded": False,
                    "reason": "substituted down one step in the easier cascade",
                },
            },
        )

    def _make_undo_db(self, *, latest=None, pw=None, profile=None):
        captured: list = []
        brief_calls = {"n": 0}

        async def _execute_side(stmt, *args, **kwargs):
            stmt_str = str(stmt).lower()
            out = MagicMock()
            if "coach_briefs" in stmt_str:
                brief_calls["n"] += 1
                out.scalar_one_or_none = MagicMock(
                    return_value=latest if brief_calls["n"] == 1 else None)
            elif "planned_workouts" in stmt_str:
                out.scalar_one_or_none = MagicMock(return_value=pw)
            elif "athlete_profiles" in stmt_str:
                out.scalar_one_or_none = MagicMock(return_value=profile)
            else:
                out.scalar_one_or_none = MagicMock(return_value=None)
            return out

        db = MagicMock()
        db.execute = AsyncMock(side_effect=_execute_side)
        db.add = MagicMock(side_effect=lambda obj: captured.append(obj))
        db.commit = AsyncMock()
        db.flush = AsyncMock()
        return db, captured

    def test_undo_restores_and_logs_revert_feed_row(self, client_factory):
        pw = _make_pw(template_id="z2_endurance_60", duration_min=60)
        db, captured = self._make_undo_db(
            latest=self._make_audit(), pw=pw, profile=_make_profile())
        client = client_factory(db)
        res = client.post("/workouts/today/modify/undo")
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["restored_template_id"] == "vo2_5x4"
        assert pw.template_id == "vo2_5x4"
        assert pw.blocks_source == "user_undo"
        # Compensating audit row + rule='revert' feed row
        audits = [c for c in captured if isinstance(c, CoachBrief)]
        feeds = [c for c in captured if isinstance(c, PlanAdaptation)]
        assert len(audits) == 1 and audits[0].verdict == "modification_undo"
        assert len(feeds) == 1
        assert feeds[0].rule == "revert"
        assert feeds[0].source == "user_change"
        assert feeds[0].message_de.startswith("Rückgängig gemacht")

    def test_nothing_to_undo_is_graceful(self, client_factory):
        db, captured = self._make_undo_db(latest=None)
        client = client_factory(db)
        res = client.post("/workouts/today/modify/undo")
        assert res.status_code == 200
        assert res.json()["found"] is False
        assert captured == []


class TestWeekCacheInvalidation:
    def test_invalidation_bumps_generation_so_weeks_rebuilds(self):
        """invalidate_personalized_week_cache must change the per-user
        generation — the mechanism that makes the next GET /weeks recompute
        instead of serving the pre-modification overlay."""
        from app.api import weeks as weeks_mod
        gen_before = weeks_mod._personalized_week_generation.get(424242, 0)
        weeks_mod.invalidate_personalized_week_cache(424242)
        gen_after = weeks_mod._personalized_week_generation.get(424242, 0)
        assert gen_after != gen_before
