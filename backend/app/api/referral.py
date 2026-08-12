"""/referrals/* — a recruiter's referral code, their referred riders, and claim.

A recruiter shares a stable code (derived from their user id); a referred
rider's ride earnings accrue a 10% cut into the recruiter's referral window,
which the recruiter claims once the 30-day window closes.

- GET  /referrals/mine            — my code + active/completed referrals.
- GET  /referrals/user/{id}       — one referred rider's detail card.
- POST /referrals/{id}/claim      — pay a completed window's accrued bonus.

The list/detail reads cross the RLS boundary (they show the referred rider's own
training) so the service runs them on the system session scoped to this
recruiter; claim pays the recruiter's OWN wallet and so uses the request's RLS db.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.services import referral

router = APIRouter(prefix="/referrals", tags=["referrals"])

_CLAIM_ERRORS = {
    "not_found": status.HTTP_404_NOT_FOUND,
    "not_ended": status.HTTP_409_CONFLICT,
    "nothing_to_claim": status.HTTP_409_CONFLICT,
}


@router.get("/mine", summary="My referral code and my active/completed referrals")
async def get_mine(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> dict:
    """This recruiter's shareable code plus their referred riders, split into
    active (window running) and completed (ended / claimed), each carrying the
    referred rider's real stats and the accrued 10% cut."""
    return await referral.list_mine(current_user.id)


@router.get(
    "/user/{referred_id}",
    summary="One referred rider's detail card (pending or ended)",
)
async def get_user(
    referred_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> dict:
    """The pending/ended detail for one of this recruiter's referred riders.
    404 when the caller has no referral for that rider."""
    card = await referral.user_detail(current_user.id, referred_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such referral")
    return card


@router.post(
    "/{referral_id}/claim",
    summary="Claim a completed referral's accrued bonus into your wallet",
)
async def claim(
    referral_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Pay the accrued bonus into the recruiter's ledger once (idempotent). The
    referral must belong to the caller and its 30-day window must have closed."""
    result = await referral.claim(db, current_user.id, referral_id)
    err = result.get("error")
    if err:
        raise HTTPException(_CLAIM_ERRORS.get(err, status.HTTP_400_BAD_REQUEST), err)
    return result
