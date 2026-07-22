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

import re
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
from app.services.workout_templates import TEMPLATES


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
    {
        "name": "present_answer",
        "description": (
            "Emit your FINAL analytical answer as a structured card and END the "
            "turn. Call this INSTEAD of writing a prose paragraph once you have "
            "the numbers you need. It takes a short row of grounded fact chips "
            "(0-4) plus a 1-2 sentence verdict. Every chip value MUST come from "
            "a data tool you already called this turn — never invent numbers. "
            "When you have no data, pass facts:[] and an honest summary "
            "(keep the '—' ethic — do not fabricate). Do NOT call this when the "
            "user explicitly asks WHY / for the reasoning — answer those as "
            "normal streamed prose instead."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "facts": {
                    "type": "array",
                    "maxItems": 4,
                    "description": (
                        "0-4 grounded stat chips chosen for THIS question. "
                        "Empty when no data is available."
                    ),
                    "items": {
                        "type": "object",
                        "required": ["label", "value"],
                        "properties": {
                            "label": {
                                "type": "string",
                                "description": "Short chip label, e.g. 'Ruhepuls', 'Schlaf'.",
                            },
                            "value": {
                                "description": "String or number, e.g. 48 or '33/100'.",
                                "type": ["number", "string"],
                            },
                            "unit": {
                                "type": "string",
                                "description": "Optional unit, e.g. 'bpm', 'h', '/100'.",
                            },
                            "tone": {
                                "type": "string",
                                "enum": ["good", "caution", "neutral"],
                                "description": "Drives chip colour. Default neutral.",
                            },
                        },
                    },
                },
                "summary": {
                    "type": "string",
                    "description": "1-2 sentence verdict. Terse. No prose blob.",
                },
            },
            "required": ["summary"],
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
# Free-text → adjustment intent parser (LLM-free fast-path)
# ======================================================================
#
# Maps DE + EN natural-language plan-change requests to the SAME structured
# intents the /coach/plan/preview endpoint already understands (shorten /
# easier / harder / indoor / lengthen, day- or week-scope). This is what lets a
# typed request ("nur 45 min heute", "mach die Woche leichter", "make it
# harder", "indoor") produce a concrete Proposal Card WITHOUT the LLM — and it
# stays additive: when Anthropic credits return, the chat tool-use loop can
# still drive the exact same functions.
#
# Returns a dict {modification_type, params, scope} or None when the text
# carries no actionable adjustment (the caller then falls back to plain chat).

# Duration clamp shared with the modify tool schema (10-360 min).
_DURATION_MIN, _DURATION_MAX = 10, 360

# Signal vocabularies — lowercased, accent-tolerant substrings. DE + EN.
_WEEK_WORDS = ("woche", "wochen", "week", "this week", "diese woche")

_EASIER_WORDS = (
    # DE
    "leichter", "lockerer", "locker", "einfacher", "ruhiger", "sanfter",
    "weniger intensiv", "zu hart", "zu anstrengend", "zu schwer", "entspannter",
    "schonen", "schonender", "runterfahren", "runter fahren", "reduzieren",
    # EN
    "easier", "lighter", "easy", "go light", "go easy", "take it easy",
    "less intense", "too hard", "too tough", "tone it down", "ease off",
    "ease up", "dial it back", "dial back", "back off", "recover",
)

_HARDER_WORDS = (
    # DE
    "härter", "harter", "schwerer", "intensiver", "anstrengender",
    "mehr fordern", "fordere mich", "fordern", "gib mir mehr", "mehr gas",
    "zu leicht", "zu einfach", "push mich",
    # EN
    "harder", "tougher", "more intense", "push me", "push harder",
    "challenge me", "make it harder", "too easy", "step it up", "crank it up",
)

_INDOOR_WORDS = (
    # DE
    "drinnen", "auf der rolle", "auf die rolle", "rolle", "smart trainer",
    "indoor", "in die halle", "drin", "zwift", "rollentrainer", "ergometer",
    # EN
    "indoor", "on the trainer", "on the turbo", "turbo", "trainer ride",
    "smart trainer", "inside", "zwift", "rollers",
)

_SHORTEN_WORDS = (
    # DE
    "kürzer", "kurzer", "kürzen", "kurz", "weniger zeit", "keine zeit",
    "wenig zeit", "nicht viel zeit", "schneller fertig", "abkürzen",
    "verkürzen", "knapp zeit",
    # EN
    "shorter", "shorten", "less time", "no time", "short on time",
    "not much time", "quick one", "quicker", "cut it short", "cut short",
)

_LENGTHEN_WORDS = (
    # DE
    "länger", "langer", "mehr zeit", "verlängern", "ausdehnen", "extra zeit",
    # EN
    "longer", "lengthen", "more time", "extend", "make it longer",
)

# Bare-shorten fallback duration when the user says "shorter"/"less time"
# without a number — mirrors the "Adjust plan" chip default (45 min).
_DEFAULT_SHORTEN_MIN = 45


def _parse_duration_minutes(text: str) -> int | None:
    """Best-effort minutes from a free-text phrase. Understands DE + EN:
    '45 min', '45min', '90 minuten', '1h', '1 std', '1,5h', '1.5 hours',
    'eine stunde', 'halbe stunde', 'half an hour'. Returns clamped minutes or
    None."""
    t = text.lower()

    # Worded hours/half-hours first (no digit to key off).
    if re.search(r"\b(halbe?\s+stunde|half\s+an?\s+hour|half\s+hour)\b", t):
        return 30
    if re.search(r"\b(anderthalb\s+stunden?|one\s+and\s+a\s+half\s+hours?)\b", t):
        return 90
    if re.search(r"\b(eine\s+stunde|an?\s+hour|one\s+hour)\b", t):
        return 60
    if re.search(r"\bzwei\s+stunden\b|\btwo\s+hours\b", t):
        return 120

    # Fractional hours: "1,5h" / "1.5 hours" / "1,5 std".
    frac = re.search(r"(\d+)[.,](\d+)\s*(h|hr|hrs|std|stunden?|hours?)\b", t)
    if frac:
        whole, dec = int(frac.group(1)), frac.group(2)
        minutes = whole * 60 + int(round(float(f"0.{dec}") * 60))
        return max(_DURATION_MIN, min(_DURATION_MAX, minutes))

    # Whole hours: "1h" / "2 hours" / "1 std".
    hrs = re.search(r"(\d+)\s*(h|hr|hrs|std|stunden?|hours?)\b", t)
    if hrs:
        minutes = int(hrs.group(1)) * 60
        return max(_DURATION_MIN, min(_DURATION_MAX, minutes))

    # Minutes: "45 min" / "45min" / "90 minuten" / "30'".
    mins = re.search(r"(\d+)\s*(min\b|min\.|mins\b|minute[ns]?\b|minutes\b|')", t)
    if mins:
        minutes = int(mins.group(1))
        return max(_DURATION_MIN, min(_DURATION_MAX, minutes))

    return None


def _has_any(text: str, words: tuple[str, ...]) -> bool:
    return any(w in text for w in words)


def parse_adjustment_intent(text: str, locale: str = "en") -> dict | None:
    """Rule-based free-text → plan-adjustment intent.

    Returns {"modification_type", "params", "scope"} or None when the text
    isn't an actionable adjustment. `locale` is accepted for symmetry with the
    LLM path but the matcher is bilingual, so it only tips a couple of genuinely
    ambiguous ties — the vocabularies cover DE + EN regardless.

    Priority (first match wins):
        1. week-scope easier  ("leichtere/ruhigere Woche", "make the week easier")
        2. harder             ("härter", "make it harder", "push me")
        3. indoor             ("drinnen", "auf der Rolle", "on the trainer")
        4. shorten            (explicit duration, or "kürzer"/"weniger Zeit")
        5. lengthen           ("länger", "more time")  — needs a duration
        6. easier (day)       ("leichter", "lockerer", "too hard")
    """
    if not text or not isinstance(text, str):
        return None
    t = f" {text.lower().strip()} "  # pad so word-boundary substrings match at ends

    week = _has_any(t, _WEEK_WORDS)
    easier = _has_any(t, _EASIER_WORDS)
    harder = _has_any(t, _HARDER_WORDS)
    indoor = _has_any(t, _INDOOR_WORDS)
    shorten = _has_any(t, _SHORTEN_WORDS)
    lengthen = _has_any(t, _LENGTHEN_WORDS)
    duration = _parse_duration_minutes(t)

    # 1. Week-scope easier — a week word paired with any "ease" signal (or an
    #    explicit "easier week" phrase). Whole-week trims outrank a day change.
    if week and (easier or shorten):
        return {"modification_type": "easier", "params": {}, "scope": "week"}

    # 2. Harder — an explicit intensity bump.
    if harder:
        return {"modification_type": "harder", "params": {}, "scope": "day"}

    # 3. Indoor — swap to the trainer without changing the session shape.
    if indoor:
        return {"modification_type": "indoor", "params": {}, "scope": "day"}

    # 4. Shorten — either an explicit duration or a "less time" signal. A bare
    #    duration ("nur 45 min heute") is read as shorten-to-that-duration.
    if duration is not None and not lengthen:
        return {
            "modification_type": "shorten",
            "params": {"duration_min": duration},
            "scope": "day",
        }
    if shorten:
        return {
            "modification_type": "shorten",
            "params": {"duration_min": duration or _DEFAULT_SHORTEN_MIN},
            "scope": "day",
        }

    # 5. Lengthen — needs a target duration to be meaningful; a bare "länger"
    #    with no number can't be materialised, so treat as non-actionable.
    if lengthen and duration is not None:
        return {
            "modification_type": "lengthen",
            "params": {"duration_min": duration},
            "scope": "day",
        }

    # 6. Easier (day scope).
    if easier:
        return {"modification_type": "easier", "params": {}, "scope": "day"}

    return None


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
    """Chat-tool wrapper: parse tool_input, delegate to the ONE shared
    modification pipeline (`modify_planned_workout_for_user`). The direct
    REST endpoint (POST /workouts/today/modify) calls the same function —
    rails, PlannedWorkout write, audit row, feed row and cache invalidation
    are never copy-pasted."""
    target = _parse_date(tool_input.get("date"), "date")
    modification_type = tool_input.get("modification_type")
    if not modification_type:
        raise ValueError("modification_type is required")
    params = tool_input.get("params") or {}
    if not isinstance(params, dict):
        raise ValueError("params must be an object")
    return await modify_planned_workout_for_user(
        user_id=user_id,
        target=target,
        modification_type=modification_type,
        params=params,
        db=db,
    )


def _feed_messages(
    *,
    before_title: str | None,
    before_duration_min: int,
    after_title: str | None,
    after_duration_min: int,
) -> tuple[str, str]:
    """No-guilt bilingual feed copy for a user-initiated modification.

    Register (plan_adaptation_log contract): state the change plainly, the
    plan works FOR the athlete — never scold, never warn."""
    b = before_title or "Einheit"
    a = after_title or "Einheit"
    if b == a:
        de = f"Du hast angepasst: {a} — jetzt {after_duration_min} min."
        en = f"You adjusted: {a} — now {after_duration_min} min."
    else:
        de = (
            f"Du hast angepasst: {b} → {a} ({after_duration_min} min). "
            "Der Plan rechnet ab jetzt damit."
        )
        en = (
            f"You adjusted: {b} → {a} ({after_duration_min} min). "
            "The plan counts on it from here."
        )
    return de, en


async def modify_planned_workout_for_user(
    *,
    user_id: int,
    target: date,
    modification_type: str,
    params: dict,
    db: AsyncSession,
) -> dict:
    """THE shared modification pipeline (chat tool + REST endpoint).

    Applies a user-intent modification to the PlannedWorkout on ``target``:
    rails context → apply_modification → PlannedWorkout write
    (blocks_source='user_modified' — a PROTECTED source the hourly adaptation
    engine never auto-mutates, D8) → CoachBrief audit row (undo window) →
    plan_adaptations feed row (source='user_change') → personalized-week
    cache invalidation. One transaction; see the security invariants block
    above.
    """
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

    # 5. Persist the mutation + the audit row + the feed row in ONE transaction
    before_title = pw.title
    before_tss = None
    if isinstance(pw.interval_structure, dict):
        # best-effort: some rows carry a predicted TSS in their structure
        before_tss = pw.interval_structure.get("predicted_tss")
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

    # Feed row — the athlete-visible adaptation timeline (Today slim card +
    # Plan timeline render message_de/message_en verbatim, no-guilt register).
    # source='user_change' per plan_adaptations vocabulary; same transaction
    # as the PlannedWorkout write + audit row.
    from app.services.plan_adaptation_log import log_adaptation

    message_de, message_en = _feed_messages(
        before_title=before_title,
        before_duration_min=int(result.before.get("duration_min") or 0),
        after_title=result.metadata.get("title") or before_title,
        after_duration_min=result.duration_min,
    )
    await log_adaptation(
        db,
        user_id,
        target_date=target,
        source="user_change",
        signal="user_change",
        rule="user_modified",
        message_de=message_de,
        message_en=message_en,
        before={
            "date": target.isoformat(),
            "template_id": result.before.get("template_id"),
            "title": before_title,
            "duration_min": result.before.get("duration_min"),
            "target_tss": before_tss,
        },
        after={
            "date": target.isoformat(),
            "template_id": result.template_id,
            "title": result.metadata.get("title"),
            "duration_min": result.duration_min,
            "target_tss": result.predicted_tss,
        },
        evidence={
            "modification_type": modification_type,
            "params": params,
            "rails_downgraded": result.rails_downgraded,
            "reason": result.reason,
        },
        commit=False,
    )
    await db.commit()
    # The personalized-week cache still holds the pre-modification week.
    from app.api.weeks import invalidate_personalized_week_cache

    invalidate_personalized_week_cache(user_id)

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
# Propose-before-apply — dry-run preview (V3 AI Coach Proposal Card)
# ======================================================================
#
# preview_modification_for_user mirrors modify_planned_workout_for_user's
# resolution (rails snapshot → apply_modification) but PERSISTS NOTHING. It
# returns a concrete, visualisable before→after: both sessions materialised
# with BlockBars-ready blocks, TSS / duration / intensity deltas, week-load
# impact, and a plain bilingual rationale. Accept re-runs the intent through
# the audited apply pipeline. apply_modification is pure and we operate on a
# SimpleNamespace view, so the ORM row is never touched here.

import math as _math

# Intensity days the "easier week" sweep steps down (endurance/recovery/rest
# are already gentle — leaving them keeps the week's shape, only trims the hard
# efforts, matching the pen rationale "trims intensity, keeps the load").
_INTENSITY_CATEGORIES = {"tempo", "sweet_spot", "threshold", "vo2"}


def _if_from_tss(tss: float, duration_min: int) -> float | None:
    """Intensity Factor back-computed from TSS + duration (TSS = hrs·IF²·100)."""
    hours = (duration_min or 0) / 60.0
    if hours <= 0 or tss <= 0:
        return None
    return round(_math.sqrt(tss / (100.0 * hours)), 2)


def _session_label(title: str | None, template_id: str, duration_min: int) -> str:
    base = title or template_id.replace("_", " ").title()
    return f"{base} · {duration_min} min"


def _materialize_session(
    *, template_id: str, ftp_w: int, duration_min: int | None, indoor: bool,
    date_iso: str, title_override: str | None = None,
) -> dict:
    """Materialise ONE session into the ProposalSession dict shape (blocks +
    load numbers). Pure — reuses the modifier's template materialiser."""
    from app.services.workout_modifier import materialize_template
    tid = template_id if template_id in TEMPLATES else _SUCCESS_TEMPLATE_DEFAULT
    blocks, dur, tss, metadata = materialize_template(tid, ftp_w, duration_min, indoor)
    title = title_override or metadata.get("title")
    return {
        "date": date_iso,
        "template_id": tid,
        "title": title,
        "label": _session_label(title, tid, dur),
        "duration_min": dur,
        "predicted_tss": round(float(tss), 1),
        "intensity_factor": _if_from_tss(float(tss), dur),
        "indoor": bool(indoor),
        "blocks": blocks,
    }


async def _week_planned_tss(
    user_id: int, monday: date, sunday: date, ftp_w: int, db: AsyncSession,
) -> float | None:
    """Best-effort sum of materialised planned TSS across [monday, sunday].
    Returns None when the week can't be resolved (honest '—')."""
    try:
        rows = await db.execute(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.date >= monday,
                PlannedWorkout.date <= sunday,
            )
        )
        pws = list(rows.scalars().all())
    except Exception:  # noqa: BLE001 — mocked/degenerate session: degrade gracefully
        return None
    if not pws:
        return None
    total = 0.0
    for pw in pws:
        dur = int(round((pw.duration_seconds_target or 0) / 60)) or 60
        try:
            _b, _d, tss, _m = _materialize_via_template(
                pw.template_id or _SUCCESS_TEMPLATE_DEFAULT, ftp_w, dur, bool(pw.indoor)
            )
            total += float(tss)
        except Exception:  # noqa: BLE001
            continue
    return round(total, 1)


