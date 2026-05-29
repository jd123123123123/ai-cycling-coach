"""Tests for the Claude tool-use loop + deterministic chat fallback.

Split into:
    1. run_tool_use_loop — mocked anthropic client; tests branching on
       stop_reason, parallel tool_use blocks, max-iteration safety, and
       dispatch_tool exceptions surfacing as is_error tool_results.
    2. _fallback_analytical_answer — no API key; regex pattern matching for
       "why am I tired?" and "last N weeks". Polite refusal for other patterns.
    3. System prompt variant — system_prompt_for_language(language, context)
       returns the chat_analytical variant when context='chat_analytical'.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import coach_service


# ---------------------------------------------------------------------------
# Helpers — fake Anthropic response objects
# ---------------------------------------------------------------------------

def _text_block(text: str):
    return SimpleNamespace(type="text", text=text)


def _tool_use_block(name: str, input_: dict, id_: str = "tu_1"):
    return SimpleNamespace(type="tool_use", name=name, input=input_, id=id_)


def _fake_response(*, stop_reason: str, content: list):
    return SimpleNamespace(stop_reason=stop_reason, content=content)


class _SequencedClient:
    """Async Anthropic client stand-in. `messages.create` returns responses
    from a pre-seeded queue, one per call."""
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
# run_tool_use_loop — Anthropic API key present
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestRunToolUseLoop:
    async def test_end_turn_immediately_returns_text(self):
        """stop_reason='end_turn' on first call → no tool dispatched, text returned."""
        client = _SequencedClient([
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("Direct answer without tools.")],
            ),
        ])
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client):
            result = await coach_service.run_tool_use_loop(
                messages=[{"role": "user", "content": "Hello"}],
                user_id=1, db=db, language="simple",
            )
        assert result == "Direct answer without tools."
        assert len(client.calls) == 1
        # tools= was passed
        assert "tools" in client.calls[0]

    async def test_single_tool_use_then_text(self):
        """Tool call → dispatch → second call returns text → loop exits."""
        client = _SequencedClient([
            _fake_response(
                stop_reason="tool_use",
                content=[_tool_use_block("fetch_ftp_history", {}, id_="tu_a")],
            ),
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("Your FTP is trending up.")],
            ),
        ])
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client), \
             patch(
                 "app.services.coach_service.dispatch_tool",
                 new=AsyncMock(return_value={"current": 280, "trend": "improving"}),
             ) as mock_dispatch:
            result = await coach_service.run_tool_use_loop(
                messages=[{"role": "user", "content": "How's my FTP trending?"}],
                user_id=1, db=db, language="simple",
            )
        assert "FTP" in result or "trending" in result
        assert mock_dispatch.call_count == 1
        _, kwargs = mock_dispatch.call_args
        assert kwargs.get("user_id") == 1 or 1 in mock_dispatch.call_args.args

    async def test_parallel_tool_use_both_dispatched(self):
        """Two tool_use blocks in one response → both dispatched → combined result."""
        client = _SequencedClient([
            _fake_response(
                stop_reason="tool_use",
                content=[
                    _tool_use_block("fetch_ftp_history", {}, id_="tu_a"),
                    _tool_use_block("fetch_recovery_trend", {"days": 14}, id_="tu_b"),
                ],
            ),
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("Combined answer.")],
            ),
        ])
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client), \
             patch(
                 "app.services.coach_service.dispatch_tool",
                 new=AsyncMock(return_value={"ok": True}),
             ) as mock_dispatch:
            await coach_service.run_tool_use_loop(
                messages=[{"role": "user", "content": "Status?"}],
                user_id=1, db=db, language="simple",
            )
        assert mock_dispatch.call_count == 2
        # Second API call must include the user-role tool_result block with
        # BOTH tool_use_ids
        second_call_messages = client.calls[1]["messages"]
        # The last message must be role=user with a list of tool_result blocks
        last = second_call_messages[-1]
        assert last["role"] == "user"
        assert isinstance(last["content"], list)
        tool_use_ids = {
            b["tool_use_id"] for b in last["content"]
            if isinstance(b, dict) and b.get("type") == "tool_result"
        }
        assert tool_use_ids == {"tu_a", "tu_b"}

    async def test_max_iterations_safety(self):
        """Claude keeps asking for tools forever → loop exits with notice."""
        # Seed 10 tool_use responses; max_iterations=3 should cap it
        responses = [
            _fake_response(
                stop_reason="tool_use",
                content=[_tool_use_block("fetch_ftp_history", {}, id_=f"tu_{i}")],
            )
            for i in range(10)
        ]
        client = _SequencedClient(responses)
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client), \
             patch(
                 "app.services.coach_service.dispatch_tool",
                 new=AsyncMock(return_value={}),
             ):
            result = await coach_service.run_tool_use_loop(
                messages=[{"role": "user", "content": "test"}],
                user_id=1, db=db, language="simple",
                max_iterations=3,
            )
        # After max_iterations, return partial-result notice
        assert "budget" in result.lower() or "partial" in result.lower() or "exceeded" in result.lower()

    async def test_dispatch_exception_is_error_tool_result(self):
        """ValueError from dispatch_tool → tool_result with is_error=True;
        Claude recovers in next turn."""
        client = _SequencedClient([
            _fake_response(
                stop_reason="tool_use",
                content=[_tool_use_block("fetch_pmc_window", {"bad": "input"}, id_="tu_x")],
            ),
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("Sorry, I could not retrieve that.")],
            ),
        ])
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client), \
             patch(
                 "app.services.coach_service.dispatch_tool",
                 new=AsyncMock(side_effect=ValueError("Missing required field: start_date")),
             ):
            result = await coach_service.run_tool_use_loop(
                messages=[{"role": "user", "content": "Show PMC"}],
                user_id=1, db=db, language="simple",
            )
        # Loop continues after dispatch error; final text returned
        assert "could not retrieve" in result or result.strip() != ""
        # Second call must have sent an is_error tool_result
        second_call_messages = client.calls[1]["messages"]
        last = second_call_messages[-1]
        err_blocks = [
            b for b in last["content"]
            if isinstance(b, dict) and b.get("is_error") is True
        ]
        assert len(err_blocks) == 1


# ---------------------------------------------------------------------------
# Fallback — no API key
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestFallbackAnalyticalAnswer:
    async def test_why_am_i_tired_pattern(self):
        """'why am I tired?' → fatigue synthesizer fallback."""
        db = _mock_db()
        fake_brief = {
            "verdict": "Rest today",
            "rationale": "You've been riding hard and your sleep has been short.",
        }
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", None), \
             patch(
                 "app.services.coach_service.build_snapshot",
                 new=AsyncMock(return_value={"language": "simple"}),
             ), \
             patch(
                 "app.services.coach_service._rule_based_brief",
                 return_value=fake_brief,
             ):
            result = await coach_service.run_tool_use_loop(
                messages=[{"role": "user", "content": "Why am I tired?"}],
                user_id=1, db=db, language="simple",
            )
        # Must reference rationale content
        assert "hard" in result.lower() or "sleep" in result.lower() or "tired" in result.lower()

    async def test_fatigued_variant_matches(self):
        db = _mock_db()
        fake_brief = {"verdict": "Rest", "rationale": "Easy today."}
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", None), \
             patch(
                 "app.services.coach_service.build_snapshot",
                 new=AsyncMock(return_value={"language": "simple"}),
             ), \
             patch(
                 "app.services.coach_service._rule_based_brief",
                 return_value=fake_brief,
             ):
            result = await coach_service.run_tool_use_loop(
                messages=[{"role": "user", "content": "I'm really fatigued today"}],
                user_id=1, db=db, language="simple",
            )
        assert len(result) > 0

    async def test_last_n_weeks_pattern(self):
        """'analyze my last 4 weeks' → deterministic PMC + recovery summary."""
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", None), \
             patch(
                 "app.services.coach_service.pmc_window_summary",
                 new=AsyncMock(return_value={
                     "days": [{"date": "2026-04-01", "ctl": 50, "atl": 45, "tsb": 5, "daily_tss": 60, "zone_hours": None}],
                     "aggregate": {"avg_ctl": 50.0, "avg_atl": 45.0, "avg_tsb": 5.0,
                                   "total_tss": 1200.0, "total_hours": 24.0, "ramp_rate": 2.0},
                     "trend": {"ctl_delta": 5.0, "atl_delta": 2.0, "tsb_delta": 3.0, "direction": "building"},
                 }),
             ), \
             patch(
                 "app.services.coach_service.recovery_trend_summary",
                 new=AsyncMock(return_value={
                     "days": [],
                     "aggregate": {"avg_sleep": 7.2, "avg_hrv": 55.0,
                                   "hrv_trend_pct": 2.0, "sleep_debt_hours": 3.0,
                                   "avg_rhr": 54.0, "rhr_trend_pct": -1.0},
                     "flags": [],
                 }),
             ):
            result = await coach_service.run_tool_use_loop(
                messages=[{"role": "user", "content": "Analyze my last 4 weeks"}],
                user_id=1, db=db, language="simple",
            )
        # Deterministic summary must cite the window + direction
        assert "4" in result or "four" in result.lower() or "weeks" in result.lower()
        assert "building" in result.lower() or "fitness" in result.lower()

    async def test_past_variant_matches(self):
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", None), \
             patch(
                 "app.services.coach_service.pmc_window_summary",
                 new=AsyncMock(return_value={
                     "days": [],
                     "aggregate": {"avg_ctl": 0, "avg_atl": 0, "avg_tsb": 0,
                                   "total_tss": 0, "total_hours": 0, "ramp_rate": 0},
                     "trend": {"ctl_delta": 0, "atl_delta": 0, "tsb_delta": 0,
                               "direction": "insufficient_data"},
                 }),
             ), \
             patch(
                 "app.services.coach_service.recovery_trend_summary",
                 new=AsyncMock(return_value={
                     "days": [],
                     "aggregate": {"avg_sleep": 0, "avg_hrv": 0,
                                   "hrv_trend_pct": 0, "sleep_debt_hours": 0,
                                   "avg_rhr": 0, "rhr_trend_pct": 0},
                     "flags": [],
                 }),
             ):
            result = await coach_service.run_tool_use_loop(
                messages=[{"role": "user", "content": "How were my past 2 weeks?"}],
                user_id=1, db=db, language="simple",
            )
        assert len(result) > 0

    async def test_unknown_pattern_refuses_politely(self):
        """Any pattern that's not 'why tired' or 'last N weeks' → polite refusal
        mentioning the upgrade path (ANTHROPIC_API_KEY)."""
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", None):
            result = await coach_service.run_tool_use_loop(
                messages=[{"role": "user", "content": "What's the meaning of life?"}],
                user_id=1, db=db, language="simple",
            )
        assert "ANTHROPIC_API_KEY" in result or "upgrade" in result.lower() or "tired" in result.lower()


# ---------------------------------------------------------------------------
# run_tool_use_loop_events — streaming variant for SSE tool_use lifecycle
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestRunToolUseLoopEvents:
    async def test_end_turn_yields_only_text_event(self):
        """No tool call → single text event, no tool_use_start/result frames."""
        client = _SequencedClient([
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("Plain answer.")],
            ),
        ])
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client):
            events = [
                e async for e in coach_service.run_tool_use_loop_events(
                    messages=[{"role": "user", "content": "hi"}],
                    user_id=1, db=db, language="simple",
                )
            ]
        assert len(events) == 1
        assert events[0]["type"] == "text"
        assert events[0]["text"] == "Plain answer."

    async def test_tool_use_emits_start_and_result_events(self):
        """Tool call → tool_use_start + tool_use_result + final text, in that order."""
        client = _SequencedClient([
            _fake_response(
                stop_reason="tool_use",
                content=[_tool_use_block("fetch_ftp_history", {"days": 30}, id_="tu_1")],
            ),
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("FTP is steady.")],
            ),
        ])
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client), \
             patch(
                 "app.services.coach_service.dispatch_tool",
                 new=AsyncMock(return_value={"current": 280, "trend": "stable"}),
             ):
            events = [
                e async for e in coach_service.run_tool_use_loop_events(
                    messages=[{"role": "user", "content": "FTP?"}],
                    user_id=1, db=db, language="simple",
                )
            ]
        types = [e["type"] for e in events]
        assert types == ["tool_use_start", "tool_use_result", "text"]
        assert events[0]["name"] == "fetch_ftp_history"
        assert events[0]["input"] == {"days": 30}
        assert events[1]["name"] == "fetch_ftp_history"
        assert events[1]["result"] == {"current": 280, "trend": "stable"}
        assert events[1]["is_error"] is False
        assert events[2]["text"] == "FTP is steady."

    async def test_dispatch_exception_yields_is_error_event(self):
        """dispatch_tool raises → tool_use_result with is_error=True; loop continues."""
        client = _SequencedClient([
            _fake_response(
                stop_reason="tool_use",
                content=[_tool_use_block("fetch_pmc_window", {}, id_="tu_x")],
            ),
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("Could not fetch.")],
            ),
        ])
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client), \
             patch(
                 "app.services.coach_service.dispatch_tool",
                 new=AsyncMock(side_effect=ValueError("bad input")),
             ):
            events = [
                e async for e in coach_service.run_tool_use_loop_events(
                    messages=[{"role": "user", "content": "Show PMC"}],
                    user_id=1, db=db, language="simple",
                )
            ]
        # tool_use_start + tool_use_result(is_error=True) + final text
        assert [e["type"] for e in events] == ["tool_use_start", "tool_use_result", "text"]
        assert events[1]["is_error"] is True

    async def test_no_api_key_yields_only_text_event(self):
        """Fallback path (no API key) emits a single text event — no tool frames."""
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", None), \
             patch(
                 "app.services.coach_service.build_snapshot",
                 new=AsyncMock(return_value={"language": "simple"}),
             ), \
             patch(
                 "app.services.coach_service._rule_based_brief",
                 return_value={"verdict": "Rest", "rationale": "Sleep short."},
             ):
            events = [
                e async for e in coach_service.run_tool_use_loop_events(
                    messages=[{"role": "user", "content": "Why am I tired?"}],
                    user_id=1, db=db, language="simple",
                )
            ]
        assert len(events) == 1
        assert events[0]["type"] == "text"
        assert len(events[0]["text"]) > 0


@pytest.mark.asyncio
class TestGenerateAnalyticalChatStream:
    async def test_sse_frames_include_tool_use_lifecycle(self):
        """SSE output must include event: tool_use_start / tool_use_result lines
        so the frontend parser can render intermediate UI state."""
        client = _SequencedClient([
            _fake_response(
                stop_reason="tool_use",
                content=[_tool_use_block("fetch_pmc_window", {"days": 28}, id_="tu_pmc")],
            ),
            _fake_response(
                stop_reason="end_turn",
                content=[_text_block("Steady build.")],
            ),
        ])
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client), \
             patch(
                 "app.services.coach_service.dispatch_tool",
                 new=AsyncMock(return_value={"trend": "building"}),
             ):
            frames = []
            async for chunk in coach_service.generate_analytical_chat_stream(
                db=db, user_id=1,
                messages=[{"role": "user", "content": "Last 4 weeks?"}],
                language="simple",
            ):
                frames.append(chunk)

        blob = "".join(frames)
        # New frame types are present
        assert "event: tool_use_start" in blob
        assert "event: tool_use_result" in blob
        assert "fetch_pmc_window" in blob
        # Existing frame shapes preserved (backward compat with 05-02 client)
        assert '"type": "delta"' in blob
        assert '"type": "done"' in blob

    async def test_fallback_path_still_emits_delta_and_done(self):
        """Without API key the fallback path must still stream delta + done
        frames (backward compat with 05-02's streamCoachChat consumer)."""
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", None), \
             patch(
                 "app.services.coach_service.build_snapshot",
                 new=AsyncMock(return_value={"language": "simple"}),
             ), \
             patch(
                 "app.services.coach_service._rule_based_brief",
                 return_value={"verdict": "Rest", "rationale": "Short sleep."},
             ):
            blob = "".join([
                c async for c in coach_service.generate_analytical_chat_stream(
                    db=db, user_id=1,
                    messages=[{"role": "user", "content": "Why tired?"}],
                    language="simple",
                )
            ])
        assert '"type": "delta"' in blob
        assert '"type": "done"' in blob
        # No tool frames on fallback path
        assert "event: tool_use_start" not in blob


