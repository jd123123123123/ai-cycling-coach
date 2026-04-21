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

    def test_six_tools_registered(self):
        """5 read-only (Phase 6-01) + 1 write (modify_planned_workout, 6-02)."""
        assert len(TOOL_SCHEMAS) == 6
        expected = {
            "fetch_pmc_window",
            "fetch_recovery_trend",
            "fetch_recent_activities",
            "fetch_ftp_history",
            "fetch_planned_workout",
            "modify_planned_workout",
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


# ---------------------------------------------------------------------------
# modify_planned_workout — write tool (Phase 6.2)
# ---------------------------------------------------------------------------
#
# These tests exercise the DB-touching handler. They use a stubbed
# AsyncSession that routes queries to pre-configured results, so nothing
# hits a real database. What we verify:
#   - Not found: graceful {success: False, found: False} response
#   - Already-trained-today guard: no mutation, no audit row
#   - Missing FTP: graceful failure
#   - Happy path: PW mutated, CoachBrief audit row created with correct shape
#   - Rails downgrade surfaces rails_downgraded + reason to the tool_result
#   - User-scoping: user B cannot modify user A's PW (separate DB mocks)


def _mock_modify_db(
    *,
    planned_workout=None,
    has_today_activity: bool = False,
    athlete_profile=None,
    latest_brief=None,
):
    """Build an AsyncSession mock wired for the modify_planned_workout handler.

    Returns (db, captured) where ``captured`` is a list that receives every
    object passed to ``db.add`` — the audit CoachBrief row ends up here for
    inspection.
    """
    captured: list = []

    call_order: list[str] = []

    async def _execute_side(stmt, *args, **kwargs):
        # Inspect the SQL text to figure out which query we're serving.
        # Not glamorous, but keeps this a pure unit test without a DB.
        stmt_str = str(stmt)
        out = MagicMock()
        if "planned_workouts" in stmt_str.lower() and "activities" not in stmt_str.lower():
            call_order.append("planned_workouts")
            out.scalar_one_or_none = MagicMock(return_value=planned_workout)
        elif "activities" in stmt_str.lower():
            call_order.append("activities")
            out.scalar_one_or_none = MagicMock(
                return_value=1 if has_today_activity else None,
            )
        elif "athlete_profiles" in stmt_str.lower():
            call_order.append("athlete_profiles")
            out.scalar_one_or_none = MagicMock(return_value=athlete_profile)
        elif "coach_briefs" in stmt_str.lower():
            call_order.append("coach_briefs")
            out.scalar_one_or_none = MagicMock(return_value=latest_brief)
        else:
            out.scalar_one_or_none = MagicMock(return_value=None)
        return out

    db = MagicMock()
    db.execute = AsyncMock(side_effect=_execute_side)
    db.add = MagicMock(side_effect=lambda obj: captured.append(obj))
    db.commit = AsyncMock()
    db._call_order = call_order  # for debugging
    return db, captured


def _make_planned_workout(user_id=1, template_id="z2_endurance_60", duration_min=60):
    from datetime import date as _date
    return SimpleNamespace(
        id=42,
        user_id=user_id,
        date=_date(2026, 5, 1),  # future date — skips already-trained guard
        sport="cycling",
        title="Z2 endurance — 60min",
        duration_seconds_target=duration_min * 60,
        description=None,
        interval_structure=None,
        indoor=False,
        blocks_source="ai_prescribed",
        template_id=template_id,
    )


def _make_profile(ftp=250, injury=False):
    return SimpleNamespace(
        user_id=1,
        ftp_watts=ftp,
        injury_flag=injury,
    )


@pytest.mark.asyncio
class TestModifyPlannedWorkout:
    async def test_not_found_returns_graceful_failure(self):
        db, captured = _mock_modify_db(planned_workout=None)
        result = await dispatch_tool(
            "modify_planned_workout",
            {"date": "2026-05-01", "modification_type": "harder"},
            user_id=1, db=db,
        )
        assert result["success"] is False
        assert result.get("found") is False
        # No audit row when PW doesn't exist
        assert captured == []
        db.commit.assert_not_called()

    async def test_missing_ftp_returns_graceful_failure(self):
        pw = _make_planned_workout()
        profile = _make_profile(ftp=None)
        db, captured = _mock_modify_db(planned_workout=pw, athlete_profile=profile)
        result = await dispatch_tool(
            "modify_planned_workout",
            {"date": "2026-05-01", "modification_type": "harder"},
            user_id=1, db=db,
        )
        assert result["success"] is False
        assert "ftp" in result["reason"].lower()
        # No audit row when we can't materialise watts
        assert captured == []

    async def test_happy_path_persists_and_audits(self):
        pw = _make_planned_workout(template_id="z2_endurance_60", duration_min=60)
        profile = _make_profile(ftp=250)
        db, captured = _mock_modify_db(
            planned_workout=pw, athlete_profile=profile,
        )
        result = await dispatch_tool(
            "modify_planned_workout",
            {"date": "2026-05-01", "modification_type": "harder"},
            user_id=1, db=db,
        )
        assert result["success"] is True
        assert result["rails_downgraded"] is False
        # PW was mutated
        assert pw.blocks_source == "user_modified"
        assert pw.template_id != "z2_endurance_60"  # cascade step up
        # Audit row was added + committed
        assert len(captured) == 1
        audit = captured[0]
        assert audit.verdict == "modification"
        assert audit.evidence["modification"]["modification_type"] == "harder"
        assert audit.evidence["modification"]["before"]["template_id"] == "z2_endurance_60"
        assert "after" in audit.evidence["modification"]
        db.commit.assert_called_once()

    async def test_injury_flag_downgrades_and_audit_records_downgrade(self):
        pw = _make_planned_workout(template_id="vo2_5x4", duration_min=75)
        profile = _make_profile(ftp=250, injury=True)
        db, captured = _mock_modify_db(
            planned_workout=pw, athlete_profile=profile,
        )
        result = await dispatch_tool(
            "modify_planned_workout",
            {"date": "2026-05-01", "modification_type": "harder"},
            user_id=1, db=db,
        )
        assert result["success"] is True
        assert result["rails_downgraded"] is True
        assert "injury" in result["reason"].lower()
        assert result["template_id"] in ("recovery_30", "rest_day")
        # Audit row captures the downgrade
        assert len(captured) == 1
        audit = captured[0]
        assert audit.evidence["modification"]["rails_downgraded"] is True
        assert "injury" in audit.evidence["modification"]["reason"].lower()

    async def test_shorten_requires_duration_min(self):
        pw = _make_planned_workout()
        profile = _make_profile(ftp=250)
        db, captured = _mock_modify_db(
            planned_workout=pw, athlete_profile=profile,
        )
        result = await dispatch_tool(
            "modify_planned_workout",
            {"date": "2026-05-01", "modification_type": "shorten"},  # missing duration_min
            user_id=1, db=db,
        )
        # Surfaces as success=False with a clear reason (not an exception)
        assert result["success"] is False
        assert "duration_min" in result["reason"]
        # No audit row on validation failure
        assert captured == []

    async def test_already_trained_today_rejects_without_mutation(self):
        """Target today + activity on today → {success: False} + no audit row."""
        from datetime import datetime, timezone
        from datetime import date as _date
        today = datetime.now(timezone.utc).date()
        pw = _make_planned_workout()
        pw.date = today
        pw.template_id = "z2_endurance_60"
        profile = _make_profile(ftp=250)
        db, captured = _mock_modify_db(
            planned_workout=pw, athlete_profile=profile,
            has_today_activity=True,
        )
        result = await dispatch_tool(
            "modify_planned_workout",
            {"date": today.isoformat(), "modification_type": "harder"},
            user_id=1, db=db,
        )
        assert result["success"] is False
        assert "already trained" in result["reason"].lower()
        # Critical: PW was NOT mutated
        assert pw.blocks_source == "ai_prescribed"
        assert pw.template_id == "z2_endurance_60"
        # Critical: NO audit row written
        assert captured == []
        db.commit.assert_not_called()

    async def test_user_scoping_blocks_cross_user_access(self):
        """The handler queries PlannedWorkout WHERE user_id = authenticated_user.
        Without a PW owned by user_id=999, the result is found=False.
        """
        # DB returns None because user 999 has no PW (our mock scalars to None)
        db, captured = _mock_modify_db(planned_workout=None)
        # Spoofed user_id in tool_input is stripped by dispatcher — only
        # authenticated user_id=999 reaches the handler
        result = await dispatch_tool(
            "modify_planned_workout",
            {
                "date": "2026-05-01",
                "modification_type": "harder",
                "user_id": 1,  # LLM tries to spoof — must be stripped
            },
            user_id=999, db=db,
        )
        assert result["success"] is False
        assert captured == []

    async def test_unknown_modification_type_raises_via_dispatcher(self):
        """dispatch_tool sends the input to the handler; the handler
        delegates to apply_modification which raises ValueError."""
        pw = _make_planned_workout()
        profile = _make_profile(ftp=250)
        db, captured = _mock_modify_db(
            planned_workout=pw, athlete_profile=profile,
        )
        result = await dispatch_tool(
            "modify_planned_workout",
            {"date": "2026-05-01", "modification_type": "explode"},
            user_id=1, db=db,
        )
        # Explicit success=False — not an exception bubbling up. This keeps
        # the tool-use loop healthy: Claude can self-correct on the next turn.
        assert result["success"] is False
        assert "explode" in result["reason"]

    async def test_indoor_only_flips_flag(self):
        pw = _make_planned_workout(template_id="sweet_spot_2x20", duration_min=90)
        pw.indoor = False
        profile = _make_profile(ftp=250)
        db, captured = _mock_modify_db(
            planned_workout=pw, athlete_profile=profile,
        )
        result = await dispatch_tool(
            "modify_planned_workout",
            {"date": "2026-05-01", "modification_type": "indoor"},
            user_id=1, db=db,
        )
        assert result["success"] is True
        assert result["indoor"] is True
        assert result["template_id"] == "sweet_spot_2x20"  # unchanged
        assert pw.indoor is True

    async def test_audit_row_contains_full_provenance(self):
        pw = _make_planned_workout(template_id="z2_endurance_60", duration_min=60)
        profile = _make_profile(ftp=250)
        db, captured = _mock_modify_db(
            planned_workout=pw, athlete_profile=profile,
        )
        await dispatch_tool(
            "modify_planned_workout",
            {
                "date": "2026-05-01",
                "modification_type": "shorten",
                "params": {"duration_min": 45},
            },
            user_id=1, db=db,
        )
        assert len(captured) == 1
        mod = captured[0].evidence["modification"]
        # Every field the audit contract promises
        assert mod["date"] == "2026-05-01"
        assert mod["modification_type"] == "shorten"
        assert mod["params"] == {"duration_min": 45}
        assert mod["before"]["template_id"] == "z2_endurance_60"
        assert mod["before"]["duration_min"] == 60
        assert "template_id" in mod["after"]
        assert "duration_min" in mod["after"]
        assert "indoor" in mod["after"]
        assert "rails_downgraded" in mod
        assert "reason" in mod
