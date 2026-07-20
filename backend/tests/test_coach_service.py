"""Unit tests for coach_service — Phase 5.1 prescription-mode shape.

Covers:
    - Rule-based fallback produces a complete PrescribedWorkout + 2 alternates
    - resolve_and_prescribe rewrites LLM watts from FTP (LLM cannot dictate watts)
    - resolve_and_prescribe enforces intensity_ceiling (downgrades above-ceiling templates)
    - resolve_and_prescribe validates template_id against the library (unknown → picker fallback)
    - Alternates are always exactly 2 (less_time + recover) with valid template_ids
    - Injury flag forces rest_day / recovery_30 end-to-end
    - generate_brief falls back when ANTHROPIC_API_KEY is missing / SDK exceptions / no tool_use
    - Cache behaviour: hit within TTL / miss after TTL / force bypass
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import coach_service
from app.services.coach_service import (
    _rule_based_brief,
    generate_brief,
    get_or_generate_brief,
    resolve_and_prescribe,
)


def _sample_snapshot(
    *,
    injury: bool = False,
    tsb: float = 5.0,
    hrv_delta: float = 0.0,
    ftp: int = 280,
    ceiling: str = "push",
    picked_template_id: str = "vo2_5x4",
    today_session_type: str = "vo2",
) -> dict:
    return {
        "generated_at": "2026-04-20T10:00:00Z",
        "athlete": {
            "goal_event_date": None, "goal_target": None,
            "weekly_hours": 10, "ftp": ftp, "weight_kg": 72.0,
            "injury_flag": injury, "injury_note": "test note" if injury else None,
            "goal_phase": "build2",
            "today_available_minutes": 85,
        },
        "pmc": {
            "ctl": 60.0, "atl": 55.0, "tsb": tsb,
            "ctl_7d_delta": 2.0, "tsb_7d_delta": -5.0,
            "form_status": "optimal" if -10 <= tsb <= 5 else "grey",
        },
        "biometrics": {
            "hrv": {"delta_pct": hrv_delta, "current_mean": 55, "baseline_28d_mean": 57, "samples_n": 7, "direction": "stable"},
            "rhr": {"delta_pct": 2.0, "current_mean": 55, "baseline_28d_mean": 54, "samples_n": 7, "direction": "stable"},
            "sleep": {"total_debt_hours": 3.0, "avg_nightly_debt": 0.2, "nights_short": 5, "nights_healthy": 9, "samples_n": 14, "target_hours": 8.0},
        },
        "distribution": {"z1_pct": 70.0, "z2_pct": 15.0, "z3_pct": 15.0, "total_hours": 10.0, "grey_zone_flag": False, "samples_n": 6},
        "activities_14d": {"count": 8, "total_tss": 600.0, "avg_ef": 1.3, "avg_decoupling": 4.0, "durability_last_long_ride": 0.93},
        "why_tired": {"causes": []},
        "recent_trend": [],
        "weekly_intensity_quota": {"phase": "build2", "z1_z2_hours": 7.5, "hard_hours": 2.0, "vo2_sessions": 1, "threshold_sessions": 2, "rest_days": 2, "total_hours": 10.0},
        "weekly_progress": {"hard_sessions_done": 0, "vo2_sessions_done": 0, "total_tss_this_week": 0.0, "total_hours_this_week": 0.0},
        "today_session_type": today_session_type,
        "picked_template_id": picked_template_id,
        "picked_template_preview": None,
        "available_templates": [
            "rest_day", "recovery_30",
            "z2_endurance_60", "z2_endurance_90", "z2_long_120", "z2_long_180",
            "tempo_3x10", "sweet_spot_2x20", "threshold_2x15", "over_under_3x5",
            "vo2_5x4", "vo2_micro_30x30",
        ],
        "rails_context": {
            "ctl": 60.0, "atl": 55.0, "tsb": tsb,
            "hrv_delta_pct": hrv_delta,
            "injury_flag": injury, "days_since_rest": 3,
            "intensity_ceiling": ceiling,
        },
    }


# ---------------------------------------------------------------------------
# Rule-based fallback — always produces a complete prescribed brief
# ---------------------------------------------------------------------------

class TestRuleBasedBrief:
    def test_produces_prescribed_workout(self):
        brief = _rule_based_brief(_sample_snapshot())
        pw = brief["prescribed_workout"]
        assert pw["template_id"] in ("vo2_5x4", "vo2_micro_30x30")
        assert pw["duration_minutes"] > 0
        assert pw["predicted_tss"] > 0
        assert len(pw["blocks"]) > 0

    def test_produces_two_alternates(self):
        brief = _rule_based_brief(_sample_snapshot())
        assert len(brief["alternates"]) == 2
        labels = {a["label"] for a in brief["alternates"]}
        assert labels == {"less_time", "recover"}

    def test_produces_seven_day_outlook(self):
        brief = _rule_based_brief(_sample_snapshot())
        assert len(brief["outlook_7d"]) == 7
        assert [e["day_offset"] for e in brief["outlook_7d"]] == list(range(7))

    def test_model_used_is_fallback_tag(self):
        brief = _rule_based_brief(_sample_snapshot())
        assert brief["model_used"] == "rule-based-fallback"

    def test_injury_forces_rest_day(self):
        """injury_flag → ceiling 'rest' → prescribed_workout is rest_day."""
        snap = _sample_snapshot(
            injury=True,
            ceiling="rest",
            picked_template_id="rest_day",
            today_session_type="rest",
        )
        brief = _rule_based_brief(snap)
        assert brief["prescribed_workout"]["template_id"] == "rest_day"
        assert "injury" in brief["verdict"].lower()

    def test_watts_derived_from_ftp(self):
        """FTP=280 → VO2 blocks at 322W ±5% = 306-338W."""
        brief = _rule_based_brief(_sample_snapshot(ftp=280))
        pw = brief["prescribed_workout"]
        vo2_blocks = [b for b in pw["blocks"] if b["zone"] == 5]
        assert len(vo2_blocks) >= 1
        for b in vo2_blocks:
            assert 305 <= b["target_watts_low"] <= 310
            assert 335 <= b["target_watts_high"] <= 340

    def test_rationale_cites_data_numbers(self):
        # Technical-mode rationale cites the numeric framework terms.
        # (Default is 'simple' as of Phase 5.2, so we opt into technical here.)
        snap = {**_sample_snapshot(), "language": "technical"}
        brief = _rule_based_brief(snap)
        r = brief["rationale"]
        assert "TSB" in r or "CTL" in r
        assert "Banister" in r or "Friel" in r


# ---------------------------------------------------------------------------
# resolve_and_prescribe — server-side watts authority
# ---------------------------------------------------------------------------

class TestResolveAndPrescribe:
    def test_rewrites_llm_watts(self):
        """LLM returns nonsense watts; server rewrites from FTP."""
        snap = _sample_snapshot(ftp=280)
        llm = {
            "verdict": "VO2", "rationale": "fresh",
            "prescribed_workout": {
                "template_id": "vo2_5x4",
                "title": "VO2 5x4",
                "duration_minutes": 57,
                "predicted_tss": 72,
                "framework_cited": "Coggan Z5",
                # LLM returns absurd watts
                "blocks": [{"name": "VO2", "duration_s": 240, "target_watts_low": 999, "target_watts_high": 9999, "zone": 5, "rpe": 9}],
                "why_this_workout": "fresh",
            },
            "alternates": [
                {"label": "less_time", "one_liner": "3x3 VO2", "template_id": "vo2_5x4"},
                {"label": "recover", "one_liner": "Z1 spin", "template_id": "recovery_30"},
            ],
            "outlook_7d": [{"day_offset": i, "suggested_tss": 50, "note": "d"} for i in range(7)],
            "frameworks_cited": ["Coggan"],
        }
        resolved = resolve_and_prescribe(snap, llm)
        vo2_blocks = [b for b in resolved["prescribed_workout"]["blocks"] if b["zone"] == 5]
        assert len(vo2_blocks) == 5
        for b in vo2_blocks:
            # 115% × 280 = 322 ±5% = 306-338
            assert 305 <= b["target_watts_low"] <= 310
            assert 335 <= b["target_watts_high"] <= 340

    def test_unknown_template_falls_back_to_picker(self):
        snap = _sample_snapshot(ftp=280, picked_template_id="sweet_spot_2x20")
        llm = {
            "prescribed_workout": {
                "template_id": "does_not_exist",
                "title": "whatever",
                "duration_minutes": 60,
                "predicted_tss": 0,
                "framework_cited": "",
                "blocks": [],
                "why_this_workout": "",
            },
            "alternates": [],
            "verdict": "", "rationale": "", "outlook_7d": [], "frameworks_cited": [],
        }
        resolved = resolve_and_prescribe(snap, llm)
        assert resolved["prescribed_workout"]["template_id"] == "sweet_spot_2x20"

    def test_ceiling_enforcement_downgrades_above_ceiling(self):
        """Rails ceiling is 'moderate'; LLM picks vo2 → downgrade to sweet_spot."""
        snap = _sample_snapshot(ftp=280, ceiling="moderate")
        llm = {
            "prescribed_workout": {
                "template_id": "vo2_5x4",
                "title": "VO2",
                "duration_minutes": 60,
                "predicted_tss": 70,
                "framework_cited": "",
                "blocks": [],
                "why_this_workout": "test",
            },
            "alternates": [],
            "verdict": "", "rationale": "", "outlook_7d": [], "frameworks_cited": [],
        }
        resolved = resolve_and_prescribe(snap, llm)
        # vo2 rank=6, moderate ceiling=4 → downgrade to safe-for-moderate
        assert resolved["prescribed_workout"]["template_id"] == "sweet_spot_2x20"
        assert "downgrade" in resolved["prescribed_workout"]["why_this_workout"].lower()

    def test_rest_ceiling_forces_rest_day(self):
        snap = _sample_snapshot(ftp=280, ceiling="rest")
        llm = {
            "prescribed_workout": {
                "template_id": "vo2_5x4",
                "title": "VO2",
                "duration_minutes": 60,
                "predicted_tss": 70,
                "framework_cited": "",
                "blocks": [],
                "why_this_workout": "",
            },
            "alternates": [],
            "verdict": "", "rationale": "", "outlook_7d": [], "frameworks_cited": [],
        }
        resolved = resolve_and_prescribe(snap, llm)
        assert resolved["prescribed_workout"]["template_id"] == "rest_day"

    def test_alternates_always_two_with_both_labels(self):
        """Even if LLM returns 0 alternates, we synthesise both."""
        snap = _sample_snapshot(ftp=280)
        llm = {
            "prescribed_workout": {
                "template_id": "vo2_5x4", "title": "", "duration_minutes": 60,
                "predicted_tss": 0, "framework_cited": "", "blocks": [], "why_this_workout": "",
            },
            "alternates": [],
            "verdict": "", "rationale": "", "outlook_7d": [], "frameworks_cited": [],
        }
        resolved = resolve_and_prescribe(snap, llm)
        assert len(resolved["alternates"]) == 2
        assert {a["label"] for a in resolved["alternates"]} == {"less_time", "recover"}

    def test_alternates_invalid_template_id_replaced(self):
        snap = _sample_snapshot(ftp=280)
        llm = {
            "prescribed_workout": {
                "template_id": "vo2_5x4", "title": "", "duration_minutes": 60,
                "predicted_tss": 0, "framework_cited": "", "blocks": [], "why_this_workout": "",
            },
            "alternates": [
                {"label": "less_time", "one_liner": "x", "template_id": "totally_made_up"},
                {"label": "recover", "one_liner": "y", "template_id": "also_fake"},
            ],
            "verdict": "", "rationale": "", "outlook_7d": [], "frameworks_cited": [],
        }
        resolved = resolve_and_prescribe(snap, llm)
        valid_ids = set([
            "rest_day", "recovery_30",
            "z2_endurance_60", "z2_endurance_90", "z2_long_120", "z2_long_180",
            "tempo_3x10", "sweet_spot_2x20", "threshold_2x15", "over_under_3x5",
            "vo2_5x4", "vo2_micro_30x30",
        ])
        for alt in resolved["alternates"]:
            assert alt["template_id"] in valid_ids

    def test_duration_hint_clamped_to_plus_minus_15_pct(self):
        """LLM asks for 2h VO2 → clamped to 1.15 × base."""
        snap = _sample_snapshot(ftp=280)
        llm = {
            "prescribed_workout": {
                "template_id": "vo2_5x4",
                "title": "", "duration_minutes": 180,  # 3h — ludicrous
                "predicted_tss": 0, "framework_cited": "", "blocks": [], "why_this_workout": "",
            },
            "alternates": [],
            "verdict": "", "rationale": "", "outlook_7d": [], "frameworks_cited": [],
        }
        resolved = resolve_and_prescribe(snap, llm)
        # vo2_5x4 base is 57 min; clamped to 1.15 → max 65 min
        assert resolved["prescribed_workout"]["duration_minutes"] <= 66


# ---------------------------------------------------------------------------
# generate_brief — LLM path vs rule-based fallback
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestGenerateBrief:
    async def test_no_api_key_falls_back(self, monkeypatch):
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        result = await generate_brief(_sample_snapshot())
        assert result["model_used"] == "rule-based-fallback"
        assert "prescribed_workout" in result
        assert len(result["alternates"]) == 2
        assert len(result["outlook_7d"]) == 7

    async def test_mocked_anthropic_returns_prescribed_workout(self, monkeypatch):
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", "fake-key")
        monkeypatch.setattr("app.services.coach_service.settings.COACH_MODEL", "claude-opus-4-7")

        tool_input = {
            "verdict": "VO2 — fresh",
            "rationale": "TSB +5, HRV +0% — fresh window (Banister, Seiler).",
            "prescribed_workout": {
                "template_id": "vo2_5x4",
                "title": "VO2 — 5×4min",
                "duration_minutes": 57,
                "predicted_tss": 72,
                "framework_cited": "Coggan Z5 · Friel Build 2",
                "blocks": [
                    {"name": "Warm-up", "duration_s": 900, "target_watts_low": 140, "target_watts_high": 165, "zone": 1, "rpe": 3},
                ],
                "why_this_workout": "You're fresh; VO2 window open; last VO2 11d ago.",
            },
            "alternates": [
                {"label": "less_time", "one_liner": "Short VO2 3x3", "template_id": "vo2_5x4"},
                {"label": "recover", "one_liner": "Z1 30 min", "template_id": "recovery_30"},
            ],
            "outlook_7d": [{"day_offset": i, "suggested_tss": 50.0, "note": f"Day {i}"} for i in range(7)],
            "frameworks_cited": ["Coggan Z5", "Seiler polarized"],
        }

        tool_block = SimpleNamespace(type="tool_use", name="brief_response", input=tool_input)
        response = SimpleNamespace(content=[tool_block])

        fake_client = MagicMock()
        fake_client.messages = MagicMock()
        fake_client.messages.create = AsyncMock(return_value=response)

        fake_anthropic_module = MagicMock()
        fake_anthropic_module.AsyncAnthropic = MagicMock(return_value=fake_client)

        with patch.dict("sys.modules", {"anthropic": fake_anthropic_module}):
            result = await generate_brief(_sample_snapshot(ftp=280))

        assert result["verdict"] == "VO2 — fresh"
        assert result["model_used"] == "claude-opus-4-7"
        assert result["prescribed_workout"]["template_id"] == "vo2_5x4"
        # Server rewrote watts — not the stub the LLM returned
        vo2_blocks = [b for b in result["prescribed_workout"]["blocks"] if b["zone"] == 5]
        assert len(vo2_blocks) == 5
        fake_client.messages.create.assert_awaited_once()

    async def test_anthropic_exception_falls_back(self, monkeypatch):
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", "fake-key")

        fake_client = MagicMock()
        fake_client.messages = MagicMock()
        fake_client.messages.create = AsyncMock(side_effect=RuntimeError("API down"))

        fake_anthropic_module = MagicMock()
        fake_anthropic_module.AsyncAnthropic = MagicMock(return_value=fake_client)

        with patch.dict("sys.modules", {"anthropic": fake_anthropic_module}):
            result = await generate_brief(_sample_snapshot())

        assert result["model_used"] == "rule-based-fallback"
        assert "prescribed_workout" in result

    async def test_no_tool_use_block_falls_back(self, monkeypatch):
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", "fake-key")

        text_block = SimpleNamespace(type="text", text="Sorry, I couldn't use the tool.")
        response = SimpleNamespace(content=[text_block])

        fake_client = MagicMock()
        fake_client.messages = MagicMock()
        fake_client.messages.create = AsyncMock(return_value=response)

        fake_anthropic_module = MagicMock()
        fake_anthropic_module.AsyncAnthropic = MagicMock(return_value=fake_client)

        with patch.dict("sys.modules", {"anthropic": fake_anthropic_module}):
            result = await generate_brief(_sample_snapshot())

        assert result["model_used"] == "rule-based-fallback"


# ---------------------------------------------------------------------------
# get_or_generate_brief — cache behaviour
# ---------------------------------------------------------------------------

class _MockDB:
    """Mock AsyncSession that simulates CoachBrief cache reads and writes."""

    def __init__(self, initial_cache: list | None = None):
        self.stored = list(initial_cache or [])
        self.add_count = 0
        self.commit_count = 0
        self.refresh_count = 0
        self._last_added = None

    async def execute(self, stmt):
        result = MagicMock()
        latest = self.stored[-1] if self.stored else None
        result.scalar_one_or_none = MagicMock(return_value=latest)
        return result

    def add(self, obj):
        self.add_count += 1
        self._last_added = obj

    async def commit(self):
        self.commit_count += 1
        if self._last_added is not None:
            if getattr(self._last_added, "id", None) is None:
                self._last_added.id = len(self.stored) + 1
            if getattr(self._last_added, "generated_at", None) is None:
                self._last_added.generated_at = datetime.now(timezone.utc)
            self.stored.append(self._last_added)

    async def refresh(self, obj):
        self.refresh_count += 1


@pytest.mark.asyncio
class TestGetOrGenerateBriefCache:
    async def test_cache_hit_returns_existing(self, monkeypatch):
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        monkeypatch.setattr("app.services.coach_service.settings.COACH_BRIEF_CACHE_HOURS", 6)

        existing = SimpleNamespace(
            id=42,
            user_id=1,
            # "now" — unambiguously inside both the TTL and the athlete-local
            # day, so the day-freshness gate (audit P0-2) can't reject it.
            generated_at=datetime.now(timezone.utc),
            verdict="cached",
            rationale="",
            evidence={},
            options=None,
            prescribed_workout=None,
            alternates=[],
            outlook_7d=[],
            frameworks_cited=[],
            raw_prompt="",
            model_used="rule-based-fallback",
        )
        db = _MockDB(initial_cache=[existing])

        build_mock = AsyncMock(return_value=_sample_snapshot())
        monkeypatch.setattr("app.services.coach_service.build_snapshot", build_mock)

        result = await get_or_generate_brief(db, user_id=1, force=False)
        assert result is existing
        assert db.add_count == 0
        build_mock.assert_not_awaited()

    async def test_force_regenerates_even_if_fresh(self, monkeypatch):
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        monkeypatch.setattr("app.services.coach_service.settings.COACH_BRIEF_CACHE_HOURS", 6)

        existing = SimpleNamespace(
            id=42, user_id=1,
            generated_at=datetime.now(timezone.utc) - timedelta(minutes=10),
            verdict="cached", rationale="", evidence={},
            options=None, prescribed_workout=None, alternates=[],
            outlook_7d=[], frameworks_cited=[],
            raw_prompt="", model_used="rule-based-fallback",
        )
        db = _MockDB(initial_cache=[existing])

        monkeypatch.setattr(
            "app.services.coach_service.build_snapshot",
            AsyncMock(return_value=_sample_snapshot()),
        )

        result = await get_or_generate_brief(db, user_id=1, force=True)
        assert db.add_count == 1
        assert result is not existing

    async def test_cache_miss_after_ttl_regenerates(self, monkeypatch):
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        monkeypatch.setattr("app.services.coach_service.settings.COACH_BRIEF_CACHE_HOURS", 6)

        db = _MockDB(initial_cache=[])

        monkeypatch.setattr(
            "app.services.coach_service.build_snapshot",
            AsyncMock(return_value=_sample_snapshot()),
        )

        result = await get_or_generate_brief(db, user_id=1, force=False)
        assert db.add_count == 1
        # Step 4: brief commit + coach_recommendations upsert commit (= 2).
        # The mock's execute() returns the latest stored row regardless of
        # entity type, so the recommendation upsert finds the just-stored
        # brief, takes the "existing" branch and only commits without adding.
        assert db.commit_count == 2
        assert result.model_used == "rule-based-fallback"
        # The new row should carry the prescribed_workout shape
        assert result.prescribed_workout is not None
        assert len(result.alternates) == 2


# ---------------------------------------------------------------------------
# Today-runthrough Step 7 — tomorrow_plan upsert
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestTomorrowRecommendationUpsert:
    """Step 7: when generate_brief returns a tomorrow_plan block, the service
    must upsert a coach_recommendations row for tomorrow's local date.
    Skipping cleanly when tomorrow_plan is absent is the other half of the
    contract.
    """

    async def _run(self, monkeypatch, brief_payload):
        """Drive get_or_generate_brief with a fake generate_brief and observe
        whether _upsert_recommendation_for_tomorrow gets called."""
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        monkeypatch.setattr("app.services.coach_service.settings.COACH_BRIEF_CACHE_HOURS", 6)

        db = _MockDB(initial_cache=[])
        monkeypatch.setattr(
            "app.services.coach_service.build_snapshot",
            AsyncMock(return_value=_sample_snapshot()),
        )
        monkeypatch.setattr(
            "app.services.coach_service.generate_brief",
            AsyncMock(return_value=brief_payload),
        )
        # Stub today's recommendation upsert so it doesn't reach the DB.
        monkeypatch.setattr(
            "app.services.coach_service._upsert_recommendation_for_today",
            AsyncMock(return_value=None),
        )

        tomorrow_calls: list[dict] = []

        async def _fake_tomorrow_upsert(*, db, user_id, brief, tomorrow_plan):
            tomorrow_calls.append({
                "user_id": user_id,
                "tomorrow_plan": tomorrow_plan,
            })

        monkeypatch.setattr(
            "app.services.coach_service._upsert_recommendation_for_tomorrow",
            _fake_tomorrow_upsert,
        )

        await get_or_generate_brief(db, user_id=1, force=False)
        return tomorrow_calls

    async def test_tomorrow_plan_present_writes_row(self, monkeypatch):
        payload = {
            "verdict": "Easy day",
            "rationale": "fresh",
            "prescribed_workout": {
                "template_id": "z2_endurance_60",
                "title": "Z2 60",
                "duration_minutes": 60,
                "predicted_tss": 45,
                "framework_cited": "San Millán Z2",
                "blocks": [],
                "why_this_workout": "",
            },
            "alternates": [
                {"label": "less_time", "one_liner": "Z2 30", "template_id": "recovery_30"},
                {"label": "recover", "one_liner": "rest", "template_id": "rest_day"},
            ],
            "outlook_7d": [{"day_offset": i, "suggested_tss": 50, "note": "d"} for i in range(7)],
            "frameworks_cited": ["Seiler"],
            "model_used": "rule-based-fallback",
            "tomorrow_plan": {
                "description": "Steady push at the high-Z2 end for ~75 minutes.",
                "predicted_tss": 70,
                "intensity_chip": "endurance",
            },
        }
        calls = await self._run(monkeypatch, payload)
        assert len(calls) == 1
        assert calls[0]["user_id"] == 1
        assert calls[0]["tomorrow_plan"]["intensity_chip"] == "endurance"
        assert calls[0]["tomorrow_plan"]["predicted_tss"] == 70

    async def test_tomorrow_plan_absent_skips_upsert(self, monkeypatch):
        payload = {
            "verdict": "Easy day",
            "rationale": "fresh",
            "prescribed_workout": {
                "template_id": "z2_endurance_60",
                "title": "Z2 60",
                "duration_minutes": 60,
                "predicted_tss": 45,
                "framework_cited": "",
                "blocks": [],
                "why_this_workout": "",
            },
            "alternates": [
                {"label": "less_time", "one_liner": "Z2 30", "template_id": "recovery_30"},
                {"label": "recover", "one_liner": "rest", "template_id": "rest_day"},
            ],
            "outlook_7d": [{"day_offset": i, "suggested_tss": 50, "note": "d"} for i in range(7)],
            "frameworks_cited": [],
            "model_used": "rule-based-fallback",
            # tomorrow_plan intentionally absent
        }
        calls = await self._run(monkeypatch, payload)
        assert calls == []


# ---------------------------------------------------------------------------
# Post-ride review (Phase 5.3) — rule-based path produces complete review
# ---------------------------------------------------------------------------

def _post_ride_snapshot(
    *,
    grade: str = "perfect",
    language: str = "simple",
    actual_duration: float = 62.0,
    actual_tss: float = 47.0,
    target_duration: float = 60.0,
    target_tss: float = 45.0,
    ef: float | None = 1.52,
    vi: float | None = 1.04,
    session_type: str = "endurance",
    template_id: str = "z2_endurance_60",
    taper_window: str = "unknown",
    on_track: str = "on_track",
) -> dict:
    """Build a snapshot that already contains post_ride data (as build_snapshot
    would populate it). Tests for _rule_based_brief can pass this in directly."""
    snap = _sample_snapshot()
    snap["language"] = language
    snap["weekly_progress"]["today_tss"] = actual_tss
    snap["weekly_progress"]["today_duration_minutes"] = actual_duration
    snap["post_ride"] = {
        "compliance": {
            "grade": grade,
            "duration": {
                "target": target_duration, "actual": actual_duration,
                "delta_pct": round((actual_duration - target_duration) / target_duration * 100, 1),
                "band": "match" if abs((actual_duration - target_duration) / target_duration * 100) <= 10 else ("over" if actual_duration > target_duration else "under"),
            },
            "tss": {
                "target": target_tss, "actual": actual_tss,
                "delta_pct": round((actual_tss - target_tss) / target_tss * 100, 1),
                "band": "match" if abs((actual_tss - target_tss) / target_tss * 100) <= 10 else ("over" if actual_tss > target_tss else "under"),
            },
            "intensity_factor": None,
            "variability_index": vi,
            "ef": ef,
            "decoupling_pct": None,
            "zone_match_pct": None,
            "phase": "build1",
            "session_type": session_type,
            "template_id": template_id,
        },
        "trajectory": {
            "days_to_goal": 42,
            "ctl_now": 60.0,
            "ctl_7d_delta": 0.8,
            "ctl_projected_at_goal": 64.8,
            "ctl_target": 65.0,
            "tsb_projected_at_goal": 10.0,
            "taper_window": taper_window,
            "on_track": on_track,
            "weekly_tss_required": 420.0,
            "weekly_tss_actual": 400.0,
            "narrative_hook": "On track: fitness projecting to 65 by race day (target 65).",
        },
        "target_template": {
            "id": template_id,
            "title": "Z2 endurance — 60min",
            "category": "endurance",
            "framework_cited": "San Millán Z2 · Seiler LIT",
            "purpose": "Fat-oxidation / mitochondrial density at LT1.",
        },
        "actual_activity": {
            "id": 123,
            "duration_minutes": int(actual_duration),
            "tss": actual_tss,
            "normalized_power": 182,
            "average_power": 175,
            "average_hr": 140,
            "started_at": "2026-04-20T09:00:00Z",
        },
    }
    return snap


# Technical-mode jargon substrings that MUST NOT appear in simple-mode narratives.
_TECHNICAL_JARGON = [
    "FTP", "TSS", "CTL", "ATL", "TSB", "NP", "IF", "VI", "EF",
    "Coggan", "Seiler", "Friel", "Banister", "San Millán", "Mujika",
    "polarized", "decoupling",
]


class TestPostRideReviewRuleBased:
    def test_produces_complete_review_when_post_ride_present(self):
        snap = _post_ride_snapshot(grade="perfect", language="technical")
        brief = _rule_based_brief(snap)
        review = brief.get("post_ride_review")
        assert review is not None
        assert review["grade"] == "perfect"
        assert review["headline"]
        assert review["physiological_read"]
        assert review["goal_trajectory"]
        assert review["next_session_nudge"]
        assert review["target_template_id"] == "z2_endurance_60"
        assert review["session_type"] == "endurance"

    def test_no_review_when_post_ride_absent(self):
        """Without snapshot.post_ride, no review is produced."""
        snap = _sample_snapshot()  # no post_ride key
        brief = _rule_based_brief(snap)
        assert brief.get("post_ride_review") is None

    def test_prescribed_workout_still_rest_day_when_post_ride(self):
        """Post-ride review present → prescribed stays rest_day (override branch)."""
        snap = _post_ride_snapshot(grade="strong")
        brief = _rule_based_brief(snap)
        assert brief["prescribed_workout"]["template_id"] == "rest_day"

    def test_each_grade_produces_narrative(self):
        for grade in ("perfect", "strong", "okay", "overcooked", "undercooked"):
            snap = _post_ride_snapshot(grade=grade, language="technical")
            brief = _rule_based_brief(snap)
            review = brief["post_ride_review"]
            assert review["grade"] == grade
            # Each grade must have all three narrative fields populated
            assert len(review["physiological_read"]) > 20
            assert len(review["goal_trajectory"]) > 10
            assert len(review["next_session_nudge"]) > 10

    def test_simple_mode_no_jargon(self):
        """Simple-mode review narratives must not leak FTP/TSS/CTL etc."""
        for grade in ("perfect", "strong", "okay", "overcooked", "undercooked"):
            snap = _post_ride_snapshot(grade=grade, language="simple")
            brief = _rule_based_brief(snap)
            review = brief["post_ride_review"]
            combined = " ".join([
                review["headline"],
                review["physiological_read"],
                review["goal_trajectory"],
                review["next_session_nudge"],
            ])
            for term in _TECHNICAL_JARGON:
                assert term not in combined, (
                    f"Simple mode [{grade}] leaked jargon '{term}': {combined!r}"
                )

    def test_technical_mode_cites_framework(self):
        """At least one narrative field must cite a sports-science framework by name."""
        snap = _post_ride_snapshot(grade="perfect", language="technical", ef=1.52)
        brief = _rule_based_brief(snap)
        review = brief["post_ride_review"]
        combined = " ".join([
            review["headline"],
            review["physiological_read"],
            review["goal_trajectory"],
            review["next_session_nudge"],
        ])
        framework_found = any(
            fw in combined
            for fw in ("Coggan", "San Millán", "Banister", "Mujika", "Seiler", "Friel")
        )
        assert framework_found, f"Technical mode missing framework citation: {combined!r}"

    def test_overcooked_mentions_recovery(self):
        snap = _post_ride_snapshot(
            grade="overcooked", language="simple",
            actual_duration=60, actual_tss=70,  # +56% TSS
            target_duration=60, target_tss=45,
        )
        brief = _rule_based_brief(snap)
        review = brief["post_ride_review"]
        nudge = review["next_session_nudge"].lower()
        assert "recover" in nudge or "easy" in nudge or "rest" in nudge

    def test_compliance_numbers_preserved_in_review(self):
        snap = _post_ride_snapshot(
            grade="strong",
            actual_duration=68, actual_tss=72, target_duration=60, target_tss=65,
        )
        brief = _rule_based_brief(snap)
        review = brief["post_ride_review"]
        assert review["duration"]["actual"] == 68
        assert review["duration"]["target"] == 60
        assert review["tss"]["actual"] == 72
        assert review["tss"]["target"] == 65
        assert review["ef"] == 1.52
        assert review["variability_index"] == 1.04


class TestPostRideReviewLLMPath:
    """The LLM path (resolve_and_prescribe) must also emit a complete review
    when snapshot.post_ride is present — LLM narratives merge over the
    deterministic fallback.
    """

    def test_llm_review_merges_over_fallback(self):
        snap = _post_ride_snapshot(grade="perfect", language="technical")
        llm_payload = {
            "verdict": "Perfect",
            "rationale": "r",
            "prescribed_workout": {
                "template_id": "rest_day", "title": "Rest", "duration_minutes": 0,
                "predicted_tss": 0, "framework_cited": "",
                "blocks": [], "why_this_workout": "rest",
            },
            "alternates": [
                {"label": "less_time", "one_liner": "30 min spin", "template_id": "recovery_30"},
                {"label": "recover", "one_liner": "Rest", "template_id": "rest_day"},
            ],
            "outlook_7d": [{"day_offset": i, "suggested_tss": 40, "note": "x"} for i in range(7)],
            "frameworks_cited": ["Coggan"],
            "post_ride_review": {
                "headline": "LLM wrote this headline",
                "physiological_read": "LLM wrote this physiological read with Coggan reference.",
                "goal_trajectory": "LLM wrote this trajectory narrative per Banister.",
                "next_session_nudge": "LLM wrote this nudge.",
            },
        }
        resolved = resolve_and_prescribe(snap, llm_payload)
        review = resolved["post_ride_review"]
        assert review["headline"] == "LLM wrote this headline"
        assert "LLM wrote" in review["physiological_read"]
        # Compliance numbers come from deterministic scorer, not LLM
        assert review["duration"]["actual"] == 62.0
        assert review["tss"]["actual"] == 47.0

    def test_llm_no_review_uses_fallback(self):
        """When LLM forgets post_ride_review, the deterministic builder fills in."""
        snap = _post_ride_snapshot(grade="overcooked", language="simple")
        llm_payload = {
            "verdict": "", "rationale": "",
            "prescribed_workout": {
                "template_id": "rest_day", "title": "Rest", "duration_minutes": 0,
                "predicted_tss": 0, "framework_cited": "",
                "blocks": [], "why_this_workout": "",
            },
            "alternates": [], "outlook_7d": [], "frameworks_cited": [],
            # no post_ride_review
        }
        resolved = resolve_and_prescribe(snap, llm_payload)
        assert resolved["post_ride_review"] is not None
        review = resolved["post_ride_review"]
        assert review["grade"] == "overcooked"
        assert review["headline"]

    def test_prescribed_workout_forced_rest_day_when_post_ride(self):
        """Even if LLM insists on VO2, post_ride presence forces rest_day."""
        snap = _post_ride_snapshot(grade="perfect", language="technical")
        llm_payload = {
            "verdict": "", "rationale": "",
            "prescribed_workout": {
                "template_id": "vo2_5x4", "title": "VO2", "duration_minutes": 60,
                "predicted_tss": 70, "framework_cited": "",
                "blocks": [], "why_this_workout": "",
            },
            "alternates": [], "outlook_7d": [], "frameworks_cited": [],
        }
        resolved = resolve_and_prescribe(snap, llm_payload)
        assert resolved["prescribed_workout"]["template_id"] == "rest_day"

    def test_no_review_when_post_ride_absent(self):
        snap = _sample_snapshot()  # no post_ride
        llm_payload = {
            "verdict": "", "rationale": "",
            "prescribed_workout": {
                "template_id": "vo2_5x4", "title": "VO2", "duration_minutes": 60,
                "predicted_tss": 70, "framework_cited": "",
                "blocks": [], "why_this_workout": "",
            },
            "alternates": [], "outlook_7d": [], "frameworks_cited": [],
        }
        resolved = resolve_and_prescribe(snap, llm_payload)
        assert resolved.get("post_ride_review") is None


# ---------------------------------------------------------------------------
# Step 3 — _todays_activities multi-activity wrap-up
# ---------------------------------------------------------------------------

class _MockResult:
    """Mimics what AsyncSession.execute() returns for both
    `select(Activity)` (rows) and `select(AthleteProfile)` (single row).
    """
    def __init__(self, payload):
        self._payload = payload

    def scalar_one_or_none(self):
        # Single AthleteProfile row
        return self._payload if not isinstance(self._payload, list) else None

    def scalars(self):
        # Activity list path
        rows = self._payload if isinstance(self._payload, list) else []

        class _Scalars:
            def __init__(self, items): self._items = items
            def all(self): return list(self._items)

        return _Scalars(rows)


class _ActivitiesMockDB:
    """Mock AsyncSession returning a fixed list of activities for the first
    execute() call, then a fixed AthleteProfile for the second.
    """
    def __init__(self, activities, profile):
        self._calls = 0
        self._activities = activities
        self._profile = profile

    async def execute(self, stmt):
        self._calls += 1
        # First call inside _todays_activities is the activity range query;
        # second is the AthleteProfile lookup. Order is deterministic in
        # the implementation.
        if self._calls == 1:
            return _MockResult(self._activities)
        return _MockResult(self._profile)


def _make_activity(*, started_at, duration_seconds, tss, np=None, avg_p=None,
                   avg_hr=None, distance_meters=None, sport="cycling",
                   title="Ride"):
    return SimpleNamespace(
        id=id(object()) % 100000,
        user_id=1,
        started_at=started_at,
        duration_seconds=duration_seconds,
        distance_meters=distance_meters,
        tss=tss,
        normalized_power=np,
        average_power=avg_p,
        average_hr=avg_hr,
        sport=sport,
        title=title,
        raw_data=None,
    )


@pytest.mark.asyncio
class TestTodaysActivities:
    async def test_two_activities_sum_correctly(self):
        from app.services.coach_service import _todays_activities

        # Two rides today — one tempo (steady NP/avg_p ratio), one Z2 commute.
        # Note: started_at must fall inside the athlete-local window. We pick
        # current UTC time so the window unconditionally includes them.
        now = datetime.now(timezone.utc)
        a1 = _make_activity(
            started_at=now - timedelta(hours=4),
            duration_seconds=3600,           # 60 min
            tss=80.0,
            np=240.0, avg_p=235.0, avg_hr=148,
            distance_meters=28000.0,
            title="Tempo intervals",
        )
        a2 = _make_activity(
            started_at=now - timedelta(hours=1),
            duration_seconds=2700,           # 45 min
            tss=35.0,
            np=160.0, avg_p=155.0, avg_hr=128,
            distance_meters=18000.0,
            title="Easy spin",
        )
        profile = SimpleNamespace(ftp_watts=280)
        db = _ActivitiesMockDB([a1, a2], profile)

        bundle = await _todays_activities(db, user_id=1)

        # Totals
        assert bundle["totals"]["count"] == 2
        assert bundle["totals"]["tss"] == pytest.approx(115.0)
        assert bundle["totals"]["duration_minutes"] == 105
        assert bundle["totals"]["distance_km"] == pytest.approx(46.0)

        # Per-activity shape
        assert len(bundle["activities"]) == 2
        first = bundle["activities"][0]
        assert first["title"] == "Tempo intervals"
        assert first["sport"] == "cycling"
        assert first["tss"] == pytest.approx(80.0)
        assert first["duration_minutes"] == 60
        assert first["distance_km"] == pytest.approx(28.0)
        # IF = 240 / 280 = 0.857
        assert first["intensity_factor"] == pytest.approx(0.857, abs=0.01)
        # EF = 240 / 148 = 1.622
        assert first["efficiency_factor"] == pytest.approx(1.622, abs=0.01)
        # VI = 240 / 235 = 1.021
        assert first["variability_index"] == pytest.approx(1.021, abs=0.01)

    async def test_single_activity_still_works(self):
        from app.services.coach_service import _todays_activities

        now = datetime.now(timezone.utc)
        a = _make_activity(
            started_at=now - timedelta(hours=2),
            duration_seconds=1800,           # 30 min
            tss=22.0,
            np=180.0, avg_p=175.0, avg_hr=140,
            distance_meters=12000.0,
            title="Recovery spin",
        )
        profile = SimpleNamespace(ftp_watts=260)
        db = _ActivitiesMockDB([a], profile)

        bundle = await _todays_activities(db, user_id=1)

        assert bundle["totals"]["count"] == 1
        assert bundle["totals"]["tss"] == pytest.approx(22.0)
        assert bundle["totals"]["duration_minutes"] == 30
        assert len(bundle["activities"]) == 1
        only = bundle["activities"][0]
        assert only["title"] == "Recovery spin"
        # IF = 180 / 260 ≈ 0.692
        assert only["intensity_factor"] == pytest.approx(0.692, abs=0.01)

    async def test_rolling_7d_tss_spans_week_boundary(self):
        """`_weekly_progress` must expose a rolling trailing-7-day TSS so the
        brief/LLM still 'sees' the prior week's rides after Monday resets the
        calendar-week counters. A ride 5 days ago belongs to the rolling window
        regardless of which calendar week it fell in; a ride 10 days ago does
        not."""
        from app.services.coach_service import _weekly_progress

        now = datetime.now(timezone.utc)
        yesterday = _make_activity(
            started_at=now - timedelta(days=1),
            duration_seconds=4 * 3600,        # 4h ride
            tss=250.0, title="Long endurance",
        )
        five_days = _make_activity(
            started_at=now - timedelta(days=5),
            duration_seconds=3600,
            tss=100.0, title="Midweek tempo",
        )
        ten_days = _make_activity(
            started_at=now - timedelta(days=10),
            duration_seconds=3600,
            tss=500.0, title="Last week (out of window)",
        )
        db = _ActivitiesMockDB([yesterday, five_days, ten_days], profile=None)

        prog = await _weekly_progress(db, user_id=1)

        # Rolling 7d sums yesterday (250) + 5-days-ago (100), excludes 10-days-ago.
        assert prog["rolling_7d_tss"] == pytest.approx(350.0)

    async def test_missing_metrics_return_none_not_crash(self):
        """HR-only ride (no NP, no avg_p) must not crash — IF/EF/VI = None."""
        from app.services.coach_service import _todays_activities

        now = datetime.now(timezone.utc)
        a = _make_activity(
            started_at=now - timedelta(hours=1),
            duration_seconds=1800,
            tss=20.0,
            np=None, avg_p=None, avg_hr=140,
            distance_meters=None,
            title="HR-only ride",
        )
        profile = SimpleNamespace(ftp_watts=None)
        db = _ActivitiesMockDB([a], profile)

        bundle = await _todays_activities(db, user_id=1)

        only = bundle["activities"][0]
        assert only["intensity_factor"] is None
        assert only["efficiency_factor"] is None
        assert only["variability_index"] is None
        assert only["distance_km"] is None


@pytest.mark.asyncio
class TestRecommendationPinning:
    """Once a real (non-rest) plan is written for today, a post-ride
    regeneration that prescribes rest_day must NOT clobber it — otherwise the
    post-ride review grades the completed ride against a rest target."""

    async def _run(self, existing_template_id, new_template_id):
        from app.models.coach_brief import CoachBrief
        from app.models.coach_recommendation import CoachRecommendation
        from app.services.coach_service import (
            _today_local,
            _upsert_recommendation_for_today,
        )

        existing = CoachRecommendation(
            user_id=5,
            target_date=_today_local(),
            template_id=existing_template_id,
            title="90-min Endurance",
            duration_minutes=90,
            predicted_tss=110,
            framework_cited="Coggan Z2",
            blocks=[{"zone": 2}],
            why_this_workout="base ride",
            source_brief_id=1,
        )
        existing.evaluated_at = "set"
        existing.eval_grade = "A"

        brief = CoachBrief(id=2, user_id=5)
        brief.prescribed_workout = {
            "template_id": new_template_id,
            "title": "Rest day" if new_template_id == "rest_day" else "Tempo",
            "duration_minutes": 0 if new_template_id == "rest_day" else 60,
            "predicted_tss": 0 if new_template_id == "rest_day" else 70,
            "blocks": [],
        }

        db = MagicMock()
        exec_result = MagicMock()
        exec_result.scalar_one_or_none = MagicMock(return_value=existing)
        db.execute = AsyncMock(return_value=exec_result)
        db.commit = AsyncMock()
        db.add = MagicMock()

        await _upsert_recommendation_for_today(db, 5, brief, "simple")
        return existing, db

    async def test_rest_day_does_not_clobber_pinned_ride(self):
        existing, db = await self._run("z2_endurance_90", "rest_day")
        # pinned plan preserved as the compliance target
        assert existing.template_id == "z2_endurance_90"
        assert existing.duration_minutes == 90
        assert existing.predicted_tss == 110
        # eval left intact, latest brief linked
        assert existing.eval_grade == "A"
        assert existing.source_brief_id == 2
        db.add.assert_not_called()

    async def test_non_rest_update_still_replaces(self):
        # A legitimate non-rest replan before riding still updates the row.
        existing, db = await self._run("z2_endurance_90", "tempo_2x20")
        assert existing.template_id == "tempo_2x20"
        assert existing.eval_grade is None  # reset for re-grading


# ---------------------------------------------------------------------------
# Day-freshness cache gate (usability audit P0-2) — a brief generated
# YESTERDAY must never serve today, even inside the TTL window.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestBriefDayFreshnessGate:
    async def test_yesterdays_brief_is_rejected_even_within_ttl(self, monkeypatch):
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        # Huge TTL so ONLY the day gate can reject the cached row.
        monkeypatch.setattr("app.services.coach_service.settings.COACH_BRIEF_CACHE_HOURS", 48)

        stale = SimpleNamespace(
            id=7,
            user_id=1,
            # 26h ago — inside the 48h TTL but before the athlete-local start
            # of today in every timezone (a local day is at most 25h).
            generated_at=datetime.now(timezone.utc) - timedelta(hours=26),
            verdict="stale — 58 min heute geschafft",
            rationale="",
            evidence={},
            options=None,
            prescribed_workout={"template_id": "z2_endurance_60"},
            alternates=[],
            outlook_7d=[],
            frameworks_cited=[],
            raw_prompt="",
            model_used="claude",
        )
        db = _MockDB(initial_cache=[stale])

        monkeypatch.setattr(
            "app.services.coach_service.build_snapshot",
            AsyncMock(return_value=_sample_snapshot()),
        )

        result = await get_or_generate_brief(db, user_id=1, force=False)
        assert result is not stale
        assert db.add_count == 1  # regenerated

    async def test_todays_brief_still_served(self, monkeypatch):
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        monkeypatch.setattr("app.services.coach_service.settings.COACH_BRIEF_CACHE_HOURS", 48)

        fresh = SimpleNamespace(
            id=8, user_id=1,
            generated_at=datetime.now(timezone.utc),
            verdict="fresh", rationale="", evidence={},
            options=None, prescribed_workout={"template_id": "z2_endurance_60"},
            alternates=[], outlook_7d=[], frameworks_cited=[],
            raw_prompt="", model_used="claude",
        )
        db = _MockDB(initial_cache=[fresh])
        build_mock = AsyncMock(return_value=_sample_snapshot())
        monkeypatch.setattr("app.services.coach_service.build_snapshot", build_mock)

        result = await get_or_generate_brief(db, user_id=1, force=False)
        assert result is fresh
        build_mock.assert_not_awaited()


# ---------------------------------------------------------------------------
# Nudge copy (usability audit P0-2) — the machine-German scold is gone.
# ---------------------------------------------------------------------------


class TestNudgeCopy:
    def test_machine_german_nudge_deleted_everywhere(self):
        import inspect

        src = inspect.getsource(coach_service)
        assert "Nächstes Mal ziel auf eine engere Übereinstimmung" not in src
        assert "Next time aim for a closer match" not in src

    def test_okay_nudge_is_the_soft_shortfall_copy(self):
        assert (
            coach_service._simple_nudge("okay", "endurance", "base2", de=True)
            == "Kürzer als geplant — völlig okay. Die Woche fängt das auf."
        )
        assert (
            coach_service._simple_nudge("okay", "endurance", "base2", de=False)
            == "Shorter than planned — fine. The week absorbs it."
        )

    def test_technical_okay_nudge_softened(self):
        de = coach_service._technical_nudge("okay", "endurance", "base2", de=True)
        en = coach_service._technical_nudge("okay", "endurance", "base2", de=False)
        assert "einengen" not in de
        assert "tighten" not in en

    def test_ungraded_review_emits_no_nudge(self):
        review = coach_service._build_post_ride_review(
            {
                "compliance": {
                    "grade": None, "graded": False,
                    "duration": {}, "tss": {},
                    "session_type": "endurance", "phase": "base2",
                    "template_id": "z2_endurance_60", "template_title": "Z2",
                },
                "trajectory": {},
                "target_template": {"id": "z2_endurance_60", "title": "Z2"},
            },
            "simple",
            de=True,
        )
        assert review["next_session_nudge"] == ""
        assert review["grade"] is None


# ---------------------------------------------------------------------------
# Sport-aware already-trained override (usability audit P0-2)
# ---------------------------------------------------------------------------


class TestSportAwareAlreadyTrained:
    def _snap_with_progress(self, *, ride_min=0.0, ride_tss=0.0, other_min=0.0,
                            other_sport=None, locale=None):
        snap = _sample_snapshot()
        snap["weekly_progress"] = {
            **snap["weekly_progress"],
            "today_tss": ride_tss + (25.0 if other_min else 0.0),
            "today_duration_minutes": ride_min + other_min,
            "today_max_tss_per_hour": 50.0,
            "today_ride_minutes": ride_min,
            "today_ride_tss": ride_tss,
            "today_other_minutes": other_min,
            "today_other_sport": other_sport,
        }
        if locale:
            snap["ui_locale"] = locale
        return snap

    def test_gym_session_keeps_bike_plan(self):
        snap = self._snap_with_progress(other_min=58.0, other_sport="strength", locale="de")
        brief = _rule_based_brief(snap)
        # The bike plan survives — NOT forced to rest_day.
        assert brief["prescribed_workout"]["template_id"] != "rest_day"
        # …and the strength work is acknowledged with the correct label.
        assert "Krafttraining" in brief["rationale"]
        assert "Ausfahrt eingebaut" not in brief["rationale"]

    def test_gym_session_english_label(self):
        snap = self._snap_with_progress(other_min=58.0, other_sport="strength")
        brief = _rule_based_brief(snap)
        assert brief["prescribed_workout"]["template_id"] != "rest_day"
        assert "strength session" in brief["rationale"]

    def test_ride_still_forces_rest_day(self):
        snap = self._snap_with_progress(ride_min=64.0, ride_tss=52.0)
        brief = _rule_based_brief(snap)
        assert brief["prescribed_workout"]["template_id"] == "rest_day"
        assert "64 min" in brief["verdict"]

    def test_ride_hero_uses_ride_minutes_not_total(self):
        # 64-min ride + 58-min gym: the hero says 64, never 122.
        snap = self._snap_with_progress(
            ride_min=64.0, ride_tss=52.0, other_min=58.0, other_sport="strength",
        )
        brief = _rule_based_brief(snap)
        assert "64 min" in brief["verdict"]
        assert "122" not in brief["verdict"]