def _materialize_via_template(template_id, ftp_w, duration_min, indoor):
    from app.services.workout_modifier import materialize_template
    tid = template_id if template_id in TEMPLATES else _SUCCESS_TEMPLATE_DEFAULT
    return materialize_template(tid, ftp_w, duration_min, indoor)


def _proposal_rationale(
    *, modification_type: str, before_tss: float, after_tss: float,
    before_if: float | None, after_if: float | None,
    before_dur: int, after_dur: int, rails_downgraded: bool,
) -> tuple[str, str]:
    """Rule-based bilingual rationale — concrete numbers, no-guilt register.
    (When the LLM is live it can override this prose; the mechanics don't change.)"""
    dtss = round(after_tss - before_tss)
    parts_de: list[str] = []
    parts_en: list[str] = []
    if before_if and after_if and before_if > 0:
        pct = round((after_if - before_if) / before_if * 100)
        if pct <= -1:
            parts_de.append(f"senkt die Intensität um ~{abs(pct)}%")
            parts_en.append(f"trims intensity ~{abs(pct)}%")
        elif pct >= 1:
            parts_de.append(f"hebt die Intensität um ~{pct}%")
            parts_en.append(f"lifts intensity ~{pct}%")
    if after_dur != before_dur:
        ddur = after_dur - before_dur
        if ddur < 0:
            parts_de.append(f"kürzt die Dauer um {abs(ddur)} min")
            parts_en.append(f"cuts {abs(ddur)} min")
        else:
            parts_de.append(f"verlängert um {ddur} min")
            parts_en.append(f"adds {ddur} min")
    load_de = (
        f"hält die Last bei ~{round(after_tss)} TSS" if abs(dtss) <= 5
        else (f"senkt die Last um ~{abs(dtss)} TSS" if dtss < 0 else f"erhöht die Last um ~{dtss} TSS")
    )
    load_en = (
        f"keeps load at ~{round(after_tss)} TSS" if abs(dtss) <= 5
        else (f"drops load ~{abs(dtss)} TSS" if dtss < 0 else f"adds ~{dtss} TSS")
    )
    tail_de = "frische Beine ohne Formverlust." if dtss < 0 else "damit du den Reiz sauber setzt."
    tail_en = "fresher legs without losing fitness." if dtss < 0 else "so the stimulus lands clean."
    lead_de = ", ".join(parts_de) if parts_de else load_de
    lead_en = ", ".join(parts_en) if parts_en else load_en
    de = f"{lead_de[0].upper()}{lead_de[1:]} — {load_de if parts_de else tail_de}."
    en = f"{lead_en[0].upper()}{lead_en[1:]} — {load_en if parts_en else tail_en}."
    if parts_de:
        de = f"{de[:-1]}, {tail_de}"
        en = f"{en[:-1]}, {tail_en}"
    if rails_downgraded:
        de += " Angepasst an deinen heutigen Erholungszustand."
        en += " Adjusted to today's recovery state."
    return de, en


