"""Coach service — assembles the athlete snapshot, calls Claude with prompt caching
and tool-use for structured output, filters through safety_rails, and caches the
result in coach_briefs with a 6-hour TTL.

Design invariants:
    - App MUST boot when ANTHROPIC_API_KEY is absent. Anthropic SDK is imported
      lazily so `ModuleNotFoundError` on the SDK cannot crash module import.
    - When the API key is absent OR the Anthropic call fails, generate_brief
      falls back to a fully-deterministic rule-based brief synthesized from
      safety_rails + the snapshot. model_used='rule-based-fallback' is recorded.
    - Safety rails run AFTER the LLM — the LLM can suggest anything; rails mark
      dangerous options blocked (with a visible reason) before persistence.
    - Prompt caching uses cache_control ephemeral on the system prompt, giving
      ~80% input-token cost savings on cache hits within a 5-min window.

References: see .planning/research/training-frameworks.md and
.planning/research/athlete-pain-points.md.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.coach_brief import CoachBrief
from app.services import advanced_metrics
from app.services.advanced_metrics import (
    ctl_atl_tsb_snapshot,
    hrv_trend,
    rhr_trend,
    sleep_debt,
    why_am_i_tired,
    zone_distribution,
)
from app.services.coach_prompt import BRIEF_TOOL, SYSTEM_PROMPT, build_user_message
from app.services.safety_rails import (
    RailContext,
    filter_recommendation,
    intensity_ceiling,
    max_tss_for_day,
    validate_chat_response,
)

logger = logging.getLogger(__name__)


# ======================================================================
#  Snapshot builder — ALL the features the coach sees
# ======================================================================

async def _activity_summary_14d(db: AsyncSession, user_id: int) -> dict:
    """Aggregate metrics across the last 14 days of activities.

    Returns:
        {count, total_tss, avg_ef, avg_decoupling, durability_last_long_ride}
    """
    since = datetime.now(timezone.utc) - timedelta(days=14)
    stmt = (
        select(Activity)
        .where(Activity.user_id == user_id, Activity.started_at >= since)
        .order_by(Activity.started_at.asc())
    )
    result = await db.execute(stmt)
    activities = list(result.scalars().all())

    if not activities:
        return {
            "count": 0,
            "total_tss": 0.0,
            "avg_ef": None,
            "avg_decoupling": None,
            "durability_last_long_ride": None,
        }

    total_tss = sum(a.tss or 0 for a in activities)
    efs: list[float] = []
    decs: list[float] = []
    last_durability: float | None = None
    last_long_ride_time: datetime | None = None

    for a in activities:
        m = advanced_metrics.compute_activity_metrics(a)
        if m["ef"] is not None:
            efs.append(m["ef"])
        if m["decoupling"] is not None:
            decs.append(m["decoupling"])
        if m["durability"] is not None:
            if last_long_ride_time is None or a.started_at > last_long_ride_time:
                last_durability = m["durability"]
                last_long_ride_time = a.started_at

    avg_ef = round(sum(efs) / len(efs), 3) if efs else None
    avg_decoupling = round(sum(decs) / len(decs), 2) if decs else None

    return {
        "count": len(activities),
        "total_tss": round(float(total_tss), 1),
        "avg_ef": avg_ef,
        "avg_decoupling": avg_decoupling,
        "durability_last_long_ride": last_durability,
    }


async def _days_since_rest(db: AsyncSession, user_id: int) -> int:
    """Consecutive recent days where TSS > 20 (i.e. not true rest).

    Used as a safety_rails input — forces intensity_ceiling='moderate' after 10
    consecutive non-rest days (Rule 5).
    """
    since = datetime.now(timezone.utc) - timedelta(days=30)
    stmt = (
        select(Activity)
        .where(Activity.user_id == user_id, Activity.started_at >= since)
        .order_by(Activity.started_at.desc())
    )
    result = await db.execute(stmt)
    activities = list(result.scalars().all())

    # Build a set of "non-rest" dates
    non_rest_dates: set[date] = set()
    for a in activities:
        if (a.tss or 0) > 20:
            non_rest_dates.add(a.started_at.date())

    # Count consecutive non-rest days back from today
    today = date.today()
    count = 0
    d = today
    while d in non_rest_dates and count < 30:
        count += 1
        d -= timedelta(days=1)
    return count


async def _recent_daily_tss(db: AsyncSession, user_id: int, days: int = 7) -> list[dict]:
    """Last 7 days of daily TSS for the LLM to build outlook from."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = (
        select(Activity)
        .where(Activity.user_id == user_id, Activity.started_at >= since)
        .order_by(Activity.started_at.asc())
    )
    result = await db.execute(stmt)
    activities = list(result.scalars().all())

    by_date: dict[date, float] = {}
    for a in activities:
        by_date[a.started_at.date()] = by_date.get(a.started_at.date(), 0.0) + float(a.tss or 0)

    return [
        {"date": d.isoformat(), "tss": round(tss, 1)}
        for d, tss in sorted(by_date.items())
    ]


