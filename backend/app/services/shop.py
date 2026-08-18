"""The W3 shop — grant the free bike, sell the rest, wear what you own.

This is the RideCoin SINK the economy was missing. Three rules shape everything
in here:

1. THE PRICE IS THE SERVER'S. Every amount comes from `services/w3catalog`,
   which is generated from the frontend catalogue and drift-guarded by a test.
   No endpoint, and no function here, ever takes a price as an argument — a
   client that could name its own price could buy the 15 000 RC prototype for
   nothing.
2. OWNERSHIP IS A UNIQUE CONSTRAINT, NOT A CHECK. `garage_items` is unique on
   (user_id, item_id), so the starter grant is safe to replay on every read and
   two simultaneous buys of the same bike cannot both land. The read-then-write
   check is only an early, friendly 409; the constraint is what actually holds.
3. THE ROW GOES IN BEFORE THE MONEY COMES OUT. `purchase` inserts the item and
   flushes FIRST; only once that insert survived does it write the (negative)
   ledger line. A rider who loses the race is told "already owned" and has not
   been charged, because the debit never happened.

Callers own the transaction, matching `services/rewards`: these functions flush
so their writes are visible, and the API layer commits. The two exceptions are
the two places that MUST settle atomically — `purchase` commits its own
item+ledger pair, and rolls back the whole thing if the insert lost a race.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rewards import REASON_ONBOARDING_BIKE, REASON_PART_PURCHASE, Wallet
from app.models.shop import SOURCE_GRANT, SOURCE_PURCHASE, GarageItem, GarageLoadout
from app.services import w3catalog
from app.services import rewards
from app.services.rewards import _credit
from app.services.w3catalog import CATALOG, FREE_ITEM_IDS, STARTER_BIKE_ID, STOCK_PARTS

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Errors — the API layer maps these onto status codes and nothing else does.
# --------------------------------------------------------------------------- #
class ShopError(Exception):
    """Base for every refusable shop outcome."""


class UnknownItemError(ShopError):
    """No such item is sold. -> 404"""

    def __init__(self, item_id: str) -> None:
        super().__init__(f"unknown item: {item_id}")
        self.item_id = item_id


class AlreadyOwnedError(ShopError):
    """The rider already has it — buying twice is refused, not double-charged. -> 409"""

    def __init__(self, item_id: str) -> None:
        super().__init__(f"already owned: {item_id}")
        self.item_id = item_id


class NotOwnedError(ShopError):
    """You can only wear what you own. -> 409"""

    def __init__(self, item_id: str) -> None:
        super().__init__(f"not owned: {item_id}")
        self.item_id = item_id


class InsufficientBalanceError(ShopError):
    """Not enough RideCoin. Carries both numbers so the UI can say how short. -> 402"""

    def __init__(self, item_id: str, price: int, balance: int) -> None:
        super().__init__(f"{item_id} costs {price} RC, balance is {balance} RC")
        self.item_id = item_id
        self.price = price
        self.balance = balance


# --------------------------------------------------------------------------- #
# Small reads.
# --------------------------------------------------------------------------- #
async def _owned_ids(db: AsyncSession, user_id: int) -> set[str]:
    rows = await db.execute(
        select(GarageItem.item_id).where(GarageItem.user_id == user_id)
    )
    return set(rows.scalars().all())


async def _balance(db: AsyncSession, user_id: int, *, lock: bool = False) -> int:
    """The rider's RideCoin. ``lock=True`` takes the wallet row FOR UPDATE, which
    is how concurrent purchases are serialised: the second buyer waits for the
    first to commit and then sees the balance it actually left behind, so two
    affordable-on-their-own purchases can never together overdraw the wallet."""
    wallet = await db.get(Wallet, user_id, with_for_update=True if lock else None)
    return int(wallet.balance) if wallet is not None else 0


def _loadout_dict(loadout: GarageLoadout | None) -> dict:
    """The fixed shape the frontend reads. Always five keys, even before the
    starter grant has run, so no caller has to special-case a missing loadout."""
    if loadout is None:
        return {"bike": None, "frame": None, "wheels": None, "bars": None, "saddle": None}
    return {
        "bike": loadout.bike_id,
        "frame": loadout.frame_id,
        "wheels": loadout.wheels_id,
        "bars": loadout.bars_id,
        "saddle": loadout.saddle_id,
    }


# --------------------------------------------------------------------------- #
# The free first bike.
# --------------------------------------------------------------------------- #
async def ensure_starter(db: AsyncSession, user_id: int) -> bool:
    """Give this rider everything that costs nothing, and put it on.

    Grants the starter bike plus every price-0 stock part (`FREE_ITEM_IDS`) and
    creates the loadout wearing them. Idempotent by construction — it only
    inserts what is missing, and the unique constraint catches the case where a
    concurrent request got there first — so it is safe to call on every read,
    which is exactly how a rider ends up with a bike without an onboarding step
    that could be skipped.

    Returns True when it wrote something. The caller commits.
    """
    owned = await _owned_ids(db, user_id)
    missing = [i for i in FREE_ITEM_IDS if i not in owned]
    loadout = await db.get(GarageLoadout, user_id)

    if not missing and loadout is not None:
        return False

    for item_id in missing:
        item = CATALOG[item_id]
        db.add(
            GarageItem(
                user_id=user_id,
                item_id=item_id,
                kind=item.kind,
                source=SOURCE_GRANT,
                price_paid=0,
            )
        )
    if loadout is None:
        db.add(
            GarageLoadout(
                user_id=user_id,
                bike_id=STARTER_BIKE_ID,
                frame_id=STOCK_PARTS.get("frame"),
                wheels_id=STOCK_PARTS.get("wheels"),
                bars_id=STOCK_PARTS.get("bars"),
                saddle_id=STOCK_PARTS.get("saddle"),
            )
        )

    try:
        await db.flush()
    except IntegrityError:
        # Two first-loads raced. The other one granted the same free set, so the
        # rider is already whole — drop our duplicate and carry on.
        await db.rollback()
        logger.info("starter grant raced for user %s; the other request won", user_id)
        return False

    # ── The onboarding bike grant, paid here now ──────────────────────────────
    # It used to be claimable only by photographing your bike in the studio
    # (`POST /rewards/onboarding/bike`, gated on a `garage_assets` row). The
    # studio is no longer a tab, so that 150 RC became unreachable and new
    # riders could only ever collect 250 of the 400 RC head start that the spec
    # calls EQUAL — while everyone who onboarded earlier kept their 400.
    #
    # Owning a bike is what the grant was always paying for, and now every rider
    # owns one the moment they look at the garage. `grant_onboarding` is
    # idempotent per reason, so a legacy rider who already claimed it in the
    # studio is not paid twice.
    await rewards.grant_onboarding(db, user_id, REASON_ONBOARDING_BIKE)
    return True


# --------------------------------------------------------------------------- #
# Spending.
# --------------------------------------------------------------------------- #
async def purchase(db: AsyncSession, user_id: int, item_id: str) -> dict:
    """Buy one catalogue item at the SERVER's price.

    Raises `UnknownItemError`, `AlreadyOwnedError` or `InsufficientBalanceError`;
    on success writes exactly one `garage_items` row and exactly one negative
    `part_purchase` ledger line, and commits them together.

    The order is load-bearing: lock the wallet, check, insert the item, and only
    then move the money. If the insert loses a race to a concurrent buy of the
    same item the whole transaction is rolled back before any debit exists, so a
    rider can be told "already owned" but can never be charged twice.
    """
    item = w3catalog.get(item_id)
    if item is None:
        raise UnknownItemError(item_id)

    await ensure_starter(db, user_id)

    # FOR UPDATE first: everything below reads a balance that no other purchase
    # by this rider can move until we commit.
    balance = await _balance(db, user_id, lock=True)

    owned = await _owned_ids(db, user_id)
    if item_id in owned:
        raise AlreadyOwnedError(item_id)
    if item.price > balance:
        raise InsufficientBalanceError(item_id, item.price, balance)

    db.add(
        GarageItem(
            user_id=user_id,
            item_id=item_id,
            kind=item.kind,
            source=SOURCE_PURCHASE,
            price_paid=item.price,
        )
    )
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise AlreadyOwnedError(item_id) from None

    # Signed credit: a purchase is a negative one. Context carries what was
    # bought so the ledger can say "Der Prototyp" and not just "-15000".
    await _credit(
        db, user_id, REASON_PART_PURCHASE, -item.price,
        context={"item_id": item_id, "kind": item.kind, "name": item.name},
    )
    await db.commit()

    return {
        "item_id": item_id,
        "price": item.price,
        "balance": balance - item.price,
        "owned": sorted(owned | {item_id}),
        "loadout": _loadout_dict(await db.get(GarageLoadout, user_id)),
    }


async def equip(db: AsyncSession, user_id: int, item_id: str) -> dict:
    """Put an owned item on the bike.

    A bike goes to ``bike_id``; a part goes to the column named for its slot, so
    equipping a saddle can never displace a wheel. Raises `UnknownItemError` or
    `NotOwnedError` — the loadout may only ever point at things in `garage_items`.
    The caller commits.
    """
    item = w3catalog.get(item_id)
    if item is None:
        raise UnknownItemError(item_id)

    await ensure_starter(db, user_id)

    if item_id not in await _owned_ids(db, user_id):
        raise NotOwnedError(item_id)

    loadout = await db.get(GarageLoadout, user_id)
    if loadout is None:  # pragma: no cover — ensure_starter always creates one
        raise NotOwnedError(item_id)

    if item.kind == w3catalog.KIND_BIKE:
        loadout.bike_id = item_id
    else:
        if item.slot not in w3catalog.PART_SLOTS:
            raise UnknownItemError(item_id)
        setattr(loadout, f"{item.slot}_id", item_id)

    await db.flush()
    return _loadout_dict(loadout)


async def get_garage(db: AsyncSession, user_id: int) -> dict:
    """Balance + everything owned + what is currently worn.

    Calls `ensure_starter` first, so a rider who has never touched the shop
    still gets a bike out of this rather than an empty garage."""
    await ensure_starter(db, user_id)
    return {
        "balance": await _balance(db, user_id),
        "owned": sorted(await _owned_ids(db, user_id)),
        "loadout": _loadout_dict(await db.get(GarageLoadout, user_id)),
    }
