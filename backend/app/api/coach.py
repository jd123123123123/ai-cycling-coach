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
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse, Response, StreamingResponse
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
    ExternalWorkoutMatch,
    ExternalWorkoutsRead,
    GoalTrajectoryRead,
    OutlookEntry,
    PostRideReview,
    PrescribedWorkout,
    Regeneration,
    TomorrowPlan,
    TransparencyRead,
    WhyTiredRead,
)
from app.models.athlete_profile import AthleteProfile
from app.services import coach_service
from app.schemas.adaptive import AdaptiveDirective
from app.services.adaptation_explainer import explain_adaptations
from app.services.adaptive_readiness import build_adaptive_directive
from app.services.advanced_metrics import why_am_i_tired
from app.services.coach_prompt import SYSTEM_PROMPT
from app.services.external_workouts import match_workouts, predict_tss
from app.services.goal_trajectory import project as project_trajectory, trajectory_to_dict
from app.services.pmc_service import compute_user_pmc
from app.services.training_periodization import (
    default_target_ctl,
    detect_training_phase,
)
from app.services.workout_export import blocks_from_dicts, to_erg, to_fit, to_mrc, to_zwo

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

    # Step 7 — tomorrow_plan + regeneration also live in evidence. Tolerate
    # missing keys (older briefs) and malformed payloads.
    tomorrow_plan: TomorrowPlan | None = None
    regeneration: Regeneration | None = None
    if isinstance(evidence, dict):
        raw_tom = evidence.get("tomorrow_plan")
        if isinstance(raw_tom, dict):
            try:
                tomorrow_plan = TomorrowPlan(**raw_tom)
            except Exception:  # noqa: BLE001
                tomorrow_plan = None
        raw_regen = evidence.get("regeneration")
        if isinstance(raw_regen, dict):
            try:
                regeneration = Regeneration(**raw_regen)
            except Exception:  # noqa: BLE001
                regeneration = None

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
        tomorrow_plan=tomorrow_plan,
        regeneration=regeneration,
        adaptations=explain_adaptations(
            evidence if isinstance(evidence, dict) else {},
            de=_evidence_is_de(evidence),
        ),
    )


def _evidence_is_de(evidence: Any) -> bool:
    """Best-effort locale flag for the adaptation copy (evidence carries locale)."""
    if isinstance(evidence, dict):
        loc = evidence.get("locale") or evidence.get("lang") or evidence.get("language_locale")
        return str(loc).lower().startswith("de")
    return False


