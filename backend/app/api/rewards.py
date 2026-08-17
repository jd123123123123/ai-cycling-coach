"""/rewards/* — the rider's RideCoin wallet, ledger, and onboarding grants.

RideCoin is earned server-side at ride ingestion (see activity_service +
services/rewards). This router exposes the balance and history for the reward
screens, and awards the three fixed, one-time onboarding grants (photo, device,
bike) that give every rider the same 400 RC head start.

RLS-protected via get_db_for_user — a rider only ever sees their own wallet.
"""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.garage import GarageAsset
from app.models.rewards import (
    REASON_ONBOARDING_BIKE,
    REASON_ONBOARDING_DEVICE,
    REASON_ONBOARDING_PHOTO,
)
from app.models.user import User
from app.services import rewards

router = APIRouter(prefix="/rewards", tags=["rewards"])

# The three onboarding grants, keyed by the URL's `kind`. Amounts live in one
# place only — `rewards.ONBOARDING_GRANT_RC`.
_ONBOARDING_REASON_BY_KIND = {
    "photo": REASON_ONBOARDING_PHOTO,
    "device": REASON_ONBOARDING_DEVICE,
    "bike": REASON_ONBOARDING_BIKE,
}


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


async def _has_garage_bike(db: AsyncSession, user_id: int) -> bool:
    """Does this rider actually have a digitalised bike? The bike grant pays for
    a bike sitting in the garage (``garage_assets`` kind='bike'), never for an
    attempt: a render that the image model couldn't complete saves nothing, and
    must therefore pay nothing."""
    row = await db.execute(
        select(GarageAsset.id).where(
            GarageAsset.user_id == user_id, GarageAsset.kind == "bike",
        )
    )
    return row.first() is not None


@router.post(
    "/onboarding/{kind}",
    summary="Award a one-time onboarding grant (photo, device or bike); idempotent",
)
async def grant_onboarding(
    kind: Literal["photo", "device", "bike"],
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Award the fixed one-time grant for a completed onboarding step:
    125 RC photo, 125 RC device, 150 RC bike (``rewards.ONBOARDING_GRANT_RC``).

    Idempotent — each grant is given once, ever, so calling it again on a return
    visit is a no-op (``granted: 0``). Each grant is gated on the thing it pays
    for actually existing: the photo grant needs an avatar, the bike grant needs
    a bike in the garage, so neither can be claimed against nothing.
    """
    if kind == "photo" and not current_user.avatar_url:
        return {"granted": 0, "reason": "no_avatar_yet",
                **await rewards.get_wallet(db, current_user.id)}
    if kind == "bike" and not await _has_garage_bike(db, current_user.id):
        return {"granted": 0, "reason": "no_bike_yet",
                **await rewards.get_wallet(db, current_user.id)}

    reason = _ONBOARDING_REASON_BY_KIND[kind]
    granted = await rewards.grant_onboarding(db, current_user.id, reason)
    await db.commit()
    wallet = await rewards.get_wallet(db, current_user.id)
    return {"granted": granted, "reason": reason, **wallet}