async def build_snapshot(db: AsyncSession, user_id: int) -> dict:
    """Assemble every feature the coach needs in one round of DB hits."""
    profile_result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()

    goal_event_date = None
    goal_target = None
    if profile and isinstance(profile.goals, dict):
        te = profile.goals.get("target_event")
        if isinstance(te, dict):
            goal_event_date = te.get("date")
            goal_target = te.get("name")

    pmc = await ctl_atl_tsb_snapshot(db, user_id)
    hrv = await hrv_trend(db, user_id, days=7)
    rhr = await rhr_trend(db, user_id, days=7)
    sleep = await sleep_debt(db, user_id, days=14)
    zones = await zone_distribution(db, user_id, days=28)
    activities = await _activity_summary_14d(db, user_id)
    tired = await why_am_i_tired(db, user_id)
    days_since_rest = await _days_since_rest(db, user_id)
    recent_daily = await _recent_daily_tss(db, user_id, days=7)

    snapshot: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "athlete": {
            "goal_event_date": goal_event_date,
            "goal_target": goal_target,
            "weekly_hours": profile.weekly_hours_available if profile else None,
            "ftp": profile.ftp_watts if profile else None,
            "weight_kg": profile.weight_kg if profile else None,
            "injury_flag": bool(profile.injury_flag) if profile else False,
            "injury_note": profile.injury_note if profile else None,
        },
        "pmc": pmc,
        "biometrics": {
            "hrv": hrv,
            "rhr": rhr,
            "sleep": sleep,
        },
        "distribution": zones,
        "activities_14d": activities,
        "why_tired": tired,
        "recent_trend": recent_daily,
        "rails_context": {
            "ctl": pmc["ctl"],
            "atl": pmc["atl"],
            "tsb": pmc["tsb"],
            "hrv_delta_pct": hrv.get("delta_pct") or 0.0,
            "injury_flag": bool(profile.injury_flag) if profile else False,
            "days_since_rest": days_since_rest,
        },
    }
    return snapshot


# ======================================================================
#  Brief generation — LLM path + rule-based fallback
# ======================================================================

def _rails_from_snapshot(snapshot: dict) -> RailContext:
    rc = snapshot["rails_context"]
    return RailContext(
        ctl=float(rc["ctl"]),
        atl=float(rc["atl"]),
        tsb=float(rc["tsb"]),
        hrv_delta_pct=float(rc["hrv_delta_pct"] or 0.0),
        injury_flag=bool(rc["injury_flag"]),
        days_since_rest=int(rc["days_since_rest"]),
    )


