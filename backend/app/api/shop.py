"""/shop/* — the RideCoin sink: what you own, what you claim, buy and wear.

Four endpoints, one shape. `GET /shop` is the whole garage in a single read
(balance + owned ids + loadout) because every shop surface needs all three to
decide whether a tile is owned, affordable or equipped — three round trips would
just be the same answer split up.

PRICES ARE NEVER IN A REQUEST. `POST /shop/buy/{item_id}` takes an id and
nothing else; the amount comes from `services/w3catalog`, the server's generated
mirror of the frontend catalogue. There is deliberately no body to tamper with.
`POST /shop/claim/{item_id}` is the same idea with a harder edge: it writes an
ownership row for free, so it accepts nothing but a price-0 bike.

The service raises typed refusals and this layer is the only place that turns
them into status codes: 404 unknown item, 409 already owned / not owned,
402 insufficient balance, 400 not a free first bike.

RLS-protected via get_db_for_user — a rider only ever sees their own garage.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.services import shop

router = APIRouter(prefix="/shop", tags=["shop"])


@router.get("", summary="The rider's garage: RideCoin balance, owned items, current loadout")
async def get_shop(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Everything the shop and the garage need to render.

    `get_garage` runs the idempotent stock-parts grant, which makes this GET a
    writer — hence the commit. It does NOT hand out a bike: a rider who has
    never claimed one comes back with `loadout.bike == null` and no bike in
    `owned`, and that is the server-side fact the onboarding gate reads on every
    device instead of a localStorage flag.
    """
    garage = await shop.get_garage(db, current_user.id)
    await db.commit()
    return garage


@router.post(
    "/buy/{item_id}",
    summary="Buy one catalogue item at the server's price",
)
async def buy(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Spend RideCoin on a bike or a part.

    Returns the purchase plus the refreshed garage, so the caller never has to
    follow up with a GET to redraw. 404 unknown item, 409 already owned,
    402 insufficient balance — and in every refusal case not one RideCoin moved.
    """
    try:
        return await shop.purchase(db, current_user.id, item_id)
    except shop.UnknownItemError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No such item: {item_id}") from None
    except shop.AlreadyOwnedError:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already owned: {item_id}") from None
    except shop.NotClaimableError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{item_id} is the free first bike — claim it, don't buy it",
        ) from None
    except shop.InsufficientBalanceError as e:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"{item_id} costs {e.price} RC — balance is {e.balance} RC",
        ) from None


@router.post(
    "/claim/{item_id}",
    summary="Claim the free first bike — once, ever",
)
async def claim(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Take the free first bike as a deliberate act, and start wearing it.

    Returns the same shape as `/shop/buy` (at price 0) plus the loadout, so the
    onboarding step can draw the result without a follow-up GET. 404 unknown
    item, 409 the rider already owns a bike (this is the FIRST one), 400 for
    anything that is not a price-0 bike — the last is what stops a client from
    claiming the 15 000 RC prototype for nothing.
    """
    try:
        return await shop.claim_first_bike(db, current_user.id, item_id)
    except shop.UnknownItemError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No such item: {item_id}") from None
    except shop.AlreadyOwnedError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You already have a bike",
        ) from None
    except shop.NotClaimableError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"{item_id} is not a free first bike",
        ) from None


@router.post("/equip/{item_id}", summary="Wear an owned bike or part")
async def equip(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Move an owned item into its loadout slot (a bike into ``bike``, a part
    into its own slot). 404 unknown item, 409 when the rider does not own it."""
    try:
        loadout = await shop.equip(db, current_user.id, item_id)
    except shop.UnknownItemError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No such item: {item_id}") from None
    except shop.NotOwnedError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"You do not own {item_id}",
        ) from None
    await db.commit()
    return {"loadout": loadout}
