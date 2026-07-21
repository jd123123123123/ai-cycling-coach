"""Integration tests for multi-turn chat context threading (06-04 Wave 4).

Verifies:
    1. The frontend-provided ``messages=[...]`` array is threaded through
       ``run_tool_use_loop`` verbatim (all roles passed to Anthropic, order
       preserved). The backend is stateless — it trusts the client's history.
    2. A follow-up question ("what should I do about it?") reaches Claude
       with the prior exchange still in context; Claude does NOT need to
       re-call the analytical tool from turn 1.
    3. Tool cards (synthetic role='tool' UI artefacts) are NOT part of the
       wire format. If something sneaks in as role='tool', the backend's
       role-filter in run_tool_use_loop drops it gracefully.
    4. The backend imposes no client-side truncation — if the frontend sends
       15 turns, all 15 are threaded through.
    5. A follow-up that references a prior tool result with a different range
       triggers a NEW tool call (the LLM re-dispatches — prior tool_result
       text is opaque to the LLM beyond its own emitted context).
    6. The undo round-trip: an original modification audit row is findable
       for ``undo_last_modification``, revert_from_audit restores the PW,
       and a compensating audit row is appended. The original row is NEVER
       mutated (append-only contract).

Tests mock the Anthropic client (via ``_SequencedClient``) and a bare
AsyncSession so nothing hits a real database.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import coach_service
from app.services.coach_tools import dispatch_tool


# ---------------------------------------------------------------------------
# Shared helpers — mirror the patterns in test_coach_service_tool_use.py
# ---------------------------------------------------------------------------

def _text_block(text: str):
    return SimpleNamespace(type="text", text=text)


def _tool_use_block(name: str, input_: dict, id_: str = "tu_1"):
    return SimpleNamespace(type="tool_use", name=name, input=input_, id=id_)


def _fake_response(*, stop_reason: str, content: list):
    return SimpleNamespace(stop_reason=stop_reason, content=content)


class _SequencedClient:
    """Async Anthropic client stand-in that hands out pre-seeded responses
    and records every ``messages.create`` kwargs for inspection."""

    def __init__(self, responses: list):
        self._responses = list(responses)
        self.calls: list[dict] = []

        async def create(**kwargs):
            self.calls.append(kwargs)
            if not self._responses:
                raise AssertionError("Ran out of mocked Anthropic responses")
            return self._responses.pop(0)

        self.messages = SimpleNamespace(create=create)


def _mock_db() -> MagicMock:
    db = MagicMock()
    scalars = MagicMock()
    scalars.all = MagicMock(return_value=[])
    exec_result = MagicMock()
    exec_result.scalars = MagicMock(return_value=scalars)
    exec_result.scalar_one_or_none = MagicMock(return_value=None)
    db.execute = AsyncMock(return_value=exec_result)
    return db


# ---------------------------------------------------------------------------
# Multi-turn context threading
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestMultiTurnThreading:
    async def test_prior_turns_are_passed_to_claude(self):
        """Frontend sends a 3-turn history; backend must thread all 3 into
        the first ``messages.create`` call (pre-tool-use)."""
        history = [
            {"role": "user", "content": "Why am I tired?"},
            {"role": "assistant", "content": "Your HRV dropped 12% and you've had 3 short nights of sleep."},
            {"role": "user", "content": "What should I do about it?"},
        ]
        client = _SequencedClient([
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("Rest today — an easy 30-min spin, no hard efforts.")],
            ),
        ])
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch.object(coach_service, "_get_anthropic_client", return_value=client):
            result = await coach_service.run_tool_use_loop(
                messages=history, user_id=1, db=_mock_db(), language="simple",
            )

        assert "rest" in result.lower() or "easy" in result.lower()
        assert len(client.calls) == 1
        call_messages = client.calls[0]["messages"]
        # All 3 prior turns must be in the outgoing message array.
        assert len(call_messages) == 3
        assert call_messages[0]["role"] == "user"
        assert call_messages[0]["content"] == "Why am I tired?"
        assert call_messages[1]["role"] == "assistant"
        # The follow-up question is the last turn sent.
        assert call_messages[2]["content"] == "What should I do about it?"

    async def test_role_tool_entries_are_filtered_out(self):
        """Defence-in-depth: even if the client accidentally leaks a
        role='tool' message into the payload (it should never — the frontend
        strips them), the backend drops it so Anthropic sees a valid history.
        """
        history = [
            {"role": "user", "content": "What's my fitness trend?"},
            # Synthetic tool card — MUST be filtered by the backend.
            {"role": "tool", "content": "CTL=62, trend=building"},
            {"role": "assistant", "content": "Your fitness is climbing steadily."},
            {"role": "user", "content": "Great — what now?"},
        ]
        client = _SequencedClient([
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("Hold the rhythm for another 2 weeks.")],
            ),
        ])
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch.object(coach_service, "_get_anthropic_client", return_value=client):
            await coach_service.run_tool_use_loop(
                messages=history, user_id=1, db=_mock_db(), language="simple",
            )

        call_messages = client.calls[0]["messages"]
        # tool entry dropped → exactly 3 turns remain
        assert len(call_messages) == 3
        assert all(m["role"] in ("user", "assistant") for m in call_messages)

    async def test_backend_trusts_client_on_truncation(self):
        """Backend imposes no max — if the frontend sends 15 turns, all 15
        are threaded. Truncation is the client's responsibility
        (MAX_CONTEXT_TURNS on the hook)."""
        # 15 alternating user/assistant turns
        history: list[dict] = []
        for i in range(7):
            history.append({"role": "user", "content": f"Question {i}"})
            history.append({"role": "assistant", "content": f"Answer {i}"})
        history.append({"role": "user", "content": "Final follow-up"})
        assert len(history) == 15

        client = _SequencedClient([
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("Acknowledged.")],
            ),
        ])
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch.object(coach_service, "_get_anthropic_client", return_value=client):
            await coach_service.run_tool_use_loop(
                messages=history, user_id=1, db=_mock_db(), language="simple",
            )

        call_messages = client.calls[0]["messages"]
        # All 15 turns reach Claude unchanged — the server does NOT truncate.
        assert len(call_messages) == 15
        assert call_messages[-1]["content"] == "Final follow-up"

    async def test_followup_with_new_range_triggers_new_tool_call(self):
        """Turn 1 tool-calls fetch_pmc_window(4w). Turn 2 (separate request)
        asks for 8w — the LLM emits a fresh tool_use block with the new range.
        """
        # Turn-2 request: history includes turn-1's exchange + the new user ask.
        history = [
            {"role": "user", "content": "How's my last 4 weeks?"},
            {"role": "assistant", "content": "CTL is climbing ~0.6/day; you're building."},
            {"role": "user", "content": "Same thing for last 8 weeks?"},
        ]
        client = _SequencedClient([
            # Claude emits a new tool_use block — different range this time.
            _fake_response(
                stop_reason="tool_use",
                content=[
                    _tool_use_block(
                        "fetch_pmc_window",
                        {"start_date": "2026-02-25", "end_date": "2026-04-21"},
                        id_="tu_8w",
                    ),
                ],
            ),
            # After tool_result, final narrative.
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("Over 8 weeks, CTL rose from 42 to 58 — a solid base build.")],
            ),
        ])
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch.object(coach_service, "_get_anthropic_client", return_value=client), \
             patch("app.services.coach_service.dispatch_tool", new=AsyncMock(
                return_value={"ok": True, "ctl_start": 42, "ctl_end": 58},
             )) as mock_dispatch:
            result = await coach_service.run_tool_use_loop(
                messages=history, user_id=1, db=_mock_db(), language="simple",
            )

        # Tool was dispatched with the 8-week range (not 4).
        assert mock_dispatch.call_count == 1
        _, kwargs = mock_dispatch.call_args
        # The range lives inside the tool_input positional arg
        args, _ = mock_dispatch.call_args
        # dispatch_tool(name, tool_input, user_id=..., db=...)
        assert args[0] == "fetch_pmc_window"
        tool_input = args[1]
        assert tool_input["start_date"] == "2026-02-25"
        assert tool_input["end_date"] == "2026-04-21"
        # Final narrative references the new range's numbers.
        assert "58" in result or "8 weeks" in result


# ---------------------------------------------------------------------------
# Undo round-trip integration (uses helpers shared with test_coach_tools)
# ---------------------------------------------------------------------------

def _make_planned_workout(
    *,
    user_id: int = 1,
    template_id: str = "vo2_5x4",
    duration_min: int = 75,
    indoor: bool = False,
):
    return SimpleNamespace(
        id=42,
        user_id=user_id,
        date=date(2026, 5, 1),
        sport="cycling",
        title="VO2 — 5x4min",
        duration_seconds_target=duration_min * 60,
        description=None,
        interval_structure=None,
        indoor=indoor,
        blocks_source="ai_prescribed",
        template_id=template_id,
    )


def _make_audit_row(
    *,
    user_id: int = 1,
    before_template: str = "vo2_5x4",
    before_duration: int = 57,  # vo2_5x4's natural base
    after_template: str = "z2_endurance_60",
    after_duration: int = 60,
    generated_at: datetime | None = None,
    row_id: int = 7,
):
    """Build a CoachBrief-shaped audit row for a prior modification."""
    return SimpleNamespace(
        id=row_id,
        user_id=user_id,
        verdict="modification",
        generated_at=generated_at or datetime.now(timezone.utc) - timedelta(minutes=5),
        evidence={
            "modification": {
                "date": "2026-05-01",
                "modification_type": "easier",
                "params": {},
                "before": {
                    "template_id": before_template,
                    "duration_min": before_duration,
                },
                "after": {
                    "template_id": after_template,
                    "duration_min": after_duration,
                    "indoor": False,
                    "predicted_tss": 45,
                },
                "rails_downgraded": False,
                "reason": "substituted down one step in the easier cascade",
            },
        },
    )


def _mock_undo_db(
    *,
    latest_modification=None,
    already_undone: bool = False,
    planned_workout=None,
    athlete_profile=None,
):
    """Build a DB mock that routes the undo handler's queries:
       - coach_briefs (finds latest modification + already-undone check)
       - planned_workouts (for revert_from_audit)
       - athlete_profiles (for FTP)
    """
    captured: list = []
    call_order: list[str] = []

    # coach_briefs is queried TWICE in undo:
    #   1) SELECT latest verdict='modification'
    #   2) SELECT WHERE verdict='modification_undo' AND original_audit_id=...
    coach_brief_calls = {"n": 0}

    async def _execute_side(stmt, *args, **kwargs):
        stmt_str = str(stmt).lower()
        out = MagicMock()
        if "coach_briefs" in stmt_str:
            coach_brief_calls["n"] += 1
            call_order.append("coach_briefs")
            if coach_brief_calls["n"] == 1:
                out.scalar_one_or_none = MagicMock(return_value=latest_modification)
            else:
                # already-undone check
                out.scalar_one_or_none = MagicMock(
                    return_value=SimpleNamespace(id=99) if already_undone else None,
                )
        elif "planned_workouts" in stmt_str:
            call_order.append("planned_workouts")
            out.scalar_one_or_none = MagicMock(return_value=planned_workout)
        elif "athlete_profiles" in stmt_str:
            call_order.append("athlete_profiles")
            out.scalar_one_or_none = MagicMock(return_value=athlete_profile)
        else:
            out.scalar_one_or_none = MagicMock(return_value=None)
        return out

    db = MagicMock()
    db.execute = AsyncMock(side_effect=_execute_side)
    db.add = MagicMock(side_effect=lambda obj: captured.append(obj))
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db._call_order = call_order
    return db, captured


@pytest.mark.asyncio
class TestUndoRoundTrip:
    async def test_undo_restores_pw_and_appends_audit_row(self):
        """modify → undo ⇒ PW is back to pre-modification state AND the
        audit trail now has two rows: the original modification (untouched)
        + a new verdict='modification_undo' row with original_audit_id."""
        # Post-modification PW (z2_endurance_60 after easier-cascade step).
        pw = _make_planned_workout(template_id="z2_endurance_60", duration_min=60)
        profile = SimpleNamespace(user_id=1, ftp_watts=250, injury_flag=False)
        audit = _make_audit_row(
            before_template="vo2_5x4", before_duration=57,
            after_template="z2_endurance_60", after_duration=60,
        )

        db, captured = _mock_undo_db(
            latest_modification=audit,
            already_undone=False,
            planned_workout=pw,
            athlete_profile=profile,
        )
        result = await dispatch_tool(
            "undo_last_modification", {}, user_id=1, db=db,
        )

        assert result["success"] is True
        assert result["restored_template_id"] == "vo2_5x4"
        # vo2_5x4's natural base is 57min — re-materialised from `before` lands near that
        assert 50 <= result["restored_duration_min"] <= 65
        # PW was restored in place.
        assert pw.template_id == "vo2_5x4"
        assert 50 * 60 <= pw.duration_seconds_target <= 65 * 60
        assert pw.blocks_source == "user_undo"
        # A NEW audit row was appended (plus the rule='revert' feed row the
        # shared pipeline logs for the adaptation timeline).
        from app.models.coach_brief import CoachBrief
        audit_rows = [c for c in captured if isinstance(c, CoachBrief)]
        assert len(audit_rows) == 1
        undo_audit = audit_rows[0]
        assert undo_audit.verdict == "modification_undo"
        assert undo_audit.user_id == 1
        assert undo_audit.evidence["modification_undo"]["original_audit_id"] == str(audit.id)
        assert undo_audit.evidence["modification_undo"]["restored_to"]["template_id"] == "vo2_5x4"
        # Original audit row is NEVER touched — only the new undo row is added.
        # (captured only holds db.add(...) objects, not updates.)
        assert audit.verdict == "modification"  # unchanged

    async def test_no_prior_modification_returns_found_false(self):
        db, captured = _mock_undo_db(latest_modification=None)
        result = await dispatch_tool(
            "undo_last_modification", {}, user_id=1, db=db,
        )
        assert result["found"] is False
        assert captured == []

    async def test_already_undone_returns_found_false(self):
        """Double-undo: modify → undo → undo again → second undo is a no-op."""
        audit = _make_audit_row()
        db, captured = _mock_undo_db(
            latest_modification=audit,
            already_undone=True,
        )
        result = await dispatch_tool(
            "undo_last_modification", {}, user_id=1, db=db,
        )
        assert result["found"] is False
        assert "already" in result["reason"].lower()
        assert captured == []

    async def test_modification_outside_window_not_eligible(self):
        """A modification older than 1 hour is not returned by the SELECT
        cutoff filter — the handler sees no eligible row and returns
        found=False."""
        # Mock the DB to return no latest modification (the cutoff filter
        # excluded it on the SQL side).
        db, captured = _mock_undo_db(latest_modification=None)
        result = await dispatch_tool(
            "undo_last_modification", {}, user_id=1, db=db,
        )
        assert result["found"] is False
        assert captured == []
