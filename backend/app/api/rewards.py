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
from app.models.shop import GarageItem
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
    """Does this rider actually have a bike? Either kind counts.

    Originally this only asked `garage_assets` — a bike the rider had
    photographed and had rendered in the studio. The studio is no longer a tab
    (the bike ladder replaced it), so that question now answers "no" for every
    new rider forever, and the 150 RC would be unclaimable.

    Owning a catalogue bike counts too, which every rider does from their first
    look at the garage. In practice `shop.ensure_starter` already pays this
    grant directly; this widened check exists so the endpoint cannot answer
    "no_bike_yet" to someone who is visibly sitting on a bike.
    """
    asset = await db.execute(
        select(GarageAsset.id).where(
            GarageAsset.user_id == user_id, GarageAsset.kind == "bike",
        )
    )
    if asset.first() is not None:
        return True
    owned = await db.execute(
        select(GarageItem.id).where(
            GarageItem.user_id == user_id, GarageItem.kind == "bike",
        )
    )
    return owned.first() is not None


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


# ── the sealed chest ────────────────────────────────────────────────────────


def _ride_headline(activity) -> dict:
    """The four numbers the chest shows before it is opened. Deliberately the
    ride's own facts and nothing else: the coins are the surprise."""
    return {
        "title": activity.title,
        "started_at": activity.started_at.isoformat() if activity.started_at else None,
        "distance_km": round((activity.distance_meters or 0) / 1000, 1) or None,
        "elevation_m": round(activity.elevation_gain_m) if activity.elevation_gain_m else None,
        "duration_s": activity.duration_seconds,
        "tss": round(activity.tss) if activity.tss else None,
    }


async def _unlocks_for(db: AsyncSession, user_id: int, activity_id: int, lang: str) -> list[dict]:
    """What this ride BEAT, as reveal cards.

    Only real breakthroughs against the athlete's own 90-day bests — see
    `breakthrough_detector`. A chest with nothing to reveal simply has no cards;
    inventing an "achievement" for an ordinary Tuesday is how a reward screen
    teaches a rider to skip it.
    """
    from app.services.breakthrough_detector import detect_breakthroughs

    try:
        found = await detect_breakthroughs(db, user_id, recent_days=3, lang=lang)
    except Exception:  # a reveal is never worth failing the chest for
        return []
    return [
        {
            "kind": b.get("kind"),
            "headline": b.get("headline"),
            "detail": b.get("detail"),
            "value_w": b.get("value_w"),
            "prior_best_w": b.get("prior_best_w"),
            "gain_pct": b.get("gain_pct"),
        }
        for b in found
        if b.get("activity_id") == activity_id
    ]


@router.get("/chest", summary="The rider's newest unopened ride, and what it is holding")
async def get_chest(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: Literal["de", "en"] = "de",
) -> dict:
    """Drives the Today screen's locked bar.

    `sealed: false` is the normal state and the screen shows nothing — this is
    the one place in the app allowed to interrupt the day, so it only does it
    when there is genuinely a ride waiting.
    """
    chest = await rewards.sealed_chest(db, current_user.id)
    if chest is None:
        return {"sealed": False}

    from app.models.activity import Activity

    activity = (
        await db.execute(
            select(Activity).where(
                Activity.id == chest["activity_id"], Activity.user_id == current_user.id,
            )
        )
    ).scalars().first()
    if activity is None:
        # The ledger has coins for a ride this rider can no longer see (deleted
        # activity). Nothing to celebrate, and nothing to strand: report it
        # unsealed so the claim path can still bank it from the ride list.
        return {"sealed": False}

    unlocks = await _unlocks_for(db, current_user.id, chest["activity_id"], lang)
    return {
        "sealed": True,
        **chest,
        "ride": _ride_headline(activity),
        "unlocks": unlocks,
        "unlock_count": len(unlocks),
    }


@router.post(
    "/ride/{activity_id}/claim",
    summary="Open one ride's chest — the moment its coins reach the wallet",
)
async def claim_ride(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Banks every unclaimed line of one ride and returns the new balance.

    Idempotent: a second tap claims 0 and returns the same balance rather than
    an error. A rider who taps twice has done nothing wrong.
    """
    result = await rewards.claim_ride(db, current_user.id, activity_id)
    await db.commit()
    return {
        **result,
        "tier": rewards.tier_progress(result["balance"]),
    }