@router.get("/brief", response_model=BriefRead)
async def get_brief(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    language: Annotated[
        Literal["simple", "technical"],
        Query(description="Language mode: 'simple' (plain English, default) or 'technical' (full vocabulary)."),
    ] = "simple",
    locale: Annotated[
        Literal["en", "de"],
        Query(description="UI locale — 'en' (default) or 'de'. Drives the LLM to write its prose in that language."),
    ] = "en",
) -> BriefRead:
    """Return the latest cached brief if < 6h old; otherwise regenerate and cache.

    The cache is keyed by language + locale — different combo = cache miss =
    regenerate. Works without ANTHROPIC_API_KEY: falls back to a rule-based
    brief (still language-aware) so the dashboard can always render.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.COACH_BRIEF_CACHE_HOURS)

    lang_expr = CoachBrief.evidence["language"].astext
    locale_expr = CoachBrief.evidence["locale"].astext
    cache_check = await db.execute(
        select(CoachBrief)
        .where(
            CoachBrief.user_id == current_user.id,
            CoachBrief.generated_at >= cutoff,
            CoachBrief.prescribed_workout.isnot(None),
            func.coalesce(lang_expr, "simple") == language,
            func.coalesce(locale_expr, "en") == locale,
        )
        .order_by(CoachBrief.generated_at.desc())
        .limit(1)
    )
    cached = cache_check.scalar_one_or_none()
    from_cache = cached is not None

    brief = await coach_service.get_or_generate_brief(
        db, current_user.id, force=False, language=language, locale=locale,
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
    locale: Annotated[
        Literal["en", "de"],
        Query(description="UI locale — 'en' (default) or 'de'."),
    ] = "en",
) -> BriefRead:
    """Force-regenerate the brief in the requested language + locale."""
    brief = await coach_service.get_or_generate_brief(
        db, current_user.id, force=True, language=language, locale=locale,
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


# ----------------------------------------------------------------------
# Goal trajectory — event-aware projection for the dashboard.
# A coach-grade view: days to event, projected race-day CTL/TSB, Mujika
# taper window, on-track gap, and a one-line narrative the UI drops in.
#
# Default `target_ctl` is derived from event_type + priority (via
# training_periodization.default_target_ctl) when goals.target_ctl isn't set
# explicitly. The defaults are conservative coaching floors from Friel's
# Cyclist's Training Bible Ch.5 — shared with the under-built taper override.
# ----------------------------------------------------------------------


@router.get("/adaptive", response_model=AdaptiveDirective)
async def adaptive_directive(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: str = "en",
) -> AdaptiveDirective:
    """Daily autoregulation directive — HRV-band-gated intensity ceiling + volume,
    escalating on confirmed adaptation. Evidence-graded (see adaptive_readiness)."""
    lang = "de" if lang.lower().startswith("de") else "en"
    d = await build_adaptive_directive(db, current_user.id, lang)
    return AdaptiveDirective(
        directive=d.directive, intensity_ceiling=d.intensity_ceiling,
        volume_modifier=d.volume_modifier, hrv_state=d.hrv_state, headline=d.headline,
        signals=[{"text": s.text, "tone": s.tone, "evidence": s.evidence} for s in d.signals],
        confidence=d.confidence, lang=lang,
    )


@router.get("/trajectory", response_model=GoalTrajectoryRead)
async def goal_trajectory(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: str = "en",
) -> GoalTrajectoryRead:
    """Forward-looking projection of fitness toward the athlete's target event.

    Pulls the same `goal_trajectory.project()` the coach brief uses. Surfaced
    on its own endpoint so the dashboard's trajectory primitive can render
    instantly without waiting for a brief regeneration.
    """
    profile_q = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    profile = profile_q.scalar_one_or_none()

    pmc_full = await compute_user_pmc(db, current_user.id, days=90)
    ctl_now = 0.0
    if profile:
        # detect_training_phase needs the goal date + ctl_now; degrade gracefully.
        rows = pmc_full.get("total") or []
        if rows:
            ctl_now = float(rows[-1].get("ctl") or 0.0)

    goal_date = profile.target_event_date if profile else None
    phase = detect_training_phase(goal_date, ctl_now) if profile else "base"

    # Build the goals dict that project() understands. Inject default target_ctl
    # when the profile didn't pin one explicitly so the on-track classifier can
    # answer "behind / on / ahead" instead of degrading to no_goal.
    goals: dict = {}
    if profile and isinstance(profile.goals, dict):
        goals = dict(profile.goals)
    if profile and profile.target_event_date:
        # The first-class column is the source of truth for the event DATE —
        # the JSONB goals blob can carry a stale nested date (observed: a past
        # date shadowing the real one via setdefault, collapsing the whole
        # projection to on_track='no_goal'). Overwrite the date, keep the name.
        existing = goals.get("target_event") if isinstance(goals.get("target_event"), dict) else {}
        goals["target_event"] = {
            **existing,
            "date": profile.target_event_date.isoformat(),
        }
    if "target_ctl" not in goals and profile:
        derived = default_target_ctl(profile.target_event_type, profile.target_priority)
        if derived is not None:
            goals["target_ctl"] = derived

    projection = project_trajectory(
        user_pmc=pmc_full.get("total") or [],
        athlete_goals=goals,
        phase=phase,
        lang="de" if lang.lower().startswith("de") else "en",
    )
    payload = trajectory_to_dict(projection)

    # Enrich with event metadata so the UI doesn't need a second fetch.
    event_name: str | None = None
    if isinstance(goals.get("target_event"), dict):
        event_name = goals["target_event"].get("name")
    payload["event_name"] = event_name
    payload["event_date"] = (
        profile.target_event_date.isoformat()
        if profile and profile.target_event_date
        else None
    )
    payload["event_type"] = profile.target_event_type if profile else None
    payload["target_priority"] = profile.target_priority if profile else None

    return GoalTrajectoryRead(**payload)


# ----------------------------------------------------------------------
# External workouts — curated Zwift / TrainerRoad / etc. matches for today.
# Reads the brief's prescribed_workout to derive (category, target_minutes),
# then asks the matcher for a ranked shortlist. The matcher itself is pure
# (file-loaded JSON); fetching this endpoint never costs an LLM call.
# ----------------------------------------------------------------------

# Internal SessionType values that the picker emits (see
# training_periodization.SessionType). 'rest' has no library — endpoint
# returns an empty list. 'recovery' shares the recovery library.
_SESSION_TO_LIBRARY_CATEGORY: dict[str, str] = {
    "rest":       "recovery",
    "recovery":   "recovery",
    "endurance":  "endurance",
    "tempo":      "tempo",
    "sweet_spot": "sweet_spot",
    "threshold":  "threshold",
    "vo2":        "vo2",
}


@router.get("/external-workouts", response_model=ExternalWorkoutsRead)
async def external_workouts(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    platforms: Annotated[
        str | None,
        Query(
            description=(
                "Comma-separated platform filter (e.g. 'zwift,trainerroad'). "
                "Omit for all."
            ),
        ),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
) -> ExternalWorkoutsRead:
    """Today's external-platform workout shortlist.

    Derives `(category, target_minutes)` from the most recent brief's
    prescribed_workout. When no brief exists yet, falls back to ('endurance',
    60) — a reasonable default that lets new users see workouts before their
    first sync.
    """
    # Pull the latest brief for category + duration; OK if none exists.
    latest_q = await db.execute(
        select(CoachBrief)
        .where(CoachBrief.user_id == current_user.id)
        .order_by(CoachBrief.generated_at.desc())
        .limit(1)
    )
    latest = latest_q.scalar_one_or_none()

    session_type = "endurance"
    target_minutes = 60
    if latest and isinstance(latest.prescribed_workout, dict):
        pw = latest.prescribed_workout
        # category lives on the picked template; we proxied it through as
        # `category` in the snapshot but most generators pass `intensity_chip`.
        cat = pw.get("category") or pw.get("intensity_chip") or "endurance"
        if isinstance(cat, str):
            session_type = cat.lower()
        dur = pw.get("duration_minutes")
        if isinstance(dur, (int, float)) and dur > 0:
            target_minutes = int(dur)

    library_category = _SESSION_TO_LIBRARY_CATEGORY.get(session_type, "endurance")

    # Athlete FTP guards out workouts with a min_ftp the rider can't safely
    # hold (TrainerRoad-style).
    profile_q = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    profile = profile_q.scalar_one_or_none()
    ftp = profile.ftp_watts if profile else None

    platform_filter: tuple[str, ...] | None = None
    if platforms:
        platform_filter = tuple(p.strip().lower() for p in platforms.split(",") if p.strip())

    matches = match_workouts(
        category=library_category,
        target_minutes=target_minutes,
        athlete_ftp=ftp,
        limit=limit,
        platforms=platform_filter,
    )

    return ExternalWorkoutsRead(
        session_type=session_type,
        target_minutes=target_minutes,
        matches=[
            ExternalWorkoutMatch(
                id=w.id,
                title=w.title,
                platform=w.platform,  # type: ignore[arg-type]
                category=w.category,
                duration_min=w.duration_min,
                intensity_factor=w.intensity_factor,
                structure=w.structure,
                min_ftp=w.min_ftp,
                predicted_tss=predict_tss(w),
            )
            for w in matches
        ],
    )


# ----------------------------------------------------------------------
# Workout export — turn today's prescribed workout into a structured file
# every major indoor app understands.
# ----------------------------------------------------------------------


_EXPORT_CONTENT_TYPES: dict[str, str] = {
    # .zwo is technically XML but most trainer apps key off the extension,
    # not the MIME. Use application/xml; that's the spec-correct answer.
    "zwo": "application/xml",
    "erg": "text/plain",
    "mrc": "text/plain",
    # Garmin's registered FIT MIME. Garmin Connect, Fenix/Edge, Wahoo all
    # accept `application/octet-stream` too — using the registered type is
    # the safer answer for stricter importers.
    "fit": "application/vnd.ant.fit",
}


def _safe_filename(title: str) -> str:
    """Sanitize the workout title into a filename. Allow letters, digits,
    underscores, hyphens; collapse everything else to underscores. Caps at
    80 chars so the resulting Content-Disposition stays readable."""
    out = "".join(c if c.isalnum() or c in "-_" else "_" for c in title.strip())
    out = out.strip("_") or "workout"
    return out[:80]


@router.get(
    "/workout/export",
    summary="Export today's prescribed workout to a structured file",
    description=(
        "Returns the latest brief's prescribed_workout serialized to one of "
        ".zwo (Zwift), .erg (watts-by-time), or .mrc (%FTP-by-time). The "
        ".zwo and .mrc variants are FTP-relative; .erg is absolute watts."
    ),
)
async def export_workout(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    format: Annotated[
        Literal["zwo", "erg", "mrc", "fit"],
        Query(description="Target file format"),
    ] = "zwo",
) -> Response:
    latest_q = await db.execute(
        select(CoachBrief)
        .where(CoachBrief.user_id == current_user.id)
        .order_by(CoachBrief.generated_at.desc())
        .limit(1)
    )
    latest = latest_q.scalar_one_or_none()

    pw = latest.prescribed_workout if latest else None
    if not isinstance(pw, dict) or not isinstance(pw.get("blocks"), list) or not pw["blocks"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No prescribed workout available to export.",
        )

    profile_q = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    profile = profile_q.scalar_one_or_none()
    ftp = profile.ftp_watts if profile else None
    if not ftp or ftp <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set your FTP first — workout export needs an FTP anchor.",
        )

    blocks = blocks_from_dicts(pw["blocks"])
    title = str(pw.get("title") or pw.get("template_id") or "workout")
    description = str(pw.get("why_this_workout") or pw.get("purpose") or "")
    category = pw.get("category") if isinstance(pw.get("category"), str) else None

    body: str | bytes
    if format == "zwo":
        body = to_zwo(
            title=title, description=description, blocks=blocks,
            ftp=ftp, category=category,
        )
    elif format == "erg":
        body = to_erg(title=title, description=description, blocks=blocks, ftp=ftp)
    elif format == "mrc":
        body = to_mrc(title=title, description=description, blocks=blocks, ftp=ftp)
    else:  # fit
        body = to_fit(title=title, description=description, blocks=blocks, ftp=ftp)

    filename = f"{_safe_filename(title)}.{format}"
    return Response(
        content=body,
        media_type=_EXPORT_CONTENT_TYPES[format],
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # CORS exposure so the frontend can read the filename if it ever
            # wants to suggest a save name programmatically.
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# ─── One-tap workout alternates (roadmap P0.4b) ─────────────────────────────
# The Go-Gentler choice architecture: the Today card offers 2–3 rails-safe
# swaps and applies them through the SAME audited path the chat tool uses
# (apply_modification + rails + audit row + undo window). No new write path.

_ALTERNATE_INTENTS: dict[str, tuple[str, dict]] = {
    # label → (modification_type, params)
    "less_time": ("shorten", {"duration_min": 45}),
    "recover": ("easier", {}),
    "indoor": ("indoor", {}),
}


from pydantic import BaseModel as _BaseModel


class AlternateApply(_BaseModel):
    label: Literal["less_time", "recover", "indoor"]


@router.post("/brief/alternate")
async def apply_brief_alternate(
    payload: AlternateApply,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Apply a one-tap alternate to TODAY's planned workout. Mirrors the chat
    `modify_planned_workout` tool exactly (rails, audit, undo eligibility);
    returns the tool result — including `rails_downgraded` + a human `reason`
    — for honest client narration."""
    from datetime import date as _date

    from app.services.coach_tools import _handle_modify_planned_workout

    modification_type, params = _ALTERNATE_INTENTS[payload.label]
    tool_input = {
        "date": _date.today().isoformat(),
        "modification_type": modification_type,
        "params": params,
    }
    result = await _handle_modify_planned_workout(tool_input, current_user.id, db)

    # Today's prescription often lives only in the brief (the mesocycle rows
    # may not cover the current week yet). If the modifier found no
    # PlannedWorkout row, materialize one from the brief's prescription and
    # retry — the swap must work on exactly what the card shows.
    if result.get("found") is False:
        materialized = await _materialize_today_plan_from_brief(db, current_user.id)
        if materialized:
            result = await _handle_modify_planned_workout(tool_input, current_user.id, db)
    return result


