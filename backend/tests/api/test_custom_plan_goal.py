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
    assert preset.focus == "vo2" and preset.goal.target_date is None
    assert preset.block_end_date == TODAY + timedelta(weeks=8)
    assert preset.has_event is False and preset.event_type is None
    assert preset.event_duration_hours is None

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

@pytest.mark.parametrize('focuses', [[], ['auto'], ['sprint'], ['vo2', 'invalid'], ['vo2'] * 4])
def test_invalid_focus_combinations(focuses):
    with pytest.raises(ValidationError):
        CustomGoalInput(focuses=focuses, weekly_hours=6)


def test_combination_normalizes_and_wins_over_legacy_focus():
    payload = CustomGoalInput(focus='threshold', focuses=['vo2', 'endurance', 'vo2'], weekly_hours=8)
    assert payload.focus == 'vo2'
    assert payload.focuses == ['vo2', 'endurance']
    result = preview_goal(payload, TODAY)
    assert result.focuses == result.goal.focuses == ['vo2', 'endurance']
    assert result.focus_label == 'VO₂max + Ausdauer'
    assert result.goal.target_date is None
    assert payload.target_date is None  # preview does not mutate caller input
    assert result.weeks_remaining == 8


def test_focus_block_clears_old_event_but_preserves_unrelated_goals():
    profile = SimpleNamespace(goals={'stage_theme': 'studio', 'target_event': {'name': 'Old race', 'date': '2027-01-01'}},
        days_available=None, target_event_date=date(2027, 1, 1), target_event_type='race',
        target_event_gpx='<gpx>old route</gpx>', target_priority='A')
    result = preview_goal(CustomGoalInput(focuses=['endurance', 'vo2'], weekly_hours=8), TODAY)
    apply_goal_to_profile(profile, result, TODAY)
    assert profile.target_event_date is None
    assert profile.target_event_type is None
    assert profile.target_priority is None
    assert profile.target_event_gpx is None
    assert 'target_event' not in profile.goals
    assert profile.goals['target_event_date'] is None
    assert profile.goals['custom_goal']['target_date'] is None
    assert profile.goals['custom_goal']['focuses'] == ['endurance', 'vo2']
    assert profile.goals['custom_goal_block_end_date'] == (TODAY + timedelta(weeks=8)).isoformat()
    assert profile.goals['stage_theme'] == 'studio'
    validated = TrainingGoals(**profile.goals)
    assert validated.custom_goal.focuses == ['endurance', 'vo2']
    assert validated.custom_goal_block_end_date == profile.goals['custom_goal_block_end_date']


def test_combination_event_keeps_real_event_demand():
    result = preview_goal(goal(focuses=['vo2', 'endurance'], ascent_m=2000), TODAY)
    assert result.has_event
    assert result.goal.target_date == TODAY + timedelta(days=70)
    assert result.event_type == 'fondo'
    assert result.event_duration_hours == 5
    assert result.climbing


def test_no_date_combination_preview_and_apply_api(client):
    http, db, profile = client
    payload = {'focuses': ['vo2', 'endurance'], 'weekly_hours': 8, 'days_available': ['tue', 'thu', 'sat', 'sun']}
    preview = http.post('/plan/goal/preview', json=payload)
    assert preview.status_code == 200, preview.text
    assert preview.json()['goal']['target_date'] is None
    assert preview.json()['goal']['focuses'] == ['vo2', 'endurance']
    assert preview.json()['has_event'] is False
    db.flush.assert_not_awaited(); db.commit.assert_not_awaited()
    async def rebuild(session, uid, p, **kwargs):
        assert uid == 7 and kwargs['atomic'] is True
        assert p.goals['custom_goal']['focuses'] == ['vo2', 'endurance']
        assert p.target_event_date is None
        return {'rebuilt': True}
    with patch('app.api.plan_goal.rebuild_plan', side_effect=rebuild), patch('app.api.weeks.invalidate_personalized_week_cache'):
        response = http.post('/plan/goal/apply', json=payload)
    assert response.status_code == 200, response.text
    assert response.json()['goal']['target_date'] is None
    db.commit.assert_awaited_once()


def _focus_week(focuses, week_start=date(2026, 5, 11), phase='build2', block='accumulation', days=None, birth=None):
    from app.services.mesocycle_generator import build_week_drafts
    profile = SimpleNamespace(user_id=7, goals={}, days_available=None, primary_sport='cycling',
        ftp_watts=250, secondary_sports=[], target_event_date=None, target_event_type=None,
        date_of_birth=birth)
    payload = CustomGoalInput(focuses=focuses, weekly_hours=8,
        days_available=days or ['tue', 'thu', 'sat', 'sun'])
    apply_goal_to_profile(profile, preview_goal(payload, TODAY), TODAY)
    return build_week_drafts(athlete=profile, week_start=week_start, phase=phase,
        weekly_tss_target_val=450, block_position=block, ftp_w=250)


def _quality_categories(drafts):
    from app.services.workout_templates import TEMPLATES
    return [TEMPLATES[d.template_id].category for d in drafts
        if TEMPLATES[d.template_id].category in ('vo2', 'threshold', 'sweet_spot', 'tempo')]


