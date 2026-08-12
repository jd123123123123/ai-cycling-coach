"""/challenges/* — the rider's monthly personal challenges.

App-defined monthly targets (services/challenges.py) with real progress from the
rider's own activities and a real, one-time RideCoin payout on completion.
Distinct from /crews/challenges (crew-scoped, member-vs-member). RLS via
get_db_for_user.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.services import challenges

router = APIRouter(prefix="/challenges", tags=["challenges"])

_ERRORS = {
    "not_found": 404, "already_completed": 409, "too_many_custom": 409,
}


class CustomChallengeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    metric: str  # one of challenges.CHALLENGE_METRICS
    target: float = Field(gt=0)


class CustomChallengeEdit(BaseModel):
    title: str | None = Field(default=None, max_length=80)
    target: float | None = Field(default=None, gt=0)


def _raise(exc: ValueError):
    code = _ERRORS.get(str(exc), 400)
    raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.get("/mine", summary="Active monthly challenges with live progress + joinable catalog")
async def get_mine(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """The rider's active challenges (live progress, auto-completing and paying
    the reward when the target is met) plus the still-joinable catalog."""
    return await challenges.list_mine(db, current_user.id)


@router.post("/custom", summary="Create a rider-defined monthly challenge")
async def create_custom(
    body: CustomChallengeCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Create a custom challenge (title + metric + target). The tier and reward
    are derived from how ambitious the target is, so a trivial goal can't mint a
    gold reward."""
    try:
        return await challenges.create_custom(db, current_user.id, body.title, body.metric, body.target)
    except ValueError as exc:
        _raise(exc)


@router.patch("/{key}", summary="Edit a custom challenge (before it completes)")
async def edit_custom(
    key: str,
    body: CustomChallengeEdit,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    try:
        return await challenges.edit_custom(db, current_user.id, key, body.title, body.target)
    except ValueError as exc:
        _raise(exc)


@router.delete("/{key}", summary="Delete a custom challenge (before it completes)")
async def delete_custom(
    key: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    try:
        return await challenges.delete_custom(db, current_user.id, key)
    except ValueError as exc:
        _raise(exc)


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
