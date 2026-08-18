"""/shop/* — the RideCoin sink: what you own, what you buy, what you wear.

Three endpoints, one shape. `GET /shop` is the whole garage in a single read
(balance + owned ids + loadout) because every shop surface needs all three to
decide whether a tile is owned, affordable or equipped — three round trips would
just be the same answer split up.

PRICES ARE NEVER IN A REQUEST. `POST /shop/buy/{item_id}` takes an id and
nothing else; the amount comes from `services/w3catalog`, the server's generated
mirror of the frontend catalogue. There is deliberately no body to tamper with.

The service raises typed refusals and this layer is the only place that turns
them into status codes: 404 unknown item, 409 already owned / not owned,
402 insufficient balance.

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

    This is also where the free first bike happens: `get_garage` runs the
    idempotent starter grant, so a rider who has never opened the shop still
    comes back owning the Rostlaube and wearing it. That makes this GET a
    writer, hence the commit — the alternative (a separate "initialise me" call)
    is a step that can be skipped and would leave riders with no bike.
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
    except shop.InsufficientBalanceError as e:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"{item_id} costs {e.price} RC — balance is {e.balance} RC",
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