async def _materialize_today_plan_from_brief(db: AsyncSession, user_id: int) -> bool:
    """Create today's PlannedWorkout row from the latest brief's prescription.
    Returns True when a row was created."""
    from datetime import date as _date

    from sqlalchemy import select as _select

    from app.models.planned_workout import PlannedWorkout

    row = await db.execute(
        _select(CoachBrief)
        .where(CoachBrief.user_id == user_id, CoachBrief.prescribed_workout.isnot(None))
        .order_by(CoachBrief.generated_at.desc())
        .limit(1)
    )
    brief = row.scalar_one_or_none()
    pw_json = (brief.prescribed_workout or {}) if brief else {}
    template_id = pw_json.get("template_id")
    if not template_id:
        return False
    duration_min = int(pw_json.get("duration_minutes") or 60)
    db.add(
        PlannedWorkout(
            user_id=user_id,
            date=_date.today(),
            sport="cycling",
            title=pw_json.get("title") or "Planned session",
            duration_seconds_target=duration_min * 60,
            interval_structure={"intervals": pw_json.get("blocks") or []},
            template_id=template_id,
            blocks_source="ai_prescribed",
        )
    )
    await db.commit()
    return True


@router.post("/brief/alternate/undo")
async def undo_brief_alternate(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Undo the most recent workout modification (server enforces the same
    60-minute window as chat undo)."""
    from app.services.coach_tools import _handle_undo_last_modification

    return await _handle_undo_last_modification({}, current_user.id, db)


@router.get("/absorptions")
async def get_absorptions(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    days: Annotated[int, Query(ge=1, le=14)] = 3,
) -> list[dict]:
    """Recent absorb-and-replan events (roadmap P1.4) for the Today disclosure
    card: which ride was absorbed and what (if anything) was rebalanced."""
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz

    from sqlalchemy import select as _select

    rows = await db.execute(
        _select(CoachBrief.rationale, CoachBrief.evidence, CoachBrief.generated_at)
        .where(
            CoachBrief.user_id == current_user.id,
            CoachBrief.verdict == "absorption",
            CoachBrief.generated_at >= _dt.now(_tz.utc) - _td(days=days),
        )
        .order_by(CoachBrief.generated_at.desc())
        .limit(5)
    )
    return [
        {"rationale": r[0], **((r[1] or {}).get("absorption") or {})}
        for r in rows.all()
    ]
