"""Coach API endpoints — brief / refresh / chat / why / transparency.

All routes are RLS-protected via get_db_for_user.

When ANTHROPIC_API_KEY is absent:
    - /coach/brief and /coach/brief/refresh still return structured briefs
      (rule-based fallback baked into coach_service.generate_brief).
    - /coach/chat returns 503 — chat genuinely needs the LLM.
    - /coach/why and /coach/transparency work regardless.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_active_user, get_db_for_user
from app.models.coach_brief import CoachBrief
from app.models.user import User
from app.schemas.coach import (
    AlternateWorkout,
    BriefOption,
    BriefRead,
    ChatRequest,
    OutlookEntry,
    PostRideReview,
    PrescribedWorkout,
    TransparencyRead,
    WhyTiredRead,
)
from app.services import coach_service
from app.services.advanced_metrics import why_am_i_tired
from app.services.coach_prompt import SYSTEM_PROMPT

router = APIRouter(prefix="/coach", tags=["coach"])


# ----------------------------------------------------------------------
# Simple in-memory rate limiter — 20 msgs/min/user for /coach/chat
# NOTE: this is per-process. Production behind multiple workers needs Redis;
# acceptable for the single-uvicorn-worker phase the app is in today.
# ----------------------------------------------------------------------
_CHAT_RATE_WINDOW_SECONDS = 60
_CHAT_RATE_MAX_REQUESTS = 20
_chat_request_log: dict[int, deque[float]] = defaultdict(lambda: deque(maxlen=_CHAT_RATE_MAX_REQUESTS))


def _check_chat_rate_limit(user_id: int) -> None:
    now = time.monotonic()
    log = _chat_request_log[user_id]
    # Drop entries older than the window
    while log and log[0] < now - _CHAT_RATE_WINDOW_SECONDS:
        log.popleft()
    if len(log) >= _CHAT_RATE_MAX_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Chat rate limit exceeded (20 msgs/min).",
        )
    log.append(now)


def _brief_to_read(brief: CoachBrief, from_cache: bool) -> BriefRead:
    # Phase 5.1 shape: prescribed_workout + alternates. Legacy options only
    # populated for pre-5.1 rows still in the cache.
    prescribed = None
    if brief.prescribed_workout:
        try:
            prescribed = PrescribedWorkout(**brief.prescribed_workout)
        except Exception:  # noqa: BLE001 — tolerate malformed legacy JSON
            prescribed = None

    alternates = []
    if brief.alternates:
        for a in brief.alternates:
            try:
                alternates.append(AlternateWorkout(**a))
            except Exception:  # noqa: BLE001
                pass

    legacy_options = None
    if brief.options:
        try:
            legacy_options = [BriefOption(**o) for o in brief.options]
        except Exception:  # noqa: BLE001
            legacy_options = None

    # Phase 5.2 — pick language from evidence. Pre-5.2 rows lack the key → 'simple'.
    evidence = brief.evidence or {}
    lang_val = evidence.get("language") if isinstance(evidence, dict) else None
    language: Literal["simple", "technical"] = (
        "technical" if lang_val == "technical" else "simple"
    )

    # Phase 5.3 — post_ride_review lives inside evidence. Tolerate pre-5.3
    # rows (key missing) and malformed payloads by returning None.
    post_ride_review: PostRideReview | None = None
    if isinstance(evidence, dict):
        raw_review = evidence.get("post_ride_review")
        if isinstance(raw_review, dict):
            try:
                post_ride_review = PostRideReview(**raw_review)
            except Exception:  # noqa: BLE001 — tolerate malformed review
                post_ride_review = None

    return BriefRead(
        id=brief.id,
        generated_at=brief.generated_at,
        verdict=brief.verdict,
        rationale=brief.rationale,
        evidence=brief.evidence,
        prescribed_workout=prescribed,
        alternates=alternates,
        options=legacy_options,
        outlook_7d=[OutlookEntry(**e) for e in (brief.outlook_7d or [])] if brief.outlook_7d else None,
        frameworks_cited=list(brief.frameworks_cited or []),
        model_used=brief.model_used,
        from_cache=from_cache,
        language=language,
        post_ride_review=post_ride_review,
    )


@router.get("/brief", response_model=BriefRead)
async def get_brief(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    language: Annotated[
        Literal["simple", "technical"],
        Query(description="Language mode: 'simple' (plain English, default) or 'technical' (full vocabulary)."),
    ] = "simple",
) -> BriefRead:
    """Return the latest cached brief if < 6h old; otherwise regenerate and cache.

    The cache is keyed by language — different language = cache miss =
    regenerate. Works without ANTHROPIC_API_KEY: falls back to a rule-based
    brief (still language-aware) so the dashboard can always render.
    """
    # Check if a fresh brief for THIS language already exists — this is the
    # from_cache signal we return. We use the same coalesce rule as the
    # service so pre-5.2 rows count as 'simple' for backward compat.
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.COACH_BRIEF_CACHE_HOURS)

    lang_expr = CoachBrief.evidence["language"].astext
    cache_check = await db.execute(
        select(CoachBrief)
        .where(
            CoachBrief.user_id == current_user.id,
            CoachBrief.generated_at >= cutoff,
            CoachBrief.prescribed_workout.isnot(None),
            func.coalesce(lang_expr, "simple") == language,
        )
        .order_by(CoachBrief.generated_at.desc())
        .limit(1)
    )
    cached = cache_check.scalar_one_or_none()
    from_cache = cached is not None

    brief = await coach_service.get_or_generate_brief(
        db, current_user.id, force=False, language=language,
    )
    return _brief_to_read(brief, from_cache=from_cache)


@router.post("/brief/refresh", response_model=BriefRead)
async def refresh_brief(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    language: Annotated[
        Literal["simple", "technical"],
        Query(description="Language mode: 'simple' (default) or 'technical'."),
    ] = "simple",
) -> BriefRead:
    """Force-regenerate the brief in the requested language.

    Always returns from_cache=False. Cache-bust is independent per language.
    """
    brief = await coach_service.get_or_generate_brief(
        db, current_user.id, force=True, language=language,
    )
    return _brief_to_read(brief, from_cache=False)


@router.post("/chat")
async def chat(
    req: ChatRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> StreamingResponse:
    """SSE-stream chat with the coach.

    Phase 6 upgrade: runs a Claude tool-use loop (pmc_window / recovery_trend /
    activities / ftp / planned_workout) so the LLM can answer analytical
    questions grounded in the athlete's own data. Falls back to a deterministic
    synthesizer when ANTHROPIC_API_KEY is absent (supports 'why am I tired?'
    + 'last N weeks' patterns; polite refusal for other prompts).

    Rate limit: 20 messages per minute per user.
    Safety: final assembled text passes through validate_chat_response; ED-adjacent
    content is replaced wholesale with a canned safe redirect frame.
    """
    _check_chat_rate_limit(current_user.id)

    messages_payload = [m.model_dump() for m in req.messages]
    chat_language = req.language  # 'simple' default, 'technical' opt-in

    async def event_stream():
        async for chunk in coach_service.generate_analytical_chat_stream(
            db, current_user.id, messages_payload, language=chat_language,
        ):
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable proxy buffering for SSE
        },
    )


@router.get("/why", response_model=WhyTiredRead)
async def why_tired(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> WhyTiredRead:
    """Causal 'why am I tired?' synthesizer.

    Returns ordered list of suspected causes (high → low severity) with
    evidence strings citing the athlete's own data. Also returns the full
    snapshot used so the frontend can render "show me the data" panels.
    """
    snapshot = await coach_service.build_snapshot(db, current_user.id)
    causes = await why_am_i_tired(db, current_user.id)
    return WhyTiredRead(causes=causes["causes"], snapshot=snapshot)


@router.get("/transparency", response_model=TransparencyRead)
async def transparency(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> TransparencyRead:
    """Transparency endpoint — returns the full snapshot + system prompt.

    Closes pain-point #5 from .planning/research/athlete-pain-points.md:
    no mainstream AI coach lets athletes see the prompt + data behind a
    recommendation. We expose both.
    """
    snapshot = await coach_service.build_snapshot(db, current_user.id)

    # Find the most-recent brief (if any) so the client can reference it
    latest = await db.execute(
        select(CoachBrief)
        .where(CoachBrief.user_id == current_user.id)
        .order_by(CoachBrief.generated_at.desc())
        .limit(1)
    )
    last = latest.scalar_one_or_none()

    return TransparencyRead(
        snapshot=snapshot,
        system_prompt=SYSTEM_PROMPT,
        model=settings.COACH_MODEL if settings.ANTHROPIC_API_KEY else "rule-based-fallback",
        last_brief_id=last.id if last else None,
        last_generated_at=last.generated_at if last else None,
    )
