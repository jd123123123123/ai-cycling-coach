"""Tests for the `present_answer` terminal tool — structured coach answers.

Covers:
    1. coach_tools — `present_answer` is registered; the handler is a pure
       pass-through that normalizes: caps facts at 4, coerces value/tone/unit
       types, trims summary, and returns facts:[] on the no-data path.
    2. coach_service.run_tool_use_loop_events — a `present_answer` tool call
       is LOOP-TERMINATING: it emits a single tool_use_result (name
       present_answer) and ends the turn WITHOUT a trailing text event.
    3. Safety — the `summary` passes through validate_chat_response; an
       ED-adjacent summary is replaced with the canned redirect.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import coach_service
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


def _text_block(text: str):
    return SimpleNamespace(type="text", text=text)


def _tool_use_block(name: str, input_: dict, id_: str = "tu_1"):
    return SimpleNamespace(type="tool_use", name=name, input=input_, id=id_)


def _fake_response(*, stop_reason: str, content: list):
    return SimpleNamespace(stop_reason=stop_reason, content=content)


class _SequencedClient:
    def __init__(self, responses: list):
        self._responses = list(responses)
        self.calls: list[dict] = []

        async def create(**kwargs):
            self.calls.append(kwargs)
            if not self._responses:
                raise AssertionError("Ran out of mocked Anthropic responses")
            return self._responses.pop(0)

        self.messages = SimpleNamespace(create=create)


# ---------------------------------------------------------------------------
# Schema / registry
# ---------------------------------------------------------------------------

class TestPresentAnswerSchema:
    def test_registered_in_schemas_and_registry(self):
        names = {s["name"] for s in TOOL_SCHEMAS}
        assert "present_answer" in names
        assert "present_answer" in TOOL_REGISTRY

    def test_schema_shape(self):
        schema = next(s for s in TOOL_SCHEMAS if s["name"] == "present_answer")
        props = schema["input_schema"]["properties"]
        assert "facts" in props
        assert "summary" in props
        assert schema["input_schema"]["type"] == "object"


# ---------------------------------------------------------------------------
# Handler normalization (pure pass-through)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestPresentAnswerHandler:
    async def test_passes_valid_payload_through(self):
        db = _mock_db()
        result = await dispatch_tool(
            "present_answer",
            {
                "facts": [
                    {"label": "Ruhepuls", "value": 48, "unit": "bpm", "tone": "good"},
                    {"label": "Schlaf", "value": 7.8, "unit": "h", "tone": "good"},
                ],
                "summary": "Intervalle möglich, aber halt dich anfangs zurück.",
            },
            user_id=1,
            db=db,
        )
        assert len(result["facts"]) == 2
        assert result["facts"][0] == {
            "label": "Ruhepuls",
            "value": 48,
            "unit": "bpm",
            "tone": "good",
        }
        assert result["summary"] == "Intervalle möglich, aber halt dich anfangs zurück."
        # Pure pass-through — no DB writes.
        db.commit.assert_not_called()

    async def test_caps_facts_at_four(self):
        db = _mock_db()
        result = await dispatch_tool(
            "present_answer",
            {
                "facts": [
                    {"label": f"L{i}", "value": i, "tone": "neutral"}
                    for i in range(7)
                ],
                "summary": "Zusammenfassung.",
            },
            user_id=1,
            db=db,
        )
        assert len(result["facts"]) == 4

    async def test_coerces_tone_default_neutral(self):
        db = _mock_db()
        result = await dispatch_tool(
            "present_answer",
            {
                "facts": [
                    {"label": "A", "value": 1, "tone": "bogus"},
                    {"label": "B", "value": 2},
                ],
                "summary": "x",
            },
            user_id=1,
            db=db,
        )
        assert result["facts"][0]["tone"] == "neutral"
        assert result["facts"][1]["tone"] == "neutral"

    async def test_value_string_or_number_preserved(self):
        db = _mock_db()
        result = await dispatch_tool(
            "present_answer",
            {
                "facts": [
                    {"label": "Körperakku", "value": "33/100", "tone": "caution"},
                    {"label": "CTL", "value": 62, "tone": "good"},
                    {"label": "TSB", "value": -4.5, "tone": "caution"},
                ],
                "summary": "ok",
            },
            user_id=1,
            db=db,
        )
        assert result["facts"][0]["value"] == "33/100"
        assert result["facts"][1]["value"] == 62
        assert result["facts"][2]["value"] == -4.5

    async def test_trims_summary(self):
        db = _mock_db()
        result = await dispatch_tool(
            "present_answer",
            {"facts": [], "summary": "   Kurz und knapp.   \n"},
            user_id=1,
            db=db,
        )
        assert result["summary"] == "Kurz und knapp."

    async def test_no_data_path_empty_facts(self):
        db = _mock_db()
        result = await dispatch_tool(
            "present_answer",
            {"summary": "Noch keine Daten — synce zuerst Garmin."},
            user_id=1,
            db=db,
        )
        assert result["facts"] == []
        assert "summary" in result

    async def test_drops_facts_missing_label_or_value(self):
        db = _mock_db()
        result = await dispatch_tool(
            "present_answer",
            {
                "facts": [
                    {"label": "", "value": 1, "tone": "good"},
                    {"value": 2, "tone": "good"},
                    {"label": "Ok", "tone": "good"},
                    {"label": "Keep", "value": 5, "tone": "good"},
                ],
                "summary": "s",
            },
            user_id=1,
            db=db,
        )
        assert result["facts"] == [
            {"label": "Keep", "value": 5, "tone": "good"}
        ]


# ---------------------------------------------------------------------------
# Loop-terminating behaviour + safety validation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestPresentAnswerTerminatesLoop:
    async def test_present_answer_ends_turn_no_text_event(self):
        client = _SequencedClient([
            _fake_response(
                stop_reason="tool_use",
                content=[
                    _tool_use_block(
                        "present_answer",
                        {
                            "facts": [
                                {"label": "Schlaf", "value": 7.8, "unit": "h", "tone": "good"},
                            ],
                            "summary": "Sieht gut aus.",
                        },
                        id_="tu_pa",
                    )
                ],
            ),
        ])
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client):
            events = [
                e async for e in coach_service.run_tool_use_loop_events(
                    messages=[{"role": "user", "content": "Bin ich bereit?"}],
                    user_id=1, db=db, language="simple",
                )
            ]
        types = [e["type"] for e in events]
        assert types == ["tool_use_start", "tool_use_result"]
        assert events[1]["name"] == "present_answer"
        assert events[1]["result"]["summary"] == "Sieht gut aus."
        # Only ONE model call — the loop terminated, never went back to Claude.
        assert len(client.calls) == 1

    async def test_summary_runs_through_safety_validator(self):
        client = _SequencedClient([
            _fake_response(
                stop_reason="tool_use",
                content=[
                    _tool_use_block(
                        "present_answer",
                        {
                            "facts": [],
                            "summary": "You should restrict calories to get leaner.",
                        },
                        id_="tu_bad",
                    )
                ],
            ),
        ])
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client):
            events = [
                e async for e in coach_service.run_tool_use_loop_events(
                    messages=[{"role": "user", "content": "how do I lose weight?"}],
                    user_id=1, db=db, language="simple",
                )
            ]
        result_evt = next(e for e in events if e["type"] == "tool_use_result")
        assert "restrict calories" not in result_evt["result"]["summary"].lower()
        assert "adequate fueling" in result_evt["result"]["summary"].lower()

    async def test_sse_stream_emits_present_answer_result_frame(self):
        client = _SequencedClient([
            _fake_response(
                stop_reason="tool_use",
                content=[
                    _tool_use_block(
                        "present_answer",
                        {"facts": [], "summary": "Alles ok."},
                        id_="tu_pa2",
                    )
                ],
            ),
        ])
        db = _mock_db()
        with patch.object(coach_service.settings, "ANTHROPIC_API_KEY", "sk-test"), \
             patch("app.services.coach_service._get_anthropic_client", return_value=client):
            frames = [
                f async for f in coach_service.generate_analytical_chat_stream(
                    db, 1, [{"role": "user", "content": "status?"}], language="simple",
                )
            ]
        joined = "".join(frames)
        assert "event: tool_use_result" in joined
        assert "present_answer" in joined
        assert '"type": "done"' in joined
