"""Unit tests for chart_interpreter — text → ChartSpec via (mocked) Claude."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.user_dashboard import ChartSpec
from app.services import chart_interpreter
from app.services.chart_interpreter import (
    ChartInterpretError,
    build_system_prompt,
    interpret_chart,
)

VALID_INPUT = {
    "title": "Weekly TSS",
    "mark": "bar",
    "query": {
        "dataset": "activities",
        "dimensions": [{"column": "started_at", "time_grain": "week"}],
        "measures": [{"column": "tss", "aggregation": "sum", "alias": "total_tss"}],
        "filters": [],
        "order_by": "started_at",
        "order_dir": "asc",
    },
    "encoding": {"x": "started_at", "y": "total_tss"},
}


def _fake_response(tool_input):
    """A messages.create() return value carrying one emit_chart tool_use block."""
    block = SimpleNamespace(type="tool_use", name="emit_chart", input=tool_input)
    return SimpleNamespace(content=[block])


def _patch_anthropic(monkeypatch, *responses):
    """Patch anthropic.AsyncAnthropic so messages.create yields the given
    responses in order."""
    import anthropic

    create = AsyncMock(side_effect=list(responses))
    client = MagicMock()
    client.messages = MagicMock(create=create)
    monkeypatch.setattr(anthropic, "AsyncAnthropic", MagicMock(return_value=client))
    monkeypatch.setattr(chart_interpreter.settings, "ANTHROPIC_API_KEY", "test-key")
    return create


class TestBuildSystemPrompt:
    def test_includes_real_dataset_columns(self):
        prompt = build_system_prompt()
        # Columns come from list_datasets() — must mention real ones.
        assert "activities" in prompt and "daily_metrics" in prompt
        assert "tss" in prompt and "hrv_status" in prompt
        # And the allowed aggregations / marks.
        assert "avg" in prompt and "scatter" in prompt


@pytest.mark.asyncio
class TestInterpretChart:
    async def test_valid_spec_returned(self, monkeypatch):
        _patch_anthropic(monkeypatch, _fake_response(VALID_INPUT))
        spec = await interpret_chart("weekly tss")
        assert isinstance(spec, ChartSpec)
        assert spec.mark == "bar"
        assert spec.query.dataset == "activities"
        assert spec.encoding.y == "total_tss"

    async def test_retries_once_then_succeeds(self, monkeypatch):
        bad = {"mark": "bar", "query": {"dataset": "activities", "measures": []},
               "encoding": {"x": "started_at", "y": "total_tss"}}  # measures empty → invalid
        create = _patch_anthropic(
            monkeypatch, _fake_response(bad), _fake_response(VALID_INPUT)
        )
        spec = await interpret_chart("weekly tss")
        assert isinstance(spec, ChartSpec)
        assert create.await_count == 2  # retried once

    async def test_invalid_twice_raises(self, monkeypatch):
        bad = {"mark": "bar", "query": {"dataset": "activities", "measures": []},
               "encoding": {"x": "x", "y": "y"}}
        _patch_anthropic(monkeypatch, _fake_response(bad), _fake_response(bad))
        with pytest.raises(ChartInterpretError):
            await interpret_chart("nonsense")

    async def test_no_tool_call_raises(self, monkeypatch):
        empty = SimpleNamespace(content=[SimpleNamespace(type="text", text="hi")])
        _patch_anthropic(monkeypatch, empty, empty)
        with pytest.raises(ChartInterpretError):
            await interpret_chart("???")

    async def test_no_api_key_raises(self, monkeypatch):
        monkeypatch.setattr(chart_interpreter.settings, "ANTHROPIC_API_KEY", None)
        with pytest.raises(ChartInterpretError) as exc:
            await interpret_chart("weekly tss")
        assert exc.value.code == "no_key"