async def _load_ftp_and_snapshot(user_id: int, db: AsyncSession):
    profile_result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()
    ftp_w = int((profile.ftp_watts if profile else 0) or 0)
    snapshot = await _load_rails_context(user_id, profile, db)
    return profile, ftp_w, snapshot


async def preview_modification_for_user(
    *,
    user_id: int,
    target: date,
    modification_type: str,
    params: dict,
    db: AsyncSession,
    scope: str = "day",
) -> dict:
    """Dry-run a plan change. PERSISTS NOTHING. Returns a PlanProposal dict."""
    if scope == "week":
        return await preview_week_easier_for_user(
            user_id=user_id, target=target, db=db,
        )

    pw = await _get_planned_workout_for_user(user_id, target, db)
    base = {
        "scope": "day",
        "applicable": False,
        "modification_type": modification_type,
        "target_date": target.isoformat(),
        "rationale": "",
        "rationale_de": "",
    }
    if pw is None:
        base["reason"] = f"No planned workout on {target.isoformat()}."
        return base

    today = datetime.now(timezone.utc).date()
    if target == today and await _has_activity_on(user_id, target, db):
        base["reason"] = "Already trained today — nothing to change."
        return base

    _profile, ftp_w, snapshot = await _load_ftp_and_snapshot(user_id, db)
    if ftp_w <= 0:
        base["reason"] = "Set your FTP first — a proposal needs an FTP anchor."
        return base

    duration_min = int(round((pw.duration_seconds_target or 0) / 60)) or 60
    from types import SimpleNamespace
    pw_view = SimpleNamespace(
        id=pw.id, user_id=pw.user_id,
        template_id=pw.template_id or _SUCCESS_TEMPLATE_DEFAULT,
        duration_min=duration_min, indoor=bool(pw.indoor),
        blocks=pw.interval_structure, sport=pw.sport, title=pw.title,
    )
    try:
        result = apply_modification(pw_view, modification_type, params, snapshot, ftp_w)
    except ValueError as exc:
        base["reason"] = str(exc)
        return base

    before = _materialize_session(
        template_id=pw_view.template_id, ftp_w=ftp_w, duration_min=duration_min,
        indoor=bool(pw.indoor), date_iso=target.isoformat(), title_override=pw.title,
    )
    after = _materialize_session(
        template_id=result.template_id, ftp_w=ftp_w, duration_min=result.duration_min,
        indoor=result.indoor, date_iso=target.isoformat(),
        title_override=result.metadata.get("title"),
    )

    monday = target - timedelta(days=target.weekday())
    sunday = monday + timedelta(days=6)
    week_before = await _week_planned_tss(user_id, monday, sunday, ftp_w, db)
    week_after = None
    if week_before is not None:
        week_after = round(
            week_before - before["predicted_tss"] + after["predicted_tss"], 1
        )

    rationale_de, rationale_en = _proposal_rationale(
        modification_type=modification_type,
        before_tss=before["predicted_tss"], after_tss=after["predicted_tss"],
        before_if=before["intensity_factor"], after_if=after["intensity_factor"],
        before_dur=before["duration_min"], after_dur=after["duration_min"],
        rails_downgraded=result.rails_downgraded,
    )

    return {
        "scope": "day",
        "applicable": True,
        "modification_type": modification_type,
        "target_date": target.isoformat(),
        "reason": result.reason,
        "rails_downgraded": result.rails_downgraded,
        "before": before,
        "after": after,
        "day_diffs": [],
        "week_before_tss": week_before,
        "week_after_tss": week_after,
        "tss_delta": round(after["predicted_tss"] - before["predicted_tss"], 1),
        "duration_delta_min": after["duration_min"] - before["duration_min"],
        "intensity_delta_pct": (
            round((after["intensity_factor"] - before["intensity_factor"])
                  / before["intensity_factor"] * 100, 1)
            if before["intensity_factor"] and after["intensity_factor"] else None
        ),
        "rationale": rationale_en,
        "rationale_de": rationale_de,
    }