# ---------------------------------------------------------------------------
# System prompt — chat_analytical variant
# ---------------------------------------------------------------------------

class TestChatAnalyticalSystemPrompt:
    def test_chat_analytical_mentions_tools(self):
        """The chat_analytical variant must instruct Claude to USE TOOLS."""
        from app.services.coach_prompt import system_prompt_for_language
        prompt = system_prompt_for_language("simple", context="chat_analytical")
        assert "tool" in prompt.lower()
        # Must name at least a couple of tools so Claude knows them
        assert "fetch_pmc_window" in prompt or "fetch_recovery_trend" in prompt

    def test_chat_analytical_technical_variant_exists(self):
        from app.services.coach_prompt import system_prompt_for_language
        prompt = system_prompt_for_language("technical", context="chat_analytical")
        assert len(prompt) > 100
        assert "tool" in prompt.lower()

    def test_default_context_is_brief(self):
        """Omitting context kwarg must return the brief-flow prompt — i.e. the
        SYSTEM_PROMPT_* string wrapped by the COACH_KNOWLEDGE_BASE prefix and
        the Step 7 tomorrow_plan/regeneration addendum. We verify the base
        prompt is embedded; equality no longer holds since the wrappers are
        deliberate."""
        from app.services.coach_prompt import (
            SYSTEM_PROMPT_SIMPLE,
            SYSTEM_PROMPT_TECHNICAL,
            system_prompt_for_language,
        )
        simple = system_prompt_for_language("simple")
        technical = system_prompt_for_language("technical")
        assert SYSTEM_PROMPT_SIMPLE in simple
        assert SYSTEM_PROMPT_TECHNICAL in technical
        # Sanity-check: brief variant still differs from the chat variants.
        assert "tool_result" not in simple
        assert "tool_result" not in technical
