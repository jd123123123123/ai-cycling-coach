"""Routes API — the athlete's own ridden routes, grouped from their GPS rides.

Two endpoints:
  * GET /routes/mine — every distinct route, everything computed from the
    athlete's own activity streams (GPS/altitude). No external route database,
    no map tiles.
  * GET /routes/recommended — of those routes, which one fits TODAY'S planned
    session (see services.route_recommendation for the scoring rule and why
    it is not a route-shape classifier and not reinforcement learning).

RLS-protected via ``get_db_for_user``.
"""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.services.daily_decision import load_today_context
from app.services.route_library import load_route_library
from app.services.route_recommendation import (
    MAX_ALTERNATIVES,
    MAX_MATCHES,
    recommend_routes,
)

router = APIRouter(prefix="/routes", tags=["routes"])


@router.get(
    "/mine",
    summary="Athlete's ridden routes — GPS rides clustered by start point, distance and duration",
)
async def get_my_routes(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Distinct routes from the athlete's own rides. ``{"available": false,
    "routes": []}`` when no GPS rides exist yet, so the UI renders an honest
    empty state."""
    return await load_route_library(db, _user.id)


@router.get(
    "/recommended",
    summary="Best-fitting past route for today's planned session, plus alternatives",
)
async def get_recommended_routes(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    duration_minutes: Annotated[float | None, Query(description="Override today's planned duration")] = None,
    target_tss: Annotated[float | None, Query(description="Override today's planned TSS")] = None,
    category: Annotated[str | None, Query(description="Override today's session category")] = None,
    indoor: Annotated[bool | None, Query(description="Rank trainer routes first (true) or roads first (false)")] = None,
) -> dict:
    """Ranks the athlete's own routes against today's plan (duration + TSS
    target), so "ride this today" points at a real road they have ridden
    before rather than an invented one.

    ``{"available": false, "reason": "..."}`` in every case where a confident
    suggestion cannot be made — no planned cycling session today, a rest day,
    or no GPS route history yet — rather than guessing. The reason is a stable
    machine string (not translated copy); the frontend owns the wording.
    """
    # ── ANY SESSION, NOT ONLY TODAY'S ────────────────────────────────────
    # The plan card asks this question once per day of the week, so the target
    # has to be a parameter. Without overrides it still answers about today,
    # which is what every existing caller wants — the query params are an
    # override, never a second mode.
    overridden = duration_minutes is not None or target_tss is not None
    if overridden:
        planned = {
            "sport": "cycling",
            "title": None,
            "duration_minutes": duration_minutes,
            "target_tss": target_tss,
            "category": category,
        }
    else:
        ctx = await load_today_context(db, user.id)
        planned = ctx.planned
        if not planned or planned.get("sport") != "cycling":
            return {"available": False, "reason": "no_planned_ride_today"}

    library = await load_route_library(db, user.id)
    if not library["available"]:
        return {"available": False, "reason": "no_route_history"}

    ranked = recommend_routes(
        library["routes"],
        target_duration_minutes=planned.get("duration_minutes"),
        target_tss=planned.get("target_tss"),
        category=planned.get("category"),
        today=date.today(),
        # Indoors flips which routes are rideable at all: suggesting a mountain
        # road for a 2x20 on the trainer is as useless as suggesting Watopia
        # for a Sunday in the hills.
        indoor=indoor,
    )
    if not ranked:
        return {"available": False, "reason": "no_target_to_match"}

    def _r(v: float | None, places: int = 3) -> float | None:
        return round(v, places) if v is not None else None

    def _out(fit):
        return {
            "route": fit.route,
            "score": round(fit.score, 3),
            # The unpenalised shape match, so the surface can say "right shape,
            # thin evidence" rather than collapsing both into one number.
            "raw_fit": round(fit.raw_fit, 3),
            # Per-term breakdown. The surface words these itself — the API
            # states WHICH factors matched and how well, never the copy.
            "duration_fit": _r(fit.duration_fit),
            "tss_fit": _r(fit.tss_fit),
            "terrain_fit": _r(fit.terrain_fit),
            "climb_fit": _r(fit.climb_fit),
            "is_low_confidence": fit.is_low_confidence,
            "is_virtual": fit.is_virtual,
            "is_recently_ridden": fit.is_recently_ridden,
        }

    # Every scored road, best first. The old shape returned one "top" plus a
    # few alternatives, which framed this as a single answer with also-rans;
    # in practice several roads fit a given session and the athlete picks on
    # things the model cannot see (traffic, who they are riding with, whether
    # they can face that climb today). `top` is kept so existing clients do
    # not break, but `matches` is the real payload.
    matches = [_out(f) for f in ranked[:MAX_MATCHES]]

    return {
        "available": True,
        "planned": {
            "title": planned.get("title"),
            "target_tss": planned.get("target_tss"),
            "duration_minutes": planned.get("duration_minutes"),
            "category": planned.get("category"),
        },
        "matches": matches,
        "top": matches[0],
        "alternatives": matches[1 : 1 + MAX_ALTERNATIVES],
    }
