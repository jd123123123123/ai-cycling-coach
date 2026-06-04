"""Turn a plain-English phrase into a validated ChartSpec via Claude tool-use.

The model is given the real dataset/column allowlist (from analytics_query.
list_datasets — single source of truth) and a forced tool whose input mirrors
ChartSpec. The result is validated by the ChartSpec Pydantic model; a malformed
spec triggers one retry, then ChartInterpretError. Even if a bad column slips
through, execute_query (RLS + allowlist) rejects it at render time — this layer
is best-effort interpretation, not the security boundary.
"""
from __future__ import annotations

import logging

from pydantic import ValidationError

from app.config import settings
from app.schemas.user_dashboard import ChartSpec
from app.services.analytics_query import list_datasets

logger = logging.getLogger(__name__)


class ChartInterpretError(Exception):
    """Raised when a phrase cannot be turned into a valid ChartSpec.

    `code` is 'no_key' (Claude unavailable) or 'invalid' (uninterpretable).
    """

    def __init__(self, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.code = code


_CHART_TOOL = {
    "name": "emit_chart",
    "description": "Emit the chart specification that answers the user's request.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Short human title for the chart."},
            "mark": {"type": "string", "enum": ["line", "area", "bar", "scatter"]},
            "query": {
                "type": "object",
                "properties": {
                    "dataset": {"type": "string", "enum": ["activities", "daily_metrics"]},
                    "dimensions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "column": {"type": "string"},
                                "time_grain": {"type": "string", "enum": ["day", "week", "month", "year"]},
                                "alias": {"type": "string"},
                            },
                            "required": ["column"],
                        },
                    },
                    "measures": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "column": {"type": "string"},
                                "aggregation": {"type": "string", "enum": ["count", "sum", "avg", "min", "max", "p50", "p95"]},
                                "alias": {"type": "string"},
                            },
                            "required": ["column", "aggregation"],
                        },
                    },
                    "filters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "column": {"type": "string"},
                                "op": {"type": "string", "enum": ["eq", "ne", "in", "gt", "gte", "lt", "lte"]},
                                "value": {},
                            },
                            "required": ["column", "op"],
                        },
                    },
                    "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "order_by": {"type": "string"},
                    "order_dir": {"type": "string", "enum": ["asc", "desc"]},
                },
                "required": ["dataset", "measures"],
            },
            "encoding": {
                "type": "object",
                "properties": {
                    "x": {"type": "string"},
                    "y": {"type": "string"},
                    "series": {"type": "string"},
                },
                "required": ["x", "y"],
            },
        },
        "required": ["mark", "query", "encoding"],
    },
}


def build_system_prompt() -> str:
    """Compose the dataset/column contract from the live allowlist so the model
    can only reference columns the query compiler will accept."""
    datasets = list_datasets()
    lines = [
        "You convert an athlete's request into ONE chart specification by calling "
        "the emit_chart tool. You only have these datasets and columns:",
        "",
    ]
    for ds_id, ds in datasets.items():
        cols = ", ".join(f"{c['name']} ({c['type']})" for c in ds["columns"])
        lines.append(f"- {ds_id} (time column: {ds['time_column']}): {cols}")
    lines += [
        "",
        "Rules:",
        "- Pick exactly one dataset. Use ONLY its columns above — never invent columns.",
        "- A chart is one X dimension + one Y measure (optionally split by a 'series').",
        "- Allowed mark types: line, area, bar, scatter.",
        "- For a time trend, make the X dimension the time column with a time_grain "
        "(day/week/month/year) and set mark to 'line' or 'bar'.",
        "- Aggregations: count, sum, avg, min, max, p50, p95.",
        "- Give the measure an explicit alias and set encoding.y to that alias. "
        "Set encoding.x to the X dimension's column name.",
        "- For relative ranges ('last 3 months') set query.start_date/end_date "
        "as YYYY-MM-DD using today as the end; otherwise omit them.",
        "- Always call emit_chart. Never answer in prose.",
    ]
    return "\n".join(lines)


def _extract_tool_input(response) -> dict | None:
    for block in getattr(response, "content", None) or []:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "emit_chart":
            inp = getattr(block, "input", None)
            if isinstance(inp, dict):
                return inp
    return None


async def interpret_chart(text: str) -> ChartSpec:
    """Interpret `text` into a validated ChartSpec. Raises ChartInterpretError."""
    if not settings.ANTHROPIC_API_KEY:
        raise ChartInterpretError(
            "AI card creation is unavailable (no API key configured).", code="no_key"
        )

    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    system = build_system_prompt()
    last_err = "no tool call"

    for attempt in range(2):
        user_content = text if attempt == 0 else (
            f"{text}\n\n(Your previous attempt was invalid: {last_err}. "
            "Return a valid emit_chart call using only the allowed columns.)"
        )
        try:
            response = await client.messages.create(
                model=settings.COACH_MODEL,
                max_tokens=700,
                temperature=0,
                system=[{"type": "text", "text": system,
                         "cache_control": {"type": "ephemeral"}}],
                tools=[_CHART_TOOL],
                tool_choice={"type": "tool", "name": "emit_chart"},
                messages=[{"role": "user", "content": user_content}],
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("chart interpret Claude call failed: %s", exc)
            raise ChartInterpretError(
                "AI card creation is temporarily unavailable.", code="no_key"
            ) from exc

        tool_input = _extract_tool_input(response)
        if tool_input is None:
            last_err = "model did not call emit_chart"
            continue
        try:
            return ChartSpec(**tool_input)
        except ValidationError as exc:
            last_err = str(exc)

    raise ChartInterpretError(
        f"Could not turn that into a chart. {last_err}", code="invalid"
    )
