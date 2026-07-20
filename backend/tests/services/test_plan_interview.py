"""Plan-change interview + rebuild path — plan-engine v2.

Covers:
  1. Delta-driven question selection (pure) — never re-asks known facts.
  2. apply_answers mapping (pure) — no-guilt, non-punitive semantics.
  3. New profile-field validation (AthleteProfileUpdate / DaysAvailable).
  4. rebuild_plan — live-CTL anchor asserted, adaptation row written,
     idempotent-per-day short-circuit, FTP guard before any delete.
  5. interview_state — credit ledger (sessions done, compliance, favorite).

DB is mocked (AsyncMock) — no Postgres required, matching the pattern in
tests/services/test_mesocycle_generator.py.
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.schemas.athlete import AthleteProfileUpdate, DaysAvailable
from app.services.plan_interview import (
    ENGINE_OWNED_SOURCES,
    apply_answers,
    build_interview_questions,
    interview_state,
    rebuild_plan,
)


# ──────────────────────────────────────────────────────────────────────────
#  Helpers
# ──────────────────────────────────────────────────────────────────────────

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
        days_available={"mon": True, "tue": True, "wed": True, "thu": True,
                        "fri": True, "sat": True, "sun": True, "long_day": "sat"},
        motivation_style="race_focused",
        variety_dial="mixed",
        experience_level="returning",
        hard_day_blackouts=[],
        goals={},
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _question_ids(profile) -> list[str]:
    return [q.id for q in build_interview_questions(profile)]


# ──────────────────────────────────────────────────────────────────────────
#  1. Question selection
# ──────────────────────────────────────────────────────────────────────────

def test_complete_profile_gets_only_delta_questions():
    """A fully-populated profile is asked ONLY the delta questions —
    what felt wrong, goal confirmation, hours confirmation."""
    ids = _question_ids(_profile())
    assert ids == ["felt_wrong", "goal_changed", "weekly_hours"]


def test_felt_wrong_is_always_first_with_science_options():
    qs = build_interview_questions(_profile())
    assert qs[0].id == "felt_wrong"
    assert qs[0].type == "choice"
    assert qs[0].options == ["too_hard", "too_boring", "too_rigid", "life_changed"]


def test_gap_questions_appear_only_when_fields_null():
    prof = _profile(
        days_available=None, experience_level=None, hard_day_blackouts=None,
        target_event_date=None,
    )
    ids = _question_ids(prof)
    assert "days_available" in ids
    assert "experience_level" in ids
    assert "hard_day_blackouts" in ids
    # No event on file → asked what they're working toward, not "still valid?"
    assert "goal_new" in ids and "goal_changed" not in ids


def test_motivation_and_variety_are_never_asked():
    """Learned from behavior / depth selector — never interrogated."""
    prof = _profile(motivation_style=None, variety_dial=None)
    ids = _question_ids(prof)
    assert "motivation_style" not in ids
    assert "variety_dial" not in ids


def test_event_date_appears_in_goal_prompt():
    qs = build_interview_questions(_profile())
    goal_q = next(q for q in qs if q.id == "goal_changed")
    assert "2026-12-05" in goal_q.prompt_en
    assert "2026-12-05" in goal_q.prompt_de


def test_hours_prompt_shows_current_value():
    qs = build_interview_questions(_profile(weekly_hours_available=12.0))
    hours_q = next(q for q in qs if q.id == "weekly_hours")
    assert "12" in hours_q.prompt_en


# ──────────────────────────────────────────────────────────────────────────
#  2. apply_answers
# ──────────────────────────────────────────────────────────────────────────

def test_too_boring_bumps_variety_dial():
    out = apply_answers(_profile(variety_dial="steady"), {"felt_wrong": "too_boring"})
    assert out.updates["variety_dial"] == "mixed"
    out = apply_answers(_profile(variety_dial="mixed"), {"felt_wrong": "too_boring"})
    assert out.updates["variety_dial"] == "adventurous"
    # Already at max — nothing to change, no fake update
    out = apply_answers(_profile(variety_dial="adventurous"), {"felt_wrong": "too_boring"})
    assert "variety_dial" not in out.updates


def test_too_hard_is_never_punitive():
    """'Too hard' must NOT slash hours or clear goals — the rebuild anchors
    to live CTL, which is the honest feasibility fix."""
    out = apply_answers(_profile(), {"felt_wrong": "too_hard"})
    assert out.updates == {}
    assert out.signals == ["too_hard"]


def test_no_event_flips_to_maintenance():
    out = apply_answers(_profile(), {"goal_changed": "no_event"})
    assert out.updates["target_event_date"] is None
    assert out.updates["target_event_type"] == "maintenance"
    assert out.updates["target_priority"] is None


def test_new_event_sets_structured_fields():
    out = apply_answers(
        _profile(),
        {
            "goal_changed": "new_event",
            "target_event_date": date(2026, 9, 12),
            "target_event_type": "race",
            "target_priority": "A",
        },
    )
    assert out.updates["target_event_date"] == date(2026, 9, 12)
    assert out.updates["target_event_type"] == "race"
    assert out.updates["target_priority"] == "A"
    assert "goal_changed" in out.signals


def test_weekly_hours_parsing_and_bounds():
    assert apply_answers(_profile(), {"weekly_hours": 8}).updates[
        "weekly_hours_available"
    ] == 8.0
    assert apply_answers(_profile(), {"weekly_hours": "9.5"}).updates[
        "weekly_hours_available"
    ] == 9.5
    # Unchanged → no update
    assert "weekly_hours_available" not in apply_answers(
        _profile(weekly_hours_available=12.0), {"weekly_hours": 12}
    ).updates
    # Nonsense / out of range → ignored, never a crash
    assert apply_answers(_profile(), {"weekly_hours": "much"}).updates == {}
    assert apply_answers(_profile(), {"weekly_hours": 50}).updates == {}


def test_blackouts_filtered_and_full_week_rejected():
    out = apply_answers(
        _profile(), {"hard_day_blackouts": ["mon", "funday", "fri"]}
    )
    assert out.updates["hard_day_blackouts"] == ["mon", "fri"]
    out = apply_answers(
        _profile(),
        {"hard_day_blackouts": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]},
    )
    assert "hard_day_blackouts" not in out.updates


def test_direct_dial_sets_are_allowed():
    out = apply_answers(
        _profile(), {"variety_dial": "adventurous", "motivation_style": "fun_variety"}
    )
    assert out.updates["variety_dial"] == "adventurous"
    assert out.updates["motivation_style"] == "fun_variety"


# ──────────────────────────────────────────────────────────────────────────
#  3. Schema validation for the new profile fields
# ──────────────────────────────────────────────────────────────────────────

def test_days_available_rejects_zero_available_days():
    with pytest.raises(ValidationError):
        AthleteProfileUpdate(
            days_available={d: False for d in
                            ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
        )


def test_days_available_long_day_must_be_available():
    with pytest.raises(ValidationError):
        AthleteProfileUpdate(days_available={"sat": False, "long_day": "sat"})


def test_days_available_valid_roundtrip():
    upd = AthleteProfileUpdate(
        days_available={"wed": False, "long_day": "sun"},
        motivation_style="fitness_builder",
        variety_dial="steady",
        experience_level="new",
        hard_day_blackouts=["mon"],
    )
    dumped = upd.model_dump(exclude_unset=True)
    assert dumped["days_available"]["wed"] is False
    assert dumped["days_available"]["long_day"] == "sun"
    assert DaysAvailable(**dumped["days_available"]).available_days() == [
        "mon", "tue", "thu", "fri", "sat", "sun"
    ]


def test_hard_day_blackouts_validation():
    with pytest.raises(ValidationError):
        AthleteProfileUpdate(hard_day_blackouts=["monday"])
    with pytest.raises(ValidationError):
        AthleteProfileUpdate(
            hard_day_blackouts=["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        )
    upd = AthleteProfileUpdate(hard_day_blackouts=["fri", "fri", "mon"])
    assert upd.hard_day_blackouts == ["fri", "mon"]


def test_enum_fields_reject_unknown_values():
    with pytest.raises(ValidationError):
        AthleteProfileUpdate(motivation_style="win_everything")
    with pytest.raises(ValidationError):
        AthleteProfileUpdate(variety_dial="chaotic")
    with pytest.raises(ValidationError):
        AthleteProfileUpdate(experience_level="pro_tour")


# ──────────────────────────────────────────────────────────────────────────
#  4. rebuild_plan
# ──────────────────────────────────────────────────────────────────────────

def _exec_result(scalars_all=None, scalar_one=None):
    res = MagicMock()
    res.scalars.return_value.all.return_value = scalars_all or []
    res.scalar_one_or_none.return_value = scalar_one
    return res


def _rebuild_db(week_rows=None, sacred_rows=None):
    """db.execute order in rebuild_plan: sacred select → delete pw →
    delete meso → (_week_summary select)."""
    db = MagicMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _exec_result(scalars_all=sacred_rows or []),  # sacred count
            _exec_result(),                                # delete planned
            _exec_result(),                                # delete meso
            _exec_result(scalars_all=week_rows or []),     # week summary
        ]
    )
    return db


def _pw(d: date, template_id: str, sport: str = "cycling", source: str = "ai_prescribed"):
    return SimpleNamespace(
        date=d, sport=sport, title=template_id, template_id=template_id,
        blocks_source=source,
    )


def test_rebuild_plan_anchors_live_ctl_and_logs_adaptation():
    monday = date.today() - timedelta(days=date.today().weekday())
    week_rows = [_pw(monday, "vo2_5x4"), _pw(monday + timedelta(days=1), "rest_day")]
    db = _rebuild_db(week_rows=week_rows)
    meso = SimpleNamespace(phase="base1", weekly_tss_targets=[246, 253, 253, 152])

    gen = AsyncMock(return_value=meso)
    pmc = AsyncMock(return_value={"total": [{"date": "2026-07-01", "ctl": 36.7}]})
    log = AsyncMock()

    with patch("app.services.mesocycle_generator.generate_mesocycle", gen), \
         patch("app.services.pmc_service.compute_user_pmc", pmc), \
         patch("app.services.plan_interview.log_adaptation", log), \
         patch("app.services.plan_interview.already_adapted", AsyncMock(return_value=False)):
        summary = asyncio.run(
            rebuild_plan(db, 1, _profile(), source="onboarding", signal="plan_build")
        )

    assert summary["rebuilt"] is True
    assert summary["phase"] == "base1"
    assert summary["ctl_anchor"] == 36.7
    # Live CTL is the generator's anchor — credits completed work.
    assert gen.await_args.kwargs["current_ctl"] == 36.7

    # Exactly one adaptation row, honest fields.
    assert log.await_count == 1
    kwargs = log.await_args.kwargs
    assert kwargs["source"] == "onboarding"
    assert kwargs["rule"] == "plan_built"
    assert kwargs["evidence"]["ctl_anchor"] == 36.7
    assert "CTL 37" in kwargs["message_en"] or "CTL 36" in kwargs["message_en"]


def test_rebuild_plan_idempotent_per_day_short_circuits():
    monday = date.today() - timedelta(days=date.today().weekday())
    db = MagicMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[_exec_result(scalars_all=[_pw(monday, "vo2_5x4")])]
    )
    gen = AsyncMock()
    log = AsyncMock()

    with patch("app.services.mesocycle_generator.generate_mesocycle", gen), \
         patch("app.services.plan_interview.log_adaptation", log), \
         patch("app.services.plan_interview.already_adapted", AsyncMock(return_value=True)):
        summary = asyncio.run(
            rebuild_plan(
                db, 1, _profile(), source="onboarding", signal="plan_build",
                idempotent_per_day=True,
            )
        )

    assert summary["rebuilt"] is False
    gen.assert_not_awaited()          # nothing regenerated
    log.assert_not_awaited()          # no duplicate feed entry
    assert len(summary["week"]) == 1  # existing plan returned


def test_rebuild_plan_ftp_guard_fires_before_any_delete():
    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    with pytest.raises(ValueError):
        asyncio.run(
            rebuild_plan(
                db, 1, _profile(ftp_watts=50), source="onboarding", signal="plan_build",
            )
        )
    db.execute.assert_not_awaited()


def test_rebuild_plan_plan_change_message_credits_done_work():
    monday = date.today() - timedelta(days=date.today().weekday())
    db = _rebuild_db(
        week_rows=[_pw(monday, "vo2_5x4")],
        sacred_rows=[MagicMock(), MagicMock()],  # two user-owned rows survive
    )
    meso = SimpleNamespace(phase="base2", weekly_tss_targets=[280, 290, 300, 180])
    log = AsyncMock()

    with patch("app.services.mesocycle_generator.generate_mesocycle", AsyncMock(return_value=meso)), \
         patch("app.services.pmc_service.compute_user_pmc",
               AsyncMock(return_value={"total": [{"date": "2026-07-01", "ctl": 41.2}]})), \
         patch("app.services.plan_interview.log_adaptation", log), \
         patch("app.services.plan_interview.already_adapted", AsyncMock(return_value=False)):
        summary = asyncio.run(
            rebuild_plan(
                db, 1, _profile(), source="plan_change", signal="too_boring",
                carried={"sessions_done": 9, "compliance_pct": 75},
            )
        )

    assert summary["preserved_sessions"] == 2
    kwargs = log.await_args.kwargs
    assert kwargs["source"] == "plan_change"
    assert kwargs["signal"] == "too_boring"
    # Credits what was done — the no-guilt register.
    assert "9 completed sessions still count" in kwargs["message_en"]
    assert "2 of your own sessions stay untouched" in kwargs["message_en"]
    assert kwargs["evidence"]["sessions_done"] == 9


def test_engine_owned_sources_exclude_user_rows():
    """The delete filter must never cover athlete-owned rows."""
    assert "user_plan" not in ENGINE_OWNED_SOURCES
    assert "user_modified" not in ENGINE_OWNED_SOURCES
    assert "user_undo" not in ENGINE_OWNED_SOURCES
    assert set(ENGINE_OWNED_SOURCES) == {"ai_prescribed", "coach_absorbed"}


# ──────────────────────────────────────────────────────────────────────────
#  5. interview_state (credit ledger)
# ──────────────────────────────────────────────────────────────────────────

def _activity(day: date, sport: str = "cycling"):
    return SimpleNamespace(
        started_at=datetime(day.year, day.month, day.day, 10, 0, tzinfo=timezone.utc),
        sport=sport,
    )


def test_interview_state_credits_done_sessions():
    today = date.today()
    plan_start = today - timedelta(days=14)

    planned = [
        _pw(plan_start, "vo2_5x4"),
        _pw(plan_start + timedelta(days=1), "z2_endurance_90"),
        _pw(plan_start + timedelta(days=2), "rest_day"),       # excluded
        _pw(plan_start + timedelta(days=3), "vo2_5x4"),
        _pw(plan_start + timedelta(days=4), "sweet_spot_2x20"),
    ]
    activities = [
        _activity(plan_start),                       # vo2 done
        _activity(plan_start + timedelta(days=3)),   # vo2 done
        _activity(plan_start + timedelta(days=4), sport="running"),  # wrong sport
    ]

    db = MagicMock()
    db.execute = AsyncMock(
        side_effect=[
            _exec_result(scalar_one=plan_start),      # earliest meso anchor
            _exec_result(scalars_all=planned),        # planned rows
            _exec_result(scalars_all=activities),     # activities
        ]
    )

    with patch(
        "app.services.pmc_service.compute_user_pmc",
        AsyncMock(return_value={"total": [
            {"date": plan_start.isoformat(), "ctl": 30.0},
            {"date": today.isoformat(), "ctl": 36.5},
        ]}),
    ):
        state = asyncio.run(interview_state(db, 1, _profile()))

    assert state["weeks_completed"] == 2
    assert state["planned_sessions"] == 4          # rest day excluded
    assert state["sessions_done"] == 2             # running ≠ planned cycling day
    assert state["compliance_pct"] == 50
    assert state["ctl_delta_since_start"] == 6.5
    # Most-completed archetype is the honest favorite proxy (no RPE store).
    assert state["favorite_session"]["template_id"] == "vo2_5x4"
    assert state["favorite_session"]["completed"] == 2


def test_interview_state_without_plan_returns_zero_state():
    db = MagicMock()
    db.execute = AsyncMock(side_effect=[_exec_result(scalar_one=None)])
    state = asyncio.run(interview_state(db, 1, _profile()))
    assert state["weeks_completed"] == 0
    assert state["sessions_done"] == 0
    assert state["compliance_pct"] is None
    assert state["favorite_session"] is None
