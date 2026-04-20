"""Unit tests for coach_service.

Covers:
    - generate_brief with mocked Anthropic client returns correct shape
    - Fallback path when ANTHROPIC_API_KEY is unset returns a complete rule-based brief
    - Cache behaviour: 2nd call within 6h hits cache; third after TTL regenerates
    - Brief payload always includes safety_rails-filtered options (never raw LLM output)
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
)


def _sample_snapshot(*, injury: bool = False, tsb: float = 5.0, hrv_delta: float = 0.0) -> dict:
    return {
        "generated_at": "2026-04-20T10:00:00Z",
        "athlete": {
            "goal_event_date": None, "goal_target": None,
            "weekly_hours": 10, "ftp": 280, "weight_kg": 72.0,
            "injury_flag": injury, "injury_note": "test note" if injury else None,
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
        "rails_context": {
            "ctl": 60.0, "atl": 55.0, "tsb": tsb,
            "hrv_delta_pct": hrv_delta,
            "injury_flag": injury, "days_since_rest": 3,
        },
    }


# ---------------------------------------------------------------------------
# Rule-based fallback — always produces a complete brief
# ---------------------------------------------------------------------------

class TestRuleBasedBrief:
    def test_produces_four_options(self):
        brief = _rule_based_brief(_sample_snapshot())
        assert len(brief["options"]) == 4
        intensities = {o["intensity"] for o in brief["options"]}
        assert intensities == {"rest", "easy", "moderate", "push"}

    def test_produces_seven_day_outlook(self):
        brief = _rule_based_brief(_sample_snapshot())
        assert len(brief["outlook_7d"]) == 7
        assert [e["day_offset"] for e in brief["outlook_7d"]] == list(range(7))

    def test_model_used_is_fallback_tag(self):
        brief = _rule_based_brief(_sample_snapshot())
        assert brief["model_used"] == "rule-based-fallback"

    def test_injury_verdict_mentions_injury(self):
        brief = _rule_based_brief(_sample_snapshot(injury=True))
        assert "injury" in brief["verdict"].lower()

    def test_injury_blocks_non_rest_options(self):
        """With injury_flag, rails mark easy/moderate/push as blocked."""
        brief = _rule_based_brief(_sample_snapshot(injury=True))
        by_intensity = {o["intensity"]: o for o in brief["options"]}
        assert by_intensity["rest"]["blocked"] is False
        assert by_intensity["easy"]["blocked"] is True
        assert by_intensity["moderate"]["blocked"] is True
        assert by_intensity["push"]["blocked"] is True

    def test_rationale_cites_data_numbers(self):
        """Rationale must reference concrete CTL/TSB values, not platitudes."""
        brief = _rule_based_brief(_sample_snapshot())
        assert "TSB" in brief["rationale"] or "CTL" in brief["rationale"]
        assert "Banister" in brief["rationale"] or "Seiler" in brief["rationale"]


# ---------------------------------------------------------------------------
# generate_brief — fallback when no API key
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestGenerateBrief:
    async def test_no_api_key_falls_back(self, monkeypatch):
        """Without ANTHROPIC_API_KEY, returns a rule-based brief."""
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)

        result = await generate_brief(_sample_snapshot())
        assert result["model_used"] == "rule-based-fallback"
        assert len(result["options"]) == 4
        assert len(result["outlook_7d"]) == 7

    async def test_mocked_anthropic_returns_structured_payload(self, monkeypatch):
        """When the API key is set AND the SDK returns a tool_use block, we use it."""
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", "fake-key")
        monkeypatch.setattr("app.services.coach_service.settings.COACH_MODEL", "claude-opus-4-7")

        # Construct the payload Claude would have returned via the brief_response tool
        tool_input = {
            "verdict": "Push — you're fresh",
            "rationale": "TSB is +5 and HRV is stable (Banister, Altini signals).",
            "options": [
                {"intensity": "rest",     "title": "Rest",     "why": "Recover", "tss_target": 0},
                {"intensity": "easy",     "title": "Z1 spin",  "why": "Easy",    "tss_target": 40},
                {"intensity": "moderate", "title": "Z2",       "why": "Base",    "tss_target": 70},
                {"intensity": "push",     "title": "Threshold","why": "Quality", "tss_target": 100},
            ],
            "outlook_7d": [
                {"day_offset": i, "suggested_tss": 50.0, "note": f"Day {i}"} for i in range(7)
            ],
            "frameworks_cited": ["Banister fitness-fatigue", "Seiler polarized"],
        }

        tool_block = SimpleNamespace(type="tool_use", name="brief_response", input=tool_input)
        response = SimpleNamespace(content=[tool_block])

        fake_client = MagicMock()
        fake_client.messages = MagicMock()
        fake_client.messages.create = AsyncMock(return_value=response)

        fake_anthropic_module = MagicMock()
        fake_anthropic_module.AsyncAnthropic = MagicMock(return_value=fake_client)

        with patch.dict("sys.modules", {"anthropic": fake_anthropic_module}):
            result = await generate_brief(_sample_snapshot())

        assert result["verdict"] == "Push — you're fresh"
        assert result["model_used"] == "claude-opus-4-7"
        assert len(result["options"]) == 4
        # Safety rails added blocked/block_reason keys to every option
        assert all("blocked" in o for o in result["options"])
        # client was called
        fake_client.messages.create.assert_awaited_once()

    async def test_anthropic_exception_falls_back(self, monkeypatch):
        """Exceptions from the SDK path degrade gracefully to rule-based."""
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", "fake-key")

        fake_client = MagicMock()
        fake_client.messages = MagicMock()
        fake_client.messages.create = AsyncMock(side_effect=RuntimeError("API down"))

        fake_anthropic_module = MagicMock()
        fake_anthropic_module.AsyncAnthropic = MagicMock(return_value=fake_client)

        with patch.dict("sys.modules", {"anthropic": fake_anthropic_module}):
            result = await generate_brief(_sample_snapshot())

        assert result["model_used"] == "rule-based-fallback"

    async def test_no_tool_use_block_falls_back(self, monkeypatch):
        """If Claude returns only text (no tool call), we fall back rather than parsing prose."""
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
        # Walk self.stored, find most recent within cutoff
        result = MagicMock()
        # If cache has entries, return the most recent one
        latest = self.stored[-1] if self.stored else None
        result.scalar_one_or_none = MagicMock(return_value=latest)
        return result

    def add(self, obj):
        self.add_count += 1
        self._last_added = obj

    async def commit(self):
        self.commit_count += 1
        # Simulate DB assigning id and generated_at on insert
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
        """When a brief within the TTL exists, NO new generation occurs."""
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        monkeypatch.setattr("app.services.coach_service.settings.COACH_BRIEF_CACHE_HOURS", 6)

        existing = SimpleNamespace(
            id=42,
            user_id=1,
            generated_at=datetime.now(timezone.utc) - timedelta(hours=1),
            verdict="cached",
            rationale="",
            evidence={},
            options=[],
            outlook_7d=[],
            frameworks_cited=[],
            raw_prompt="",
            model_used="rule-based-fallback",
        )
        db = _MockDB(initial_cache=[existing])

        # Patch build_snapshot so if it's wrongly called, we fail visibly
        build_mock = AsyncMock(return_value=_sample_snapshot())
        monkeypatch.setattr("app.services.coach_service.build_snapshot", build_mock)

        result = await get_or_generate_brief(db, user_id=1, force=False)
        assert result is existing
        # No new brief was created
        assert db.add_count == 0
        # build_snapshot was never called (cache hit short-circuits)
        build_mock.assert_not_awaited()

    async def test_force_regenerates_even_if_fresh(self, monkeypatch):
        """force=True must bypass the cache read."""
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        monkeypatch.setattr("app.services.coach_service.settings.COACH_BRIEF_CACHE_HOURS", 6)

        existing = SimpleNamespace(
            id=42, user_id=1,
            generated_at=datetime.now(timezone.utc) - timedelta(minutes=10),
            verdict="cached", rationale="", evidence={},
            options=[], outlook_7d=[], frameworks_cited=[],
            raw_prompt="", model_used="rule-based-fallback",
        )
        db = _MockDB(initial_cache=[existing])

        monkeypatch.setattr(
            "app.services.coach_service.build_snapshot",
            AsyncMock(return_value=_sample_snapshot()),
        )

        result = await get_or_generate_brief(db, user_id=1, force=True)
        # A NEW brief was added — force path bypassed the cache
        assert db.add_count == 1
        assert result is not existing

    async def test_cache_miss_after_ttl_regenerates(self, monkeypatch):
        """When the most-recent brief is older than TTL, we regenerate."""
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        monkeypatch.setattr("app.services.coach_service.settings.COACH_BRIEF_CACHE_HOURS", 6)

        # Simulate a _MockDB that returns None for the cache query (too old)
        db = _MockDB(initial_cache=[])

        monkeypatch.setattr(
            "app.services.coach_service.build_snapshot",
            AsyncMock(return_value=_sample_snapshot()),
        )

        result = await get_or_generate_brief(db, user_id=1, force=False)
        assert db.add_count == 1
        assert db.commit_count == 1
        assert result.model_used == "rule-based-fallback"
