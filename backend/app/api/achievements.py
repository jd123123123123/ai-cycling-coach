"""Achievements API — server-detected training milestones (V2 · Achievements).

GET /achievements/mine runs the detectors (incremental — the altitude scan
only touches rides it has never seen), persists any new unlocks with the date
of the triggering ride/day, and returns unlocked + locked-with-progress
entries plus honest all-time totals. RLS-protected via get_db_for_user.
"""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.services import achievement_service

router = APIRouter(prefix="/achievements", tags=["achievements"])


@router.get("/records", summary="The rider's lifetime bests")
async def my_records(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Longest ride, highest climb, longest time, hardest ride — each with the
    ride it came from, so the profile can name the day rather than only the
    number. A record with no qualifying ride comes back as null; the screen
    then omits it rather than printing a zero."""
    from app.services import rider_records

    return await rider_records.lifetime(db, current_user.id)


@router.get(
    "/mine",
    summary="Unlocked + in-progress training milestones, detected server-side",
)
async def get_mine(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: Annotated[
        Literal["en", "de"],
        Query(description="Language for titles/details/progress labels"),
    ] = "en",
) -> dict:
    """Detect + persist milestones from the athlete's own data, then return:

    - **unlocked**: newest first, each with the triggering ride's date and a
      short value chip ("133 km", "Cat 3", "412 W") where one exists
    - **in_progress**: locked achievements with real numeric progress where an
      honest number exists ("7,431 of 10,000 kJ"); breakthrough-style unlocks
      carry `progress: null`
    - **counts / latest / all_time**: totals for the header ring + stat tiles

    Physiology + riding milestones only — no login streaks, no XP.
    """
    return await achievement_service.get_achievements(db, current_user.id, lang)
