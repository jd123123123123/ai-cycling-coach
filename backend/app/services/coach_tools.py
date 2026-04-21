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

from datetime import date, datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.coach_brief import CoachBrief
from app.models.planned_workout import PlannedWorkout
from app.services.analytical_aggregates import (
    activity_summary,
    ftp_progression_summary,
    pmc_window_summary,
    recovery_trend_summary,
)
from app.services.workout_modifier import apply_modification, revert_from_audit


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
    {
        "name": "modify_planned_workout",
        "description": (
            "Modify the athlete's planned workout for a given date. Use this tool "
            "when the user expresses a modification intent in chat: "
            "'I only have X min today' → shorten (with params.duration_min=X); "
            "'can I go longer?' → lengthen (with params.duration_min=N); "
            "'make it harder' / 'push me today' → harder; "
            "'easier' / 'go lighter' → easier; "
            "'swap to indoor' / 'trainer ride' → indoor. "
            "The backend re-applies safety rails automatically: if the "
            "modification would violate injury_flag or intensity_ceiling, the "
            "tool_result returns rails_downgraded=True with a 'reason' string — "
            "you MUST narrate that downgrade honestly to the user (never pretend "
            "the original request succeeded). If the athlete has already trained "
            "today, the tool returns {success: false, reason: 'Already trained "
            "today — nothing to modify.'} — acknowledge warmly and suggest "
            "recovery instead."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "format": "date",
                    "description": "ISO date YYYY-MM-DD of the workout to modify.",
                },
                "modification_type": {
                    "type": "string",
                    "enum": ["shorten", "lengthen", "harder", "easier", "indoor"],
                    "description": (
                        "shorten / lengthen → change duration (requires "
                        "params.duration_min). harder / easier → walk the "
                        "template cascade. indoor → swap to trainer without "
                        "changing template or watts."
                    ),
                },
                "params": {
                    "type": "object",
                    "description": (
                        "Type-specific parameters. shorten/lengthen require "
                        "{duration_min: int}. harder/easier/indoor accept {}."
                    ),
                    "properties": {
                        "duration_min": {
                            "type": "integer",
                            "minimum": 10,
                            "maximum": 360,
                            "description": "Requested new duration in minutes (10-360).",
                        },
                    },
                    "additionalProperties": True,
                },
            },
            "required": ["date", "modification_type"],
        },
    },
    {
        "name": "undo_last_modification",
        "description": (
            "Undo the MOST RECENT workout modification in the current chat "
            "session. Call this when the user says 'undo that', 'revert', "
            "'go back', 'never mind', 'put it back', or otherwise asks to "
            "reverse the last workout change. Only modifications made within "
            "the last 60 minutes are eligible; older ones are out of reach "
            "(intended to be session-scoped). Returns "
            "{found: False, reason: ...} when there's nothing to undo OR when "
            "the latest modification has already been undone. After a "
            "successful undo, narrate what was restored ('Reverted your "
            "Tuesday back to VO2 5x4 at 75min') — the PlannedWorkout is "
            "byte-identical to its pre-modification state and a compensating "
            "audit row has been written (the original audit row is preserved)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
            "required": [],
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
# modify_planned_workout — the single write tool (Phase 6.2)
# ======================================================================
#
# This is the only tool that MUTATES state. Security invariants it must
# preserve (each one is exercised in tests):
#
#   1. User-scoping: the authenticated user_id from the dispatcher is the
#      ONLY identity used to look up the PlannedWorkout. Any user_id key in
#      tool_input is already stripped by dispatch_tool.
#   2. Already-trained-today rejection: if an Activity exists on the target
#      date, the tool returns {success: False, reason: ...} — NO PlannedWorkout
#      mutation, NO audit row. Mirrors resolve_and_prescribe's post_ride guard.
#   3. Rails precedence (injury > ceiling > intent): handled inside
#      apply_modification. We read rails_context from the snapshot.
#   4. Append-only audit: every successful modification writes a CoachBrief
#      row with verdict='modification' and evidence.modification = full
#      before/after/reason payload. The row is IMMUTABLE — we never update
#      it later.
#   5. Transaction atomicity: PlannedWorkout update + CoachBrief insert happen
#      in one session.commit(). If either fails, the whole modification rolls
#      back (no half-applied state).

_SUCCESS_TEMPLATE_DEFAULT = "z2_endurance_60"


async def _get_planned_workout_for_user(
    user_id: int, target: date, db: AsyncSession,
) -> PlannedWorkout | None:
    result = await db.execute(
        select(PlannedWorkout)
        .where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date == target,
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _has_activity_on(
    user_id: int, target: date, db: AsyncSession,
) -> bool:
    """True when the user has at least one completed Activity on ``target``.

    We date-compare against started_at cast to DATE so an activity that spans
    midnight in local time counts for the day it started.
    """
    from sqlalchemy import cast, Date as SqlDate
    result = await db.execute(
        select(Activity.id)
        .where(
            Activity.user_id == user_id,
            cast(Activity.started_at, SqlDate) == target,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


def _build_user_snapshot_from_profile(profile: AthleteProfile | None) -> dict:
    """Minimal snapshot for the modifier.

    The full build_snapshot() call would be overkill for a modification — we
    only need intensity_ceiling + injury_flag. Ceiling is derived from the
    profile's injury_flag in the degenerate (no brief yet) path; the more
    accurate ceiling from the latest brief's rails_context is used when
    available.
    """
    if profile is None:
        return {
            "intensity_ceiling": "push",
            "injury_flag": False,
        }
    return {
        "intensity_ceiling": "push" if not profile.injury_flag else "rest",
        "injury_flag": bool(profile.injury_flag),
    }


async def _load_rails_context(
    user_id: int, profile: AthleteProfile | None, db: AsyncSession,
) -> dict:
    """Read the latest brief's rails_context if available — it has the real
    intensity_ceiling derived from HRV/TSB/days_since_rest.
    Falls back to the degenerate profile-only snapshot."""
    result = await db.execute(
        select(CoachBrief)
        .where(CoachBrief.user_id == user_id)
        .order_by(CoachBrief.generated_at.desc())
        .limit(1)
    )
    latest = result.scalar_one_or_none()

    base = _build_user_snapshot_from_profile(profile)
    if latest and isinstance(latest.evidence, dict):
        rails_ctx = latest.evidence.get("rails_context")
        if isinstance(rails_ctx, dict):
            base["intensity_ceiling"] = rails_ctx.get(
                "intensity_ceiling", base["intensity_ceiling"]
            )
            # Injury from profile trumps the brief (profile is real-time state)
            if "injury_flag" in rails_ctx and not base["injury_flag"]:
                base["injury_flag"] = bool(rails_ctx["injury_flag"])
    return base


async def _handle_modify_planned_workout(
    tool_input: dict, user_id: int, db: AsyncSession,
) -> dict:
    """Apply a modification to the user's planned workout on ``date``.

    Returns a dict the LLM narrates to the user. See the security invariants
    block above for the guarantees this handler enforces.
    """
    target = _parse_date(tool_input.get("date"), "date")
    modification_type = tool_input.get("modification_type")
    if not modification_type:
        raise ValueError("modification_type is required")
    params = tool_input.get("params") or {}
    if not isinstance(params, dict):
        raise ValueError("params must be an object")

    # 1. Load the planned workout (user-scoped)
    pw = await _get_planned_workout_for_user(user_id, target, db)
    if pw is None:
        return {
            "success": False,
            "found": False,
            "reason": f"No planned workout on {target.isoformat()}.",
        }

    # 2. Already-trained-today guard — only bites when target is TODAY
    today = datetime.now(timezone.utc).date()
    if target == today:
        if await _has_activity_on(user_id, target, db):
            return {
                "success": False,
                "reason": "Already trained today — nothing to modify.",
                "date": target.isoformat(),
            }

    # 3. Load profile for FTP + build snapshot for rails
    profile_result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()
    ftp_w = int((profile.ftp_watts if profile else 0) or 0)
    if ftp_w <= 0:
        return {
            "success": False,
            "reason": (
                "Cannot modify workout: athlete FTP is not set. "
                "Update the profile with a current FTP first."
            ),
        }

    snapshot = await _load_rails_context(user_id, profile, db)

    # 4. Coerce the PlannedWorkout into the shape apply_modification expects.
    #    (template_id + duration_min in MINUTES — the ORM carries seconds.)
    duration_min = int(
        round((pw.duration_seconds_target or 0) / 60)
    ) if pw.duration_seconds_target else 60

    # Build a lightweight view over the ORM row so we don't have to teach the
    # modifier about every column. Using types.SimpleNamespace keeps the
    # modifier module pure (no ORM coupling).
    from types import SimpleNamespace
    pw_view = SimpleNamespace(
        id=pw.id,
        user_id=pw.user_id,
        template_id=pw.template_id or _SUCCESS_TEMPLATE_DEFAULT,
        duration_min=duration_min,
        indoor=bool(pw.indoor),
        blocks=pw.interval_structure,
        sport=pw.sport,
        title=pw.title,
    )

    try:
        result = apply_modification(
            pw_view,
            modification_type,
            params,
            snapshot,
            ftp_w,
        )
    except ValueError as exc:
        # Surface as a normal tool_result (not is_error) so the LLM can
        # apologise to the user instead of Claude retrying blindly.
        return {
            "success": False,
            "reason": str(exc),
        }

    # 5. Persist the mutation + the audit row in ONE transaction
    pw.template_id = result.template_id
    pw.duration_seconds_target = int(result.duration_min * 60)
    pw.indoor = result.indoor
    pw.blocks_source = "user_modified"
    pw.interval_structure = {"intervals": result.blocks, "source": "user_modified"}
    # Update title + description to reflect the modification when we have
    # template metadata — keeps the calendar card in sync with the change.
    meta_title = result.metadata.get("title")
    if meta_title:
        pw.title = meta_title

    audit = CoachBrief(
        user_id=user_id,
        verdict="modification",
        rationale=(
            f"User modified {target.isoformat()} workout via chat: "
            f"{modification_type}"
            + (f" (duration_min={params.get('duration_min')})"
               if params.get("duration_min") is not None else "")
        ),
        evidence={
            "modification": {
                "date": target.isoformat(),
                "modification_type": modification_type,
                "params": params,
                "before": result.before,
                "after": {
                    "template_id": result.template_id,
                    "duration_min": result.duration_min,
                    "indoor": result.indoor,
                    "predicted_tss": result.predicted_tss,
                },
                "rails_downgraded": result.rails_downgraded,
                "reason": result.reason,
            },
            "language": snapshot.get("language", "simple"),
            "rails_context_at_time": {
                "intensity_ceiling": snapshot.get("intensity_ceiling"),
                "injury_flag": snapshot.get("injury_flag"),
            },
        },
        model_used="tool-use-modify",
    )
    db.add(audit)
    await db.commit()

    return {
        "success": True,
        "date": target.isoformat(),
        "modification_type": modification_type,
        "template_id": result.template_id,
        "duration_min": result.duration_min,
        "indoor": result.indoor,
        "rails_downgraded": result.rails_downgraded,
        "reason": result.reason,
        "before": result.before,
        "predicted_tss": result.predicted_tss,
        "title": result.metadata.get("title"),
        "framework_cited": result.metadata.get("framework_cited"),
    }


# ======================================================================
# undo_last_modification — compensating write tool (Phase 6-04)
# ======================================================================
#
# Session-scoped semantics:
#   - Eligible window: 60 minutes (default). Anything older is out of reach.
#   - Session-scoping on the client side is done by rendering Undo only on
#     the LATEST modification card in the ephemeral CoachChat drawer. The
#     SERVER additionally enforces the 60-min cutoff so a stale UI cannot
#     reach back into a prior session.
#
# Append-only invariant (from 05-01 + 06-02):
#   - Original ``verdict='modification'`` row is NEVER mutated.
#   - Undo writes a NEW ``verdict='modification_undo'`` row with
#     evidence.modification_undo.original_audit_id pointing at the reverted
#     row. A second SELECT on that column is how we detect already-undone.

_UNDO_WINDOW_MINUTES = 60


async def _handle_undo_last_modification(
    tool_input: dict, user_id: int, db: AsyncSession,
) -> dict:
    """Undo the most recent modification for this user (within the 60-min
    window) by delegating to revert_from_audit. Returns found=False when
    there is nothing eligible or when the row has already been undone."""
    # tool_input is intentionally empty; ignore any keys the LLM supplied.
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=_UNDO_WINDOW_MINUTES)

    # 1. Find the most-recent modification audit row for this user within window.
    latest_stmt = (
        select(CoachBrief)
        .where(
            CoachBrief.user_id == user_id,
            CoachBrief.verdict == "modification",
            CoachBrief.generated_at >= cutoff,
        )
        .order_by(CoachBrief.generated_at.desc())
        .limit(1)
    )
    latest = (await db.execute(latest_stmt)).scalar_one_or_none()
    if latest is None:
        return {
            "found": False,
            "reason": "No modifications in the last hour to undo.",
        }

    # 2. Check if this row has already been undone.
    #    We match on evidence.modification_undo.original_audit_id == str(latest.id).
    already_stmt = (
        select(CoachBrief)
        .where(
            CoachBrief.user_id == user_id,
            CoachBrief.verdict == "modification_undo",
            CoachBrief.evidence["modification_undo"]["original_audit_id"].astext
            == str(latest.id),
        )
        .limit(1)
    )
    already = (await db.execute(already_stmt)).scalar_one_or_none()
    if already is not None:
        return {
            "found": False,
            "reason": "That modification has already been undone.",
        }

    # 3. Load FTP for re-materialisation.
    profile_result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()
    ftp_w = int((profile.ftp_watts if profile else 0) or 0)
    if ftp_w <= 0:
        return {
            "found": False,
            "reason": (
                "Cannot undo: athlete FTP is not set. Update the profile "
                "with a current FTP first."
            ),
        }

    # 4. Delegate to the pure(r) reverter — it handles PW restore + audit append.
    try:
        result = await revert_from_audit(latest, db, ftp_w=ftp_w)
    except ValueError as exc:
        return {
            "found": False,
            "reason": str(exc),
        }

    mod = latest.evidence.get("modification", {}) if isinstance(latest.evidence, dict) else {}
    return {
        "success": True,
        "found": True,
        "date": mod.get("date"),
        "restored_template_id": result.template_id,
        "restored_duration_min": result.duration_min,
        "reverted_from": result.before,  # post-mod state, now rolled back
        "title": result.metadata.get("title"),
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
    "modify_planned_workout": _handle_modify_planned_workout,
    "undo_last_modification": _handle_undo_last_modification,
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
