"""/rewards/* — the rider's RideCoin wallet, ledger, and onboarding grants.

RideCoin is earned server-side at ride ingestion (see activity_service +
services/rewards). This router exposes the balance and history for the reward
screens, and awards the two fixed, one-time onboarding grants (photo + device)
that give every rider the same 250 RC head start.

RLS-protected via get_db_for_user — a rider only ever sees their own wallet.
"""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.rewards import REASON_ONBOARDING_DEVICE, REASON_ONBOARDING_PHOTO
from app.models.user import User
from app.services import rewards

router = APIRouter(prefix="/rewards", tags=["rewards"])


@router.get("/wallet", summary="RideCoin balance, recent ledger, and shop-tier progress")
async def get_wallet(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """The rider's current RideCoin balance, their most recent earn/spend
    entries, and where the balance sits against the next shop tier (for the
    Biker page's tier gauge)."""
    wallet = await rewards.get_wallet(db, current_user.id)
    return {**wallet, "tier": rewards.tier_progress(wallet["balance"])}


@router.get(
    "/ride/{activity_id}",
    summary="How a single ride's RideCoin was made (for the post-ride celebration)",
)
async def get_ride_breakdown(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """The base + streak-bonus breakdown for one ride, or ``banked: false`` when
    the ride hasn't earned RideCoin (no TSS, or not yet ingested)."""
    result = await rewards.ride_breakdown(db, current_user.id, activity_id)
    if result is None:
        return {"activity_id": activity_id, "banked": False, "total": 0,
                "base": 0, "streak_bonus": 0, "multiplier": 1.0}
    return result


@router.post(
    "/onboarding/{kind}",
    summary="Award a one-time onboarding grant (photo or device); idempotent",
)
async def grant_onboarding(
    kind: Literal["photo", "device"],
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Award the fixed 125 RC grant for adding a photo / connecting a device.

    Idempotent — each grant is given once, ever, so calling it again on a return
    visit is a no-op (``granted: 0``). The photo grant only lands once the rider
    actually has an avatar, so it can't be claimed against nothing.
    """
    if kind == "photo":
        if not current_user.avatar_url:
            return {"granted": 0, "reason": "no_avatar_yet", **await rewards.get_wallet(db, current_user.id)}
        reason = REASON_ONBOARDING_PHOTO
    else:
        reason = REASON_ONBOARDING_DEVICE

    granted = await rewards.grant_onboarding(db, current_user.id, reason)
    await db.commit()
    wallet = await rewards.get_wallet(db, current_user.id)
    return {"granted": granted, "reason": reason, **wallet}
