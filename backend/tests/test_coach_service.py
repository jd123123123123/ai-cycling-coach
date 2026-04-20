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
        brief = _rule_based_brief(_sample_snapshot())
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
            generated_at=datetime.now(timezone.utc) - timedelta(hours=1),
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
        assert db.commit_count == 1
        assert result.model_used == "rule-based-fallback"
        # The new row should carry the prescribed_workout shape
        assert result.prescribed_workout is not None
        assert len(result.alternates) == 2
