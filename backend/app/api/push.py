"""Web-push endpoints (roadmap P1.5) — subscribe / unsubscribe / test.

503 when VAPID keys are unconfigured so the client can hide the toggle
honestly instead of advertising a dead feature (the Bevel lesson).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.services.athlete_service import get_or_create_profile
from app.services.push_service import (
    add_subscription,
    push_configured,
    remove_subscriptions,
    send_user_push,
)
from app.config import settings

router = APIRouter(prefix="/push", tags=["push"])


def _require_configured() -> None:
    if not push_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push is not configured on this server (VAPID keys missing).",
        )


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict
    expirationTime: float | None = None  # noqa: N815 — Web Push API field name


@router.get("/vapid-key")
async def get_vapid_key() -> dict:
    _require_configured()
    return {"key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe(
    payload: PushSubscription,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    _require_configured()
    profile = await get_or_create_profile(db, current_user.id)
    n = await add_subscription(db, profile, payload.model_dump(exclude_none=True))
    return {"subscriptions": n}


@router.post("/unsubscribe")
async def unsubscribe(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    profile = await get_or_create_profile(db, current_user.id)
    await remove_subscriptions(db, profile)
    return {"ok": True}


@router.post("/test")
async def send_test(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Immediate test push to the caller's devices — lets the settings toggle
    prove the pipe end-to-end."""
    _require_configured()
    profile = await get_or_create_profile(db, current_user.id)
    n = await send_user_push(
        db, profile,
        "Push works 🎉",
        "This is what your morning brief will feel like.",
        "/dashboard?tab=today",
    )
    return {"delivered_to": n}
