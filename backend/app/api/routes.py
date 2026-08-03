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
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.services.daily_decision import load_today_context
from app.services.route_library import load_route_library
from app.services.route_recommendation import MAX_ALTERNATIVES, recommend_routes

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
) -> dict:
    """Ranks the athlete's own routes against today's plan (duration + TSS
    target), so "ride this today" points at a real road they have ridden
    before rather than an invented one.

    ``{"available": false, "reason": "..."}`` in every case where a confident
    suggestion cannot be made — no planned cycling session today, a rest day,
    or no GPS route history yet — rather than guessing. The reason is a stable
    machine string (not translated copy); the frontend owns the wording.
    """
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
    )
    if not ranked:
        return {"available": False, "reason": "no_target_to_match"}

    def _out(fit):
        return {
            "route": fit.route,
            "score": round(fit.score, 3),
            # The unpenalised shape match, so the surface can say "right shape,
            # thin evidence" rather than collapsing both into one number.
            "raw_fit": round(fit.raw_fit, 3),
            "duration_fit": round(fit.duration_fit, 3) if fit.duration_fit is not None else None,
            "tss_fit": round(fit.tss_fit, 3) if fit.tss_fit is not None else None,
            "is_low_confidence": fit.is_low_confidence,
            "is_virtual": fit.is_virtual,
        }

    return {
        "available": True,
        "planned": {
            "title": planned.get("title"),
            "target_tss": planned.get("target_tss"),
            "duration_minutes": planned.get("duration_minutes"),
        },
        "top": _out(ranked[0]),
        "alternatives": [_out(f) for f in ranked[1 : 1 + MAX_ALTERNATIVES]],
    }