async def preview_week_easier_for_user(
    *, user_id: int, target: date, db: AsyncSession,
) -> dict:
    """Dry-run an 'easier week': step every intensity day down one notch,
    leave endurance/recovery/rest untouched. PERSISTS NOTHING."""
    from types import SimpleNamespace

    monday = target - timedelta(days=target.weekday())
    sunday = monday + timedelta(days=6)
    base = {
        "scope": "week",
        "applicable": False,
        "modification_type": "easier",
        "target_date": target.isoformat(),
        "day_diffs": [],
        "rationale": "",
        "rationale_de": "",
    }

    _profile, ftp_w, snapshot = await _load_ftp_and_snapshot(user_id, db)
    if ftp_w <= 0:
        base["reason"] = "Set your FTP first — a proposal needs an FTP anchor."
        return base

    rows = await db.execute(
        select(PlannedWorkout).where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date >= monday,
            PlannedWorkout.date <= sunday,
        ).order_by(PlannedWorkout.date)
    )
    pws = list(rows.scalars().all())
    if not pws:
        base["reason"] = "No planned workouts this week to ease."
        return base

    _WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
    day_diffs: list[dict] = []
    week_before = 0.0
    week_after = 0.0
    changed_any = False
    for pw in pws:
        dur = int(round((pw.duration_seconds_target or 0) / 60)) or 60
        tid = pw.template_id or _SUCCESS_TEMPLATE_DEFAULT
        before_sess = _materialize_session(
            template_id=tid, ftp_w=ftp_w, duration_min=dur, indoor=bool(pw.indoor),
            date_iso=pw.date.isoformat(), title_override=pw.title,
        )
        week_before += before_sess["predicted_tss"]
        category = TEMPLATES[before_sess["template_id"]].category
        is_intensity = category in _INTENSITY_CATEGORIES
        if is_intensity:
            pw_view = SimpleNamespace(
                template_id=before_sess["template_id"], duration_min=dur,
                indoor=bool(pw.indoor),
            )
            res = apply_modification(pw_view, "soft_ease", {}, snapshot, ftp_w)
            after_sess = _materialize_session(
                template_id=res.template_id, ftp_w=ftp_w, duration_min=res.duration_min,
                indoor=res.indoor, date_iso=pw.date.isoformat(),
                title_override=res.metadata.get("title"),
            )
            changed = after_sess["template_id"] != before_sess["template_id"]
            changed_any = changed_any or changed
        else:
            after_sess = before_sess
            changed = False
        week_after += after_sess["predicted_tss"]
        day_diffs.append({
            "date": pw.date.isoformat(),
            "weekday": _WD[pw.date.weekday()],
            "before_label": before_sess["label"],
            "after_label": after_sess["label"],
            "before_tss": before_sess["predicted_tss"],
            "after_tss": after_sess["predicted_tss"],
            "changed": changed,
        })

    if not changed_any:
        base["reason"] = "Your week is already easy — no hard days to trim."
        base["applicable"] = False
        base["day_diffs"] = day_diffs
        base["week_before_tss"] = round(week_before, 1)
        base["week_after_tss"] = round(week_after, 1)
        return base

    week_before = round(week_before, 1)
    week_after = round(week_after, 1)
    dtss = round(week_after - week_before)
    rationale_de = (
        f"Nimmt {sum(1 for d in day_diffs if d['changed'])} harte Tage eine Stufe "
        f"zurück — Wochenlast {round(week_before)} → {round(week_after)} TSS "
        f"(~{abs(dtss)} TSS weniger). Frische Beine, gleiche Struktur."
    )
    rationale_en = (
        f"Steps {sum(1 for d in day_diffs if d['changed'])} hard days down a notch — "
        f"weekly load {round(week_before)} → {round(week_after)} TSS "
        f"(~{abs(dtss)} TSS lighter). Fresher legs, same shape."
    )
    return {
        "scope": "week",
        "applicable": True,
        "modification_type": "easier",
        "target_date": target.isoformat(),
        "reason": None,
        "rails_downgraded": False,
        "day_diffs": day_diffs,
        "week_before_tss": week_before,
        "week_after_tss": week_after,
        "tss_delta": round(week_after - week_before, 1),
        "rationale": rationale_en,
        "rationale_de": rationale_de,
    }


