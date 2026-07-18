"""Climbs API — the athlete's own climbs, detected from their ride streams.

One endpoint: GET /climbs/mine. Everything is computed from the athlete's own
activity streams (altitude/distance/GPS/power) — no external climb database.
RLS-protected via ``get_db_for_user``.
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.services.climb_companion import load_athlete_climbs

router = APIRouter(prefix="/climbs", tags=["climbs"])


@router.get(
    "/mine",
    summary="Athlete's ridden climbs — detected, grouped, with PRs and a CP-anchored pacing plan",
)
async def get_my_climbs(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Detected climbs from the athlete's own rides. ``{"available": false,
    "climbs": []}`` when no GPS/altitude climbs are detectable yet, so the UI
    renders an honest empty state."""
    return await load_athlete_climbs(db, _user.id)