@pytest.mark.parametrize('focuses', [
    ['endurance', 'vo2'], ['endurance', 'threshold'], ['vo2', 'threshold'],
    ['endurance', 'vo2', 'threshold'],
])
def test_combinations_influence_real_schedule_within_budget(focuses):
    from app.services.workout_templates import TEMPLATES
    weeks = [_focus_week(focuses, week_start=date(2026, 5, 11) + timedelta(weeks=i)) for i in range(2)]
    seen = set()
    for drafts in weeks:
        categories = _quality_categories(drafts)
        seen.update(categories)
        limit = 1 if 'endurance' in focuses and len(focuses) == 2 else 2
        assert len(categories) <= limit
        assert sum(d.duration_seconds_target for d in drafts) <= 8 * 3600 * 1.05
        assert all(d.template_id == 'rest_day' for d in drafts if d.date.weekday() in {0, 2, 4})
        assert any(TEMPLATES[d.template_id].category == 'endurance' for d in drafts)
    for focus in set(focuses) - {'endurance'}:
        assert focus in seen, (focuses, seen)


def test_adding_endurance_changes_real_week_without_adding_quality():
    hard_only = _focus_week(['vo2', 'threshold'])
    mixed = _focus_week(['endurance', 'vo2', 'threshold'])
    assert [(d.template_id, d.duration_seconds_target) for d in mixed] != [(d.template_id, d.duration_seconds_target) for d in hard_only]
    assert len(_quality_categories(mixed)) <= len(_quality_categories(hard_only))


@pytest.mark.parametrize('focuses', [['vo2'], ['threshold'], ['endurance', 'vo2'], ['vo2', 'threshold']])
def test_no_date_base_phase_still_honours_focus(focuses):
    seen = set()
    for i in range(2):
        seen.update(_quality_categories(_focus_week(focuses, phase='base2', week_start=date(2026, 5, 11) + timedelta(weeks=i))))
    for focus in set(focuses) - {'endurance'}:
        assert focus in seen, (focuses, seen)


def test_combination_recovery_week_stays_easy():
    assert _quality_categories(_focus_week(['endurance', 'threshold', 'vo2'], block='recovery')) == []


def test_limited_days_rotate_quality_without_extra_training_days():
    categories = set()
    for i in range(2):
        drafts = _focus_week(['vo2', 'threshold'], days=['wed', 'sun'], week_start=date(2026, 5, 11) + timedelta(weeks=i))
        actual = _quality_categories(drafts)
        assert len(actual) <= 1
        categories.update(actual)
        assert all(d.template_id == 'rest_day' for d in drafts if d.date.weekday() not in {2, 6})
    assert categories == {'vo2', 'threshold'}


def test_combination_keeps_age_limit():
    from app.services.age_rails import rails_for_profile
    birth = date(1941, 1, 1)
    drafts = _focus_week(['endurance', 'threshold', 'vo2'], birth=birth)
    assert len(_quality_categories(drafts)) <= rails_for_profile(birth).max_hard_per_week


def test_no_date_input_does_not_need_distance_duration_or_event_name():
    result = preview_goal(CustomGoalInput(focuses=['endurance', 'vo2'], weekly_hours=4), TODAY)
    assert result.goal.duration_hours is None
    assert result.goal.distance_km is None
    assert result.goal.name is None
    assert result.goal.target_date is None


def test_stale_event_is_not_resurrected_by_trajectory_normalization():
    from app.services.goal_trajectory import normalize_athlete_goals
    profile = SimpleNamespace(goals={'target_event': {'name': 'Old event', 'date': '2027-01-01'}}, days_available=None)
    apply_goal_to_profile(profile, preview_goal(CustomGoalInput(focuses=['vo2', 'threshold'], weekly_hours=6), TODAY), TODAY)
    normalized = normalize_athlete_goals(profile)
    assert not normalized.get('target_event')
    assert normalized['target_event_date'] is None


@pytest.mark.parametrize('hours', [1, 2, 4])
def test_combination_with_small_time_budget_is_trimmed(hours):
    from app.services.mesocycle_generator import build_week_drafts
    profile = SimpleNamespace(user_id=7, goals={}, days_available=None, primary_sport='cycling',
        ftp_watts=250, secondary_sports=[], target_event_date=None, target_event_type=None)
    payload = CustomGoalInput(focuses=['endurance', 'threshold', 'vo2'], weekly_hours=hours,
        days_available=['tue', 'thu', 'sat', 'sun'])
    apply_goal_to_profile(profile, preview_goal(payload, TODAY), TODAY)
    drafts = build_week_drafts(profile, date(2026, 5, 11), 'build2', int(hours * 50), 'accumulation', 250)
    assert sum(d.duration_seconds_target for d in drafts) <= hours * 3600 * 1.05
    assert len(_quality_categories(drafts)) <= 2


@pytest.mark.parametrize("changes", [{}, {"duration_hours": 3, "distance_km": 80, "ascent_m": 2000},
    {"duration_hours": 1, "distance_km": 35, "ascent_m": 100, "intent": "race"}])
def test_auto_event_preview_is_identical_when_confirmed(changes):
    preview = preview_goal(goal(**changes), TODAY)
    confirmed_input = CustomGoalInput.model_validate(preview.goal.model_dump(mode="json"))
    assert confirmed_input.focus == "auto"
    assert preview_goal(confirmed_input, TODAY) == preview
