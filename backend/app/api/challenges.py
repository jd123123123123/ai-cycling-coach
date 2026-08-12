"""/challenges/* — the rider's monthly personal challenges.

App-defined monthly targets (services/challenges.py) with real progress from the
rider's own activities and a real, one-time RideCoin payout on completion.
Distinct from /crews/challenges (crew-scoped, member-vs-member). RLS via
get_db_for_user.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.services import challenges

router = APIRouter(prefix="/challenges", tags=["challenges"])


@router.get("/mine", summary="Active monthly challenges with live progress + joinable catalog")
async def get_mine(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """The rider's active challenges (live progress, auto-completing and paying
    the reward when the target is met) plus the still-joinable catalog."""
    return await challenges.list_mine(db, current_user.id)


@router.post("/{key}/join", summary="Join a monthly challenge (idempotent)")
async def join_challenge(
    key: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    try:
        return await challenges.join(db, current_user.id, key)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
