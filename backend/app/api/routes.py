"""Routes API — the athlete's own ridden routes, grouped from their GPS rides.

One endpoint: GET /routes/mine. Everything is computed from the athlete's own
activity streams (GPS/altitude) — no external route database and no map tiles.
RLS-protected via ``get_db_for_user``.
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.services.route_library import load_route_library

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
