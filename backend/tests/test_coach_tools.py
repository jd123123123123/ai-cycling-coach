"""Tests for coach_tools — the tool registry + async dispatcher the Claude
tool-use loop calls from /coach/chat.

Guarantees:
    - TOOL_SCHEMAS is Anthropic-spec shaped (name, description, input_schema with
      type=object, properties, required)
    - TOOL_REGISTRY keys match TOOL_SCHEMAS names exactly
    - dispatch_tool is user-scoped (never trusts user_id from tool_input)
    - Clamps: recovery_days ∈ [1,90], activity_limit ∈ [1,50]
    - Input validation: invalid dates / missing params raise ValueError with a
      clear message
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.coach_tools import (
    TOOL_REGISTRY,
    TOOL_SCHEMAS,
    dispatch_tool,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_db() -> MagicMock:
    db = MagicMock()
    scalars = MagicMock()
    scalars.all = MagicMock(return_value=[])
    exec_result = MagicMock()
    exec_result.scalars = MagicMock(return_value=scalars)
    exec_result.scalar_one_or_none = MagicMock(return_value=None)
    db.execute = AsyncMock(return_value=exec_result)
    return db


def _mock_db_with_planned_workout(pw) -> MagicMock:
    db = MagicMock()
    exec_result = MagicMock()
    exec_result.scalar_one_or_none = MagicMock(return_value=pw)
    db.execute = AsyncMock(return_value=exec_result)
    return db


# ---------------------------------------------------------------------------
# Schema correctness
# ---------------------------------------------------------------------------

class TestToolSchemas:
    def test_schemas_are_json_serialisable(self):
        """Anthropic sends schemas over the wire — they must be JSON-safe."""
        for schema in TOOL_SCHEMAS:
            json.dumps(schema)  # must not raise

    def test_each_schema_has_required_top_level_keys(self):
        for schema in TOOL_SCHEMAS:
            assert "name" in schema
            assert "description" in schema
            assert "input_schema" in schema
            assert len(schema["description"]) >= 20, (
                "Tool descriptions must be detailed — Claude picks tools from them"
            )

    def test_input_schemas_are_object_type(self):
        for schema in TOOL_SCHEMAS:
            isch = schema["input_schema"]
            assert isch["type"] == "object"
            assert "properties" in isch
            # required must be a list (possibly empty)
            assert isinstance(isch.get("required", []), list)

    def test_registry_names_match_schemas(self):
        """Every schema name must map to a handler in TOOL_REGISTRY and vice versa."""
        schema_names = {s["name"] for s in TOOL_SCHEMAS}
        registry_names = set(TOOL_REGISTRY.keys())
        assert schema_names == registry_names

    def test_five_tools_registered(self):
        assert len(TOOL_SCHEMAS) == 5
        expected = {
            "fetch_pmc_window",
            "fetch_recovery_trend",
            "fetch_recent_activities",
            "fetch_ftp_history",
            "fetch_planned_workout",
        }
        assert {s["name"] for s in TOOL_SCHEMAS} == expected


# ---------------------------------------------------------------------------
# dispatch_tool — routing + errors
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestDispatcherRouting:
    async def test_unknown_tool_raises_with_available_names(self):
        db = _mock_db()
        with pytest.raises(ValueError) as exc:
            await dispatch_tool("not_a_real_tool", {}, user_id=1, db=db)
        msg = str(exc.value)
        assert "not_a_real_tool" in msg
        # Should list the real tools so Claude can self-correct
        assert "fetch_pmc_window" in msg

    async def test_returns_json_serialisable_dict(self):
        """Every tool's output must be a dict that json.dumps can handle."""
        db = _mock_db()
        with patch(
            "app.services.coach_tools.ftp_progression_summary",
            new=AsyncMock(return_value={"entries": [], "current": None,
                                         "delta_30d_pct": None, "delta_90d_pct": None,
                                         "trend": "stable"}),
        ):
            result = await dispatch_tool("fetch_ftp_history", {}, user_id=1, db=db)
            assert isinstance(result, dict)
            json.dumps(result)  # must not raise


