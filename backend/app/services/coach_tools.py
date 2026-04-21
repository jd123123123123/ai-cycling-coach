"""Tool registry + dispatcher for the Claude tool-use loop in /coach/chat.

Claude receives the `TOOL_SCHEMAS` list as the `tools=` parameter on
`messages.create`. When the model picks a tool, the caller invokes
`dispatch_tool(name, tool_input, user_id, db)` to run the actual handler and
feeds the result back as a `tool_result` block.

Security invariant — STRICT
    The authenticated user_id is the ONE accepted in the dispatcher signature.
    `tool_input` may carry keys named `user_id`, `uid`, `owner_id`, etc. — the
    dispatcher IGNORES them. A compromised LLM cannot spoof identity.

Clamps (defense-in-depth — schemas also advertise ranges)
    - fetch_recovery_trend.days    → [1, 90]
    - fetch_recent_activities.limit → [1, 50]

All handlers are async so they can share the caller's AsyncSession (already
RLS-scoped via get_db_for_user).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.planned_workout import PlannedWorkout
from app.services.analytical_aggregates import (
    activity_summary,
    ftp_progression_summary,
    pmc_window_summary,
    recovery_trend_summary,
)


# ======================================================================
# Tool schemas — Anthropic tools= format
# ======================================================================
#
# Descriptions are LOAD-BEARING: Claude picks tools based on them. Each
# description names the question patterns the tool answers.
# ======================================================================

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "fetch_pmc_window",
        "description": (
            "Get per-day CTL (fitness), ATL (fatigue), and TSB (form) plus daily TSS "
            "for a date range. Use this when the user asks about training-load "
            "progression, fitness trends, 'last N weeks', or whether they are "
            "building / freshening / overreaching. Returns aggregate averages, "
            "ramp rate, and a direction classification."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {
                    "type": "string",
                    "format": "date",
                    "description": "ISO date YYYY-MM-DD (window start, inclusive).",
                },
                "end_date": {
                    "type": "string",
                    "format": "date",
                    "description": "ISO date YYYY-MM-DD (window end, inclusive).",
                },
            },
            "required": ["start_date", "end_date"],
        },
    },
    {
        "name": "fetch_recovery_trend",
        "description": (
            "Get per-day sleep, HRV, resting HR, and body battery across the last N "
            "days, with aggregate averages and recovery flags (low_hrv, sleep_debt, "
            "rhr_elevated). Use this when the user asks 'why am I tired?', 'how's "
            "my recovery?', or about sleep/HRV trends. Default days=14."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 90,
                    "description": "Window size in days. Clamped server-side to [1, 90].",
                },
            },
            "required": [],
        },
    },
    {
        "name": "fetch_recent_activities",
        "description": (
            "Get the most-recent N activities with duration, TSS, Intensity Factor, "
            "EF (W/bpm), decoupling %, and zone classification. Use this when the "
            "user asks about specific workouts, 'my last ride', or for patterns in "
            "recent training. Optionally filter by sport (cycling|running|gym). "
            "Default limit=10; clamped to [1, 50]."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 50,
                    "description": "Number of activities to return (most recent first).",
                },
                "sport_filter": {
                    "type": "string",
                    "enum": ["cycling", "running", "gym"],
                    "description": "Optional sport filter. Omit for all sports.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "fetch_ftp_history",
        "description": (
            "Get the athlete's FTP history with 30-day and 90-day deltas plus a "
            "trend label (improving|stable|declining). Use this when the user asks "
            "about FTP trends, fitness gains, or 'how's my FTP trending?'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "fetch_planned_workout",
        "description": (
            "Get the athlete's planned workout for a specific date (if any). "
            "Returns {found: false} when no workout is scheduled. Use this when "
            "the user asks 'what's planned for Tuesday?' or 'do I have a workout "
            "tomorrow?'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "format": "date",
                    "description": "ISO date YYYY-MM-DD.",
                },
            },
            "required": ["date"],
        },
    },
]


# ======================================================================
# Input helpers
# ======================================================================

def _parse_date(value: Any, field_name: str) -> date:
    if value is None:
        raise ValueError(f"Missing required field: {field_name}")
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except (ValueError, TypeError) as e:
            raise ValueError(
                f"Invalid {field_name}: expected YYYY-MM-DD, got {value!r}"
            ) from e
    raise ValueError(f"Invalid {field_name}: expected ISO date string, got {type(value).__name__}")


def _clamp(value: Any, lo: int, hi: int, default: int) -> int:
    try:
        n = int(value) if value is not None else default
    except (TypeError, ValueError):
        n = default
    return max(lo, min(hi, n))


# ======================================================================
# Per-tool handlers
# ======================================================================

async def _handle_fetch_pmc_window(
    tool_input: dict, user_id: int, db: AsyncSession,
) -> dict:
    start = _parse_date(tool_input.get("start_date"), "start_date")
    end = _parse_date(tool_input.get("end_date"), "end_date")
    if end < start:
        raise ValueError(
            f"end_date ({end.isoformat()}) must be on or after start_date ({start.isoformat()})"
        )
    return await pmc_window_summary(
        user_id=user_id, start_date=start, end_date=end, db=db,
    )


async def _handle_fetch_recovery_trend(
    tool_input: dict, user_id: int, db: AsyncSession,
) -> dict:
    days = _clamp(tool_input.get("days"), lo=1, hi=90, default=14)
    return await recovery_trend_summary(user_id=user_id, days=days, db=db)


async def _handle_fetch_recent_activities(
    tool_input: dict, user_id: int, db: AsyncSession,
) -> dict:
    limit = _clamp(tool_input.get("limit"), lo=1, hi=50, default=10)
    sport = tool_input.get("sport_filter")
    if sport is not None and sport not in ("cycling", "running", "gym"):
        # Silently ignore unrecognised filter — treat as 'any sport' so the LLM
        # isn't blocked by a typo. This is lenient by design; alternative
        # would be to raise ValueError.
        sport = None
    return await activity_summary(
        user_id=user_id, limit=limit, sport_filter=sport, db=db,
    )


async def _handle_fetch_ftp_history(
    tool_input: dict, user_id: int, db: AsyncSession,
) -> dict:
    # tool_input intentionally ignored — no parameters
    return await ftp_progression_summary(user_id=user_id, db=db)


async def _handle_fetch_planned_workout(
    tool_input: dict, user_id: int, db: AsyncSession,
) -> dict:
    target = _parse_date(tool_input.get("date"), "date")
    result = await db.execute(
        select(PlannedWorkout)
        .where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date == target,
        )
        .limit(1)
    )
    pw = result.scalar_one_or_none()
    if pw is None:
        return {"found": False}
    return {
        "found": True,
        "id": pw.id,
        "title": pw.title,
        "sport": pw.sport,
        "scheduled_date": target.isoformat(),
        "target_duration_seconds": pw.duration_seconds_target,
        "description": pw.description,
        "blocks": pw.interval_structure or {"intervals": []},
    }


# ======================================================================
# Registry + dispatcher
# ======================================================================

ToolHandler = Callable[[dict, int, AsyncSession], Awaitable[dict]]

TOOL_REGISTRY: dict[str, ToolHandler] = {
    "fetch_pmc_window": _handle_fetch_pmc_window,
    "fetch_recovery_trend": _handle_fetch_recovery_trend,
    "fetch_recent_activities": _handle_fetch_recent_activities,
    "fetch_ftp_history": _handle_fetch_ftp_history,
    "fetch_planned_workout": _handle_fetch_planned_workout,
}


async def dispatch_tool(
    tool_name: str,
    tool_input: dict,
    user_id: int,
    db: AsyncSession,
) -> dict:
    """Route a Claude tool_use block to its handler.

    Security: `user_id` comes from the authenticated request. Any user_id-like
    key in `tool_input` is ignored (never passed through to handlers).
    """
    handler = TOOL_REGISTRY.get(tool_name)
    if handler is None:
        available = sorted(TOOL_REGISTRY.keys())
        raise ValueError(
            f"Unknown tool: {tool_name!r}. Available tools: {available}"
        )

    # Defensive strip: drop user_id-like keys from tool_input before handler sees it.
    safe_input = {
        k: v for k, v in (tool_input or {}).items()
        if k not in ("user_id", "uid", "owner_id", "userId")
    }

    return await handler(safe_input, user_id, db)