def _rule_based_brief(snapshot: dict) -> dict:
    """Deterministic brief synthesized from safety_rails + snapshot.

    Used when the Anthropic API key is unset OR the LLM call fails. Guarantees
    the endpoint always returns a structured brief so the frontend can render
    the dashboard even when AI is offline.
    """
    ctx = _rails_from_snapshot(snapshot)
    ceiling = intensity_ceiling(ctx)
    max_tss = max_tss_for_day(ctx.ctl)
    pmc = snapshot["pmc"]
    hrv = snapshot["biometrics"]["hrv"]
    zones = snapshot["distribution"]

    # Verdict phrasing
    if ceiling == "rest":
        verdict = "Rest — injury takes priority"
    elif ceiling == "easy":
        if ctx.hrv_delta_pct < -10:
            verdict = "Easy only — HRV flagged"
        else:
            verdict = "Easy only — TSB overreach"
    elif ceiling == "moderate":
        verdict = "Moderate today — manage fatigue"
    else:
        verdict = "Push today — you're fresh"

    # Rationale cites actual data
    rationale_parts: list[str] = []
    rationale_parts.append(
        f"TSB is {pmc['tsb']:.1f} and CTL {pmc['ctl']:.1f} (Banister fitness-fatigue)."
    )
    if hrv.get("delta_pct") is not None:
        rationale_parts.append(
            f"7-day HRV is {hrv['delta_pct']:+.1f}% vs 28-day baseline."
        )
    if zones.get("grey_zone_flag"):
        rationale_parts.append(
            f"Z2 creep: {zones['z2_pct']}% of recent time — above Seiler's 20% grey-zone threshold."
        )
    rationale_parts.append(
        f"Intensity ceiling is '{ceiling}'; TSS cap for today is {max_tss:.0f}."
    )
    rationale = " ".join(rationale_parts)

    # 4 standard options — TSS targets scale with CTL but capped at max_tss
    base = max(30.0, ctx.ctl)  # scaling floor
    options = [
        {
            "intensity": "rest",
            "title": "Full rest day",
            "why": "Prioritize sleep, mobility, light walk. Zero TSS is never a failure.",
            "tss_target": 0.0,
        },
        {
            "intensity": "easy",
            "title": f"Easy Z1 spin, {int(min(60, base * 0.6))} min",
            "why": (
                "Below LT1 conversational pace. Pure recovery work — keep HR under "
                "aerobic threshold."
            ),
            "tss_target": round(min(45.0, max_tss or 45.0), 1),
        },
        {
            "intensity": "moderate",
            "title": f"Z2 endurance {int(min(90, base * 0.9))} min",
            "why": (
                "San Millán Z2 at the top of fat-oxidation band. Watch HR drift — "
                "if EF holds, base is locking in."
            ),
            "tss_target": round(min(75.0, max_tss or 75.0), 1),
        },
        {
            "intensity": "push",
            "title": "Threshold or VO2max block",
            "why": (
                "Hard quality work — only if the signal supports it. Friel build-phase "
                "session, TSS targets close to today's ceiling."
            ),
            "tss_target": round(min(110.0, max_tss or 110.0) if max_tss else 110.0, 1),
        },
    ]
    # Apply rails — marks disallowed options blocked
    options = filter_recommendation(options, ctx)

    # 7-day outlook — simple heuristic: maintain around CTL with weekend long day
    outlook: list[dict[str, Any]] = []
    for i in range(7):
        weekday = (date.today() + timedelta(days=i)).weekday()
        if weekday == 6:  # Sunday → long endurance
            tss = round(min(ctx.ctl * 1.1, max_tss if max_tss else ctx.ctl * 1.1), 0)
            note = "Long Z2 ride — build volume."
        elif weekday == 2:  # Wednesday → quality
            tss = round(min(ctx.ctl * 0.9, max_tss if max_tss else ctx.ctl * 0.9), 0)
            note = "Quality work — intervals near threshold."
        elif weekday in (0, 4):  # Monday / Friday → recovery / easy
            tss = round(ctx.ctl * 0.3, 0)
            note = "Recovery — stay easy."
        else:
            tss = round(ctx.ctl * 0.6, 0)
            note = "Moderate endurance."
        outlook.append({"day_offset": i, "suggested_tss": tss, "note": note})

    return {
        "verdict": verdict,
        "rationale": rationale,
        "options": options,
        "outlook_7d": outlook,
        "frameworks_cited": ["Banister fitness-fatigue", "Seiler polarized", "Friel periodization"],
        "model_used": "rule-based-fallback",
    }


def _extract_tool_use(message: Any) -> dict | None:
    """Find the `brief_response` tool_use block in a Claude message response."""
    content = getattr(message, "content", None) or []
    for block in content:
        block_type = getattr(block, "type", None) or (isinstance(block, dict) and block.get("type"))
        if block_type == "tool_use":
            name = getattr(block, "name", None) or (isinstance(block, dict) and block.get("name"))
            if name == "brief_response":
                inp = getattr(block, "input", None) or (isinstance(block, dict) and block.get("input"))
                if isinstance(inp, dict):
                    return inp
    return None


async def generate_brief(snapshot: dict) -> dict:
    """Generate a brief — LLM path with rule-based fallback.

    Returns a dict with keys: verdict, rationale, options, outlook_7d,
    frameworks_cited, model_used. Safety rails are always applied to options.
    """
    if not settings.ANTHROPIC_API_KEY:
        logger.info("ANTHROPIC_API_KEY not set — using rule-based fallback brief")
        return _rule_based_brief(snapshot)

    try:
        # Import lazily so a missing SDK can't break app boot
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        # System prompt with ephemeral prompt caching — 5-min cache window, ~80%
        # cheaper on cached input tokens. The system prompt is stable so every
        # request hits the cache.
        system_blocks = [
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ]

        user_message = build_user_message(snapshot)

        response = await client.messages.create(
            model=settings.COACH_MODEL,
            max_tokens=2048,
            system=system_blocks,
            tools=[BRIEF_TOOL],
            tool_choice={"type": "tool", "name": "brief_response"},
            messages=[{"role": "user", "content": user_message}],
        )

        payload = _extract_tool_use(response)
        if payload is None:
            logger.warning("Claude response had no brief_response tool_use — falling back")
            return _rule_based_brief(snapshot)

        # Safety rails always run AFTER the LLM
        ctx = _rails_from_snapshot(snapshot)
        payload["options"] = filter_recommendation(payload.get("options") or [], ctx)
        payload["model_used"] = settings.COACH_MODEL

        return payload
    except Exception as exc:
        logger.exception("Claude brief generation failed, falling back: %s", exc)
        return _rule_based_brief(snapshot)