@pytest.mark.asyncio
class TestDispatcherUserScoping:
    async def test_tool_input_user_id_is_ignored(self):
        """Security: LLM cannot spoof user identity via tool_input.user_id."""
        db = _mock_db()
        with patch(
            "app.services.coach_tools.ftp_progression_summary",
            new=AsyncMock(return_value={"entries": [], "current": None,
                                         "delta_30d_pct": None, "delta_90d_pct": None,
                                         "trend": "stable"}),
        ) as mock_call:
            # LLM tries to spoof user_id=999 — dispatcher must pass user_id=1
            await dispatch_tool(
                "fetch_ftp_history",
                {"user_id": 999, "uid": 999, "owner_id": 999},
                user_id=1,
                db=db,
            )
        _, kwargs = mock_call.call_args
        # Whichever way we wire it, the aggregator must be called with
        # the authenticated user_id (1), never 999.
        if "user_id" in kwargs:
            assert kwargs["user_id"] == 1
        else:
            # Positional fallback
            args, _ = mock_call.call_args
            assert 1 in args
            assert 999 not in args

    async def test_two_users_see_different_data(self):
        """Calling the same tool for two users yields independent invocations
        (user_id is honoured, not cached across calls)."""
        db = _mock_db()
        seen_user_ids: list[int] = []

        async def _fake_ftp(user_id, db):
            seen_user_ids.append(user_id)
            return {"entries": [], "current": None,
                    "delta_30d_pct": None, "delta_90d_pct": None,
                    "trend": "stable"}

        with patch(
            "app.services.coach_tools.ftp_progression_summary",
            side_effect=_fake_ftp,
        ):
            await dispatch_tool("fetch_ftp_history", {}, user_id=1, db=db)
            await dispatch_tool("fetch_ftp_history", {}, user_id=2, db=db)
        assert seen_user_ids == [1, 2]


# ---------------------------------------------------------------------------
# Per-tool handlers
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestFetchPmcWindow:
    async def test_valid_dates_call_aggregator(self):
        db = _mock_db()
        with patch(
            "app.services.coach_tools.pmc_window_summary",
            new=AsyncMock(return_value={"ok": True}),
        ) as mock_agg:
            result = await dispatch_tool(
                "fetch_pmc_window",
                {"start_date": "2026-04-01", "end_date": "2026-04-21"},
                user_id=1, db=db,
            )
        assert result == {"ok": True}
        _, kwargs = mock_agg.call_args
        assert kwargs.get("user_id") == 1
        assert kwargs.get("start_date") == date(2026, 4, 1)
        assert kwargs.get("end_date") == date(2026, 4, 21)

    async def test_invalid_start_date_raises(self):
        db = _mock_db()
        with pytest.raises(ValueError) as exc:
            await dispatch_tool(
                "fetch_pmc_window",
                {"start_date": "not-a-date", "end_date": "2026-04-21"},
                user_id=1, db=db,
            )
        assert "start_date" in str(exc.value).lower()

    async def test_missing_required_param_raises(self):
        db = _mock_db()
        with pytest.raises(ValueError):
            await dispatch_tool(
                "fetch_pmc_window",
                {"start_date": "2026-04-01"},  # missing end_date
                user_id=1, db=db,
            )

    async def test_end_before_start_raises(self):
        db = _mock_db()
        with pytest.raises(ValueError) as exc:
            await dispatch_tool(
                "fetch_pmc_window",
                {"start_date": "2026-04-21", "end_date": "2026-04-01"},
                user_id=1, db=db,
            )
        assert "end_date" in str(exc.value).lower() or "before" in str(exc.value).lower()


