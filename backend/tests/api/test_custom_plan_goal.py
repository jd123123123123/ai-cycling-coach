from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.main import app
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user
from app.schemas.plan_goal import CustomGoalInput
from app.schemas.athlete import TrainingGoals
from app.services.plan_goal import preview_goal, apply_goal_to_profile

TODAY = date(2026, 5, 10)
def goal(**kw):
    return CustomGoalInput(**dict(dict(target_date=TODAY + timedelta(days=70), duration_hours=5,
        distance_km=140, ascent_m=1500, weekly_hours=8, intent="finish"), **kw))

def test_rules_and_explicit_focus():
    result = preview_goal(goal(), TODAY)
    assert result.focus == "endurance"
    assert result.long_ride_target_minutes <= 8 * 60 * .45
    assert preview_goal(goal(duration_hours=1, distance_km=35, ascent_m=100, intent="race"), TODAY).focus == "vo2"
    assert preview_goal(goal(duration_hours=3, distance_km=80, ascent_m=2000), TODAY).focus == "threshold"
    preset = preview_goal(CustomGoalInput(focus="vo2", weekly_hours=6), TODAY)
    assert preset.focus == "vo2" and preset.goal.target_date == TODAY + timedelta(weeks=8)

@pytest.mark.parametrize("change", [{"target_date": TODAY}, {"target_date": TODAY + timedelta(days=731)}])
def test_invalid_date(change):
    with pytest.raises(ValueError): preview_goal(goal(**change), TODAY)

@pytest.mark.parametrize("kw", [{"weekly_hours": float("inf")}, {"distance_km": -1}, {"days_per_week": 8}, {"user_id": 2}])
def test_invalid_schema(kw):
    with pytest.raises(ValidationError): goal(**kw)

def test_persisted_inputs_and_unrelated_goals_preserved():
    profile = SimpleNamespace(goals={"stage_theme": "studio", "program": {"run": {"id": "run_5k", "started": "2026-01-01"}}}, days_available={"mon": False, "sun": True, "long_day": "sun"})
    result = preview_goal(goal(days_per_week=3), TODAY)
    apply_goal_to_profile(profile, result, TODAY)
    assert profile.goals["stage_theme"] == "studio"
    assert profile.goals["program"]["run"]["id"] == "run_5k"
    assert profile.target_event_date == result.goal.target_date
    assert profile.weekly_hours_available == 8
    assert sum(v is True for v in profile.days_available.values()) == 3
    assert not profile.days_available["mon"]
    assert profile.goals["push_intensity"] == "steady"
    validated = TrainingGoals(**profile.goals)
    assert validated.custom_goal.ascent_m == 1500

@pytest.fixture
def client():
    profile = SimpleNamespace(user_id=7, timezone="Europe/Berlin", goals={}, days_available=None,
        ftp_watts=250, primary_sport="cycling")
    db = AsyncMock()
    result = MagicMock(); result.scalar_one_or_none.return_value = profile
    db.execute.return_value = result
    user = SimpleNamespace(id=7, is_active=True)
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db_for_user] = lambda: db
    with patch("app.api.plan_goal.today_local", return_value=TODAY):
        yield TestClient(app), db, profile
    app.dependency_overrides.clear()

def test_preview_no_writes(client):
    http, db, profile = client
    res = http.post("/plan/goal/preview", json=goal().model_dump(mode="json"))
    assert res.status_code == 200, res.text
    db.commit.assert_not_awaited(); db.flush.assert_not_awaited()
    assert profile.goals == {}
    query = str(db.execute.call_args.args[0])
    assert "athlete_profiles.user_id" in query

def test_apply_rebuild_receives_persisted_demand_and_atomic_flag(client):
    http, db, profile = client
    async def rebuild(session, uid, p, **kwargs):
        assert uid == 7 and p.goals["custom_goal"]["distance_km"] == 140
        assert kwargs["atomic"] is True
        assert p.target_event_date == TODAY + timedelta(days=70)
        return {"rebuilt": True, "preserved_sessions": 2}
    with patch("app.api.plan_goal.rebuild_plan", side_effect=rebuild), patch("app.api.weeks.invalidate_personalized_week_cache"):
        res = http.post("/plan/goal/apply", json=goal().model_dump(mode="json"))
    assert res.status_code == 200, res.text
    assert res.json()["plan"]["preserved_sessions"] == 2
    db.commit.assert_awaited_once()

def test_failed_build_rolls_back(client):
    http, db, _ = client
    with patch("app.api.plan_goal.rebuild_plan", side_effect=ValueError("Unavailable")):
        res = http.post("/plan/goal/apply", json=goal().model_dump(mode="json"))
    assert res.status_code == 409
    db.rollback.assert_awaited_once(); db.commit.assert_not_awaited()

def test_exact_days_override_count_and_previous_flags():
    payload = goal(days_available=["tue", "thu", "sat"], days_per_week=7)
    assert payload.days_per_week == 3
    profile = SimpleNamespace(goals={}, days_available={"sat": False, "long_day": "sun"})
    apply_goal_to_profile(profile, preview_goal(payload, TODAY), TODAY)
    assert {k for k,v in profile.days_available.items() if v is True} == {"tue", "thu", "sat"}
    assert profile.days_available["long_day"] == "sat"

def test_auth_required():
    app.dependency_overrides.clear()
    with TestClient(app) as http:
        for route in ("preview", "apply"):
            assert http.post(f"/plan/goal/{route}", json=goal().model_dump(mode="json")).status_code == 401

def test_focus_is_used_by_real_generator_and_respects_days():
    from app.services.mesocycle_generator import build_week_drafts
    profile = SimpleNamespace(user_id=7, goals={}, days_available=None, primary_sport="cycling",
        ftp_watts=250, secondary_sports=[], target_event_date=None, target_event_type=None)
    payload = CustomGoalInput(focus="vo2", weekly_hours=8, days_available=["tue", "thu", "sat", "sun"])
    apply_goal_to_profile(profile, preview_goal(payload, TODAY), TODAY)
    drafts = build_week_drafts(athlete=profile, week_start=date(2026,5,11), phase="build2",
        weekly_tss_target_val=450, block_position="accumulation", ftp_w=250)
    for draft in drafts:
        if draft.date.weekday() in {0,2,4}:
            assert draft.template_id == "rest_day"
    assert sum(d.duration_seconds_target for d in drafts) <= 8 * 3600 * 1.05
    assert any(d.template_id.startswith("vo2_") for d in drafts)