async def apply_week_easier_for_user(
    *, user_id: int, target: date, db: AsyncSession,
) -> dict:
    """Apply the 'easier week' by routing EACH intensity day through the shared
    audited apply pipeline (rails, PlannedWorkout write, audit row, feed row,
    cache invalidation). Endurance/recovery/rest days are left untouched."""
    monday = target - timedelta(days=target.weekday())
    sunday = monday + timedelta(days=6)

    rows = await db.execute(
        select(PlannedWorkout).where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date >= monday,
            PlannedWorkout.date <= sunday,
        ).order_by(PlannedWorkout.date)
    )
    pws = list(rows.scalars().all())
    applied: list[dict] = []
    for pw in pws:
        tid = pw.template_id or _SUCCESS_TEMPLATE_DEFAULT
        tmpl = TEMPLATES.get(tid)
        if tmpl is None or tmpl.category not in _INTENSITY_CATEGORIES:
            continue
        res = await modify_planned_workout_for_user(
            user_id=user_id, target=pw.date, modification_type="soft_ease",
            params={}, db=db,
        )
        if res.get("success"):
            applied.append({"date": pw.date.isoformat(), **res})
    return {
        "success": True,
        "scope": "week",
        "applied_count": len(applied),
        "applied": applied,
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
    """Chat-tool wrapper — tool_input is intentionally empty; delegates to
    the ONE shared undo pipeline (also used by the REST undo endpoints)."""
    return await undo_last_modification_for_user(user_id=user_id, db=db)


async def undo_last_modification_for_user(
    *, user_id: int, db: AsyncSession,
) -> dict:
    """THE shared undo pipeline: undo the most recent modification for this
    user (within the 60-min window) by delegating to revert_from_audit, then
    append a `rule='revert'` feed row so the timeline tells the whole story.
    Returns found=False when there is nothing eligible or when the row has
    already been undone."""
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

    # Feed row — the timeline shows the revert too (append-only; a reverted
    # adaptation gets its own row with rule='revert' per the model contract).
    from app.services.plan_adaptation_log import log_adaptation

    restored_title = result.metadata.get("title") or result.template_id
    try:
        target_date = date.fromisoformat(str(mod.get("date"))[:10])
    except (TypeError, ValueError):
        target_date = datetime.now(timezone.utc).date()
    await log_adaptation(
        db,
        user_id,
        target_date=target_date,
        source="user_change",
        signal="user_change",
        rule="revert",
        message_de=(
            f"Rückgängig gemacht — {restored_title} "
            f"({result.duration_min} min) steht wieder im Plan."
        ),
        message_en=(
            f"Undone — {restored_title} "
            f"({result.duration_min} min) is back on the plan."
        ),
        before={
            "date": target_date.isoformat(),
            "template_id": (result.before or {}).get("template_id"),
            "duration_min": (result.before or {}).get("duration_min"),
        },
        after={
            "date": target_date.isoformat(),
            "template_id": result.template_id,
            "title": result.metadata.get("title"),
            "duration_min": result.duration_min,
            "target_tss": result.predicted_tss,
        },
        commit=True,
    )

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
# present_answer — terminal structured-answer tool (no DB writes)
# ======================================================================
#
# Pure pass-through: the coach hands us its final fact-chips + verdict and we
# normalize the shape before it renders as a card. NO reads, NO writes — the
# grounding contract (chip values must come from real data tools) is enforced
# by the prompt, not here; we only sanitise the envelope. The loop treats a
# present_answer call as turn-terminating (see run_tool_use_loop_events) and
# runs `summary` through validate_chat_response there.

_FACT_TONES = ("good", "caution", "neutral")
_MAX_FACTS = 4


def _normalize_fact(raw: Any) -> dict | None:
    """Coerce one chip into {label, value, tone[, unit]} or None if unusable.

    Drops facts missing a non-empty label or a value. `value` keeps its
    number-ness when numeric, else is stringified. `tone` falls back to
    'neutral' for anything outside the allowed set.
    """
    if not isinstance(raw, dict):
        return None
    label = raw.get("label")
    label = str(label).strip() if label is not None else ""
    if not label:
        return None
    if "value" not in raw or raw.get("value") is None:
        return None
    value = raw.get("value")
    if isinstance(value, bool):
        # bool is an int subclass — stringify so it never renders as a chip number
        value = str(value)
    elif not isinstance(value, (int, float)):
        value = str(value)
    tone = raw.get("tone")
    tone = tone if tone in _FACT_TONES else "neutral"
    fact: dict[str, Any] = {"label": label, "value": value, "tone": tone}
    unit = raw.get("unit")
    if unit is not None:
        unit_str = str(unit).strip()
        if unit_str:
            fact["unit"] = unit_str
    # Order keys for a stable payload: label, value, unit, tone.
    ordered: dict[str, Any] = {"label": fact["label"], "value": fact["value"]}
    if "unit" in fact:
        ordered["unit"] = fact["unit"]
    ordered["tone"] = fact["tone"]
    return ordered


async def _handle_present_answer(
    tool_input: dict, user_id: int, db: AsyncSession,
) -> dict:
    """Validate/normalize the coach's structured answer. Pure — no DB access.

    Caps facts at 4, coerces types, trims the summary. user_id + db are
    accepted for dispatcher-signature uniformity but intentionally unused.
    """
    raw_facts = tool_input.get("facts")
    facts: list[dict] = []
    if isinstance(raw_facts, list):
        for raw in raw_facts:
            normalized = _normalize_fact(raw)
            if normalized is not None:
                facts.append(normalized)
            if len(facts) >= _MAX_FACTS:
                break

    summary = tool_input.get("summary")
    summary = str(summary).strip() if summary is not None else ""

    return {"facts": facts, "summary": summary}


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
    "present_answer": _handle_present_answer,
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