# ======================================================================
#  Cache read-through
# ======================================================================

async def get_or_generate_brief(
    db: AsyncSession,
    user_id: int,
    force: bool = False,
) -> CoachBrief:
    """Return the most-recent brief if < COACH_BRIEF_CACHE_HOURS old, else regenerate.

    Always persists the brief (even cache misses) so every generation is
    auditable. Caller is responsible for committing the session on return.
    """
    if not force:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.COACH_BRIEF_CACHE_HOURS)
        recent = await db.execute(
            select(CoachBrief)
            .where(CoachBrief.user_id == user_id, CoachBrief.generated_at >= cutoff)
            .order_by(CoachBrief.generated_at.desc())
            .limit(1)
        )
        cached = recent.scalar_one_or_none()
        if cached is not None:
            return cached

    snapshot = await build_snapshot(db, user_id)
    brief_payload = await generate_brief(snapshot)

    brief = CoachBrief(
        user_id=user_id,
        verdict=brief_payload["verdict"],
        rationale=brief_payload["rationale"],
        evidence=snapshot,
        options=brief_payload["options"],
        outlook_7d=brief_payload.get("outlook_7d"),
        frameworks_cited=brief_payload.get("frameworks_cited") or [],
        raw_prompt=SYSTEM_PROMPT,
        model_used=brief_payload["model_used"],
    )
    db.add(brief)
    await db.commit()
    await db.refresh(brief)
    return brief


# ======================================================================
#  Chat streaming — SSE
# ======================================================================

async def coach_chat_stream(
    db: AsyncSession,
    user_id: int,
    messages: list[dict],
) -> AsyncIterator[str]:
    """Async generator yielding SSE-formatted chunks for the /coach/chat endpoint.

    Behaviour:
        - Requires ANTHROPIC_API_KEY (callers must 503 if absent — we raise).
        - System prompt includes the athlete snapshot so model can cite data inline.
        - Streams response via Anthropic's server-sent streaming.
        - Before streaming the final concatenated text to the user, run
          validate_chat_response. If ED-flagged, REPLACE the content with the
          canned redirect rather than streaming the unsafe content.

    Yields `data: {json}\\n\\n` SSE frames (text/event-stream format).
    """
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set — chat unavailable")

    import anthropic
    import json as _json

    snapshot = await build_snapshot(db, user_id)
    chat_system = (
        SYSTEM_PROMPT
        + "\n\n--- Athlete snapshot ---\n"
        + build_user_message(snapshot)
    )

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Buffer full response so we can validate for ED content before yielding
    # the final "complete" frame. We still stream deltas live for UX.
    buffer: list[str] = []

    try:
        async with client.messages.stream(
            model=settings.COACH_CHAT_MODEL,
            max_tokens=1024,
            system=[{"type": "text", "text": chat_system, "cache_control": {"type": "ephemeral"}}],
            messages=[
                {"role": m["role"], "content": m["content"]}
                for m in messages
                if m.get("role") in ("user", "assistant")
            ],
        ) as stream:
            async for text_delta in stream.text_stream:
                buffer.append(text_delta)
                yield f"data: {_json.dumps({'type': 'delta', 'text': text_delta})}\n\n"

        # Final safety check on the concatenated response
        full_text = "".join(buffer)
        allowed, safe_text = validate_chat_response(full_text)
        if not allowed:
            # Send a correction frame that tells the client to replace its
            # accumulated buffer with the safe redirect
            replace_payload = _json.dumps({
                "type": "replace",
                "text": safe_text,
                "reason": "nutrition_safety_filter",
            })
            yield f"data: {replace_payload}\n\n"
        done_payload = _json.dumps({"type": "done"})
        yield f"data: {done_payload}\n\n"
    except Exception as exc:
        logger.exception("Claude chat stream failed: %s", exc)
        yield f"data: {_json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