@pytest.mark.asyncio
class TestFetchRecoveryTrend:
    async def test_days_clamped_low(self):
        """days=0 → clamped to 1."""
        db = _mock_db()
        with patch(
            "app.services.coach_tools.recovery_trend_summary",
            new=AsyncMock(return_value={"days": [], "aggregate": {}, "flags": []}),
        ) as mock_agg:
            await dispatch_tool("fetch_recovery_trend", {"days": 0}, user_id=1, db=db)
        _, kwargs = mock_agg.call_args
        assert kwargs.get("days") == 1

    async def test_days_clamped_high(self):
        """days=500 → clamped to 90."""
        db = _mock_db()
        with patch(
            "app.services.coach_tools.recovery_trend_summary",
            new=AsyncMock(return_value={"days": [], "aggregate": {}, "flags": []}),
        ) as mock_agg:
            await dispatch_tool("fetch_recovery_trend", {"days": 500}, user_id=1, db=db)
        _, kwargs = mock_agg.call_args
        assert kwargs.get("days") == 90

    async def test_default_days_is_14(self):
        """Missing days param defaults to 14 (useful for 'why am I tired?' pattern)."""
        db = _mock_db()
        with patch(
            "app.services.coach_tools.recovery_trend_summary",
            new=AsyncMock(return_value={"days": [], "aggregate": {}, "flags": []}),
        ) as mock_agg:
            await dispatch_tool("fetch_recovery_trend", {}, user_id=1, db=db)
        _, kwargs = mock_agg.call_args
        assert kwargs.get("days") == 14


@pytest.mark.asyncio
class TestFetchRecentActivities:
    async def test_limit_clamped(self):
        db = _mock_db()
        with patch(
            "app.services.coach_tools.activity_summary",
            new=AsyncMock(return_value={"activities": [], "aggregate": {}}),
        ) as mock_agg:
            await dispatch_tool(
                "fetch_recent_activities",
                {"limit": 100, "sport_filter": "cycling"},
                user_id=1, db=db,
            )
        _, kwargs = mock_agg.call_args
        assert kwargs.get("limit") == 50
        assert kwargs.get("sport_filter") == "cycling"

    async def test_default_limit(self):
        db = _mock_db()
        with patch(
            "app.services.coach_tools.activity_summary",
            new=AsyncMock(return_value={"activities": [], "aggregate": {}}),
        ) as mock_agg:
            await dispatch_tool("fetch_recent_activities", {}, user_id=1, db=db)
        _, kwargs = mock_agg.call_args
        assert 1 <= kwargs.get("limit") <= 50
        assert kwargs.get("sport_filter") is None


@pytest.mark.asyncio
class TestFetchPlannedWorkout:
    async def test_not_found_returns_found_false(self):
        db = _mock_db_with_planned_workout(None)
        result = await dispatch_tool(
            "fetch_planned_workout",
            {"date": "2026-04-25"},
            user_id=1, db=db,
        )
        assert result == {"found": False}

    async def test_found_returns_workout_shape(self):
        pw = SimpleNamespace(
            id=42,
            title="VO2 intervals",
            date=date(2026, 4, 25),
            sport="cycling",
            duration_seconds_target=3600,
            description="Warmup then 5x4min",
            interval_structure={"intervals": [{"duration_seconds": 240, "zone": 5}]},
        )
        db = _mock_db_with_planned_workout(pw)
        result = await dispatch_tool(
            "fetch_planned_workout",
            {"date": "2026-04-25"},
            user_id=1, db=db,
        )
        assert result["found"] is True
        assert result["title"] == "VO2 intervals"
        assert result["scheduled_date"] == "2026-04-25"
        assert result["target_duration_seconds"] == 3600
        assert "intervals" in result.get("blocks", {})

    async def test_invalid_date_raises(self):
        db = _mock_db()
        with pytest.raises(ValueError):
            await dispatch_tool(
                "fetch_planned_workout",
                {"date": "garbage"},
                user_id=1, db=db,
            )
