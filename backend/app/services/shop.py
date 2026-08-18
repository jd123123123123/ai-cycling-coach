"""The W3 shop — claim the free bike, sell the rest, wear what you own.

This is the RideCoin SINK the economy was missing. Four rules shape everything
in here:

1. THE PRICE IS THE SERVER'S. Every amount comes from `services/w3catalog`,
   which is generated from the frontend catalogue and drift-guarded by a test.
   No endpoint, and no function here, ever takes a price as an argument — a
   client that could name its own price could buy the 15 000 RC prototype for
   nothing.
2. OWNERSHIP IS A UNIQUE CONSTRAINT, NOT A CHECK. `garage_items` is unique on
   (user_id, item_id), so the stock-parts grant is safe to replay on every read
   and two simultaneous buys of the same bike cannot both land. The
   read-then-write check is only an early, friendly 409; the constraint is what
   actually holds.
3. THE ROW GOES IN BEFORE THE MONEY COMES OUT. `purchase` inserts the item and
   flushes FIRST; only once that insert survived does it write the (negative)
   ledger line. A rider who loses the race is told "already owned" and has not
   been charged, because the debit never happened.
4. THE FIRST BIKE IS CLAIMED, NOT GIVEN. `ensure_starter` hands out the free
   PARTS only; the free bike arrives through `claim_first_bike`, a deliberate
   act by the rider. That is what makes "does this rider own a bike" real server
   state — an onboarding gate can trust it on any device, where a localStorage
   flag re-onboards anyone who clears a cache or opens a second phone.

Callers own the transaction, matching `services/rewards`: these functions flush
so their writes are visible, and the API layer commits. The two exceptions are
the two places that MUST settle atomically — `purchase` commits its own
item+ledger pair, and rolls back the whole thing if the insert lost a race.
"""
from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.rewards import REASON_ONBOARDING_BIKE, REASON_PART_PURCHASE, Wallet
from app.models.shop import SOURCE_GRANT, SOURCE_PURCHASE, GarageItem, GarageLoadout
from app.services import bike_render, rewards, w3catalog
from app.services.rewards import _credit
from app.services.w3catalog import CATALOG, FREE_ITEM_IDS, STOCK_PARTS

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


class NotClaimableError(ShopError):
    """That item is not the free first bike, so it cannot be claimed. -> 400

    THE SECURITY BOUNDARY OF THE CLAIM PATH. `claim_first_bike` writes an
    ownership row at price 0, so it must accept nothing but a price-0 bike —
    without this, `POST /shop/claim/pro-prototype` would be 15 000 RC for free.
    """

    def __init__(self, item_id: str) -> None:
        super().__init__(f"not a free first bike: {item_id}")
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


async def _bike_km(db: AsyncSession, user_id: int, bike_id: str | None) -> float | None:
    """Kilometres ridden SINCE this bike was acquired — the only mileage that is
    honestly this bike's.

    The garage draws this number on the bike itself, and placement is a claim: a
    plate on the frame says "you did these kilometres on THIS bike". Rider
    lifetime distance would make that plate a lie on the day it matters most —
    a bike claimed this morning would announce thousands of kilometres it was
    never ridden, on a frame that is visibly box-fresh. So the window opens at
    `acquired_at` and nothing before it counts.

    Returns None when there is no bike or no ownership row; the garage renders
    that as no plate rather than a zero, because "no answer" and "you have ridden
    nothing on it yet" are different statements and only one of them is known.
    """
    if bike_id is None:
        return None
    rows = await db.execute(
        select(GarageItem.acquired_at).where(
            GarageItem.user_id == user_id, GarageItem.item_id == bike_id
        )
    )
    acquired = rows.scalars().first()
    if acquired is None:
        return None
    totals = await db.execute(
        select(func.coalesce(func.sum(Activity.distance_meters), 0.0)).where(
            Activity.user_id == user_id, Activity.started_at >= acquired
        )
    )
    return round(float(totals.scalars().first() or 0.0) / 1000.0, 1)


async def _render_state(
    db: AsyncSession, loadout: GarageLoadout | None
) -> tuple[str | None, str, str | None]:
    """The composed photograph of THIS build, if one has been rendered.

    A stock build has none by design — that picture is the static catalogue art
    the app already ships, so it costs nothing and needs no cache. Everything
    else is looked up, never rendered here: a read must not wait on an image
    model.

    Shared by `get_garage` and `claim_first_bike` because both return the whole
    garage shape to the same client cache. When the claim omitted these, the
    cache took `undefined` for all three the moment a rider got their first
    bike — the one moment every new rider passes through.
    """
    bike_id = loadout.bike_id if loadout is not None else None
    key = bike_render.build_key(bike_id, bike_render.slots_of(loadout))
    if not key or bike_render.is_stock(key):
        return key, "stock" if bike_render.is_stock(key) else "none", None
    row = await bike_render.get_cached(db, key)
    if row is None:
        return key, "none", None
    return key, row.status, row.image


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
# The free stock parts, and the first bike that has to be asked for.
# --------------------------------------------------------------------------- #
# Every price-0 part. Derived, not listed, so a future free part joins the grant
# without a code change — and the price-0 BIKES are deliberately not in here.
FREE_PART_IDS: tuple[str, ...] = tuple(
    i for i in FREE_ITEM_IDS if CATALOG[i].kind == w3catalog.KIND_PART
)


async def ensure_starter(db: AsyncSession, user_id: int) -> bool:
    """Give this rider the free PARTS. The bike is claimed, not given.

    Grants every price-0 stock part (`FREE_PART_IDS`) and nothing else: no bike,
    no loadout row, no onboarding grant. Those three belong to
    `claim_first_bike`, because a first bike that appears by itself on the first
    GET makes any "choose your bike" step theatre, and leaves the onboarding gate
    with nothing server-side to key off — a new device or a cleared cache would
    re-onboard a rider who has been riding for months.

    So the shape of a rider who has claimed nothing is: owns the four stock
    parts, owns NO bike, has NO `garage_loadout` row (hence `loadout.bike` comes
    back null — that null is the signal the gate reads).

    Idempotent by construction — it only inserts what is missing, and the unique
    constraint catches the case where a concurrent request got there first — so
    it stays safe to call on every read.

    Returns True when it wrote something. The caller commits.
    """
    owned = await _owned_ids(db, user_id)
    missing = [i for i in FREE_PART_IDS if i not in owned]
    if not missing:
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

    try:
        await db.flush()
    except IntegrityError:
        # Two first-loads raced. The other one granted the same free set, so the
        # rider is already whole — drop our duplicate and carry on.
        await db.rollback()
        logger.info("stock-parts grant raced for user %s; the other request won", user_id)
        return False
    return True


async def _owned_bike_ids(db: AsyncSession, user_id: int) -> set[str]:
    """Which of the rider's items are bikes, by the catalogue's word."""
    owned = await _owned_ids(db, user_id)
    return {
        i for i in owned
        if (item := w3catalog.get(i)) is not None and item.kind == w3catalog.KIND_BIKE
    }


async def claim_first_bike(db: AsyncSession, user_id: int, item_id: str) -> dict:
    """Hand over the free first bike, once, because the rider asked for it.

    Three refusals, in order:
    - `UnknownItemError` — nothing is sold under that id;
    - `NotClaimableError` — the id names something that is not a price-0 BIKE.
      This is the security boundary: claiming writes an ownership row at price 0,
      so it must never accept the 15 000 RC prototype (or a free part, which the
      rider already has from `ensure_starter`);
    - `AlreadyOwnedError` — the rider already owns a bike. This is the FIRST
      bike; it can be claimed once, ever. Every rider auto-granted a starter in
      the version this replaced therefore lands here and is a no-op.

    On success: the ownership row, the loadout wearing that bike plus the stock
    parts, and the one-time onboarding bike grant — which `grant_onboarding`
    keeps idempotent per reason, so a legacy rider who claimed it in the retired
    photo studio is not paid twice.

    Returns the same shape as `purchase`, at price 0. Commits, for the same
    reason `purchase` does: the item, the loadout and the credit settle together
    or not at all.
    """
    item = w3catalog.get(item_id)
    if item is None:
        raise UnknownItemError(item_id)
    if item.kind != w3catalog.KIND_BIKE or item.price != 0:
        raise NotClaimableError(item_id)

    await ensure_starter(db, user_id)

    if await _owned_bike_ids(db, user_id):
        raise AlreadyOwnedError(item_id)

    db.add(
        GarageItem(
            user_id=user_id,
            item_id=item_id,
            kind=item.kind,
            source=SOURCE_GRANT,
            price_paid=0,
        )
    )
    if await db.get(GarageLoadout, user_id) is None:
        db.add(
            GarageLoadout(
                user_id=user_id,
                bike_id=item_id,
                frame_id=STOCK_PARTS.get("frame"),
                wheels_id=STOCK_PARTS.get("wheels"),
                bars_id=STOCK_PARTS.get("bars"),
                saddle_id=STOCK_PARTS.get("saddle"),
            )
        )

    try:
        await db.flush()
    except IntegrityError:
        # Two taps at once. The other one made the rider a bike owner, so this
        # one must leave no second loadout and no second grant behind.
        await db.rollback()
        raise AlreadyOwnedError(item_id) from None

    await rewards.grant_onboarding(db, user_id, REASON_ONBOARDING_BIKE)
    await db.commit()

    loadout = await db.get(GarageLoadout, user_id)
    key, render_status, render_image = await _render_state(db, loadout)

    return {
        "item_id": item_id,
        "price": 0,
        "balance": await _balance(db, user_id),
        "owned": sorted(await _owned_ids(db, user_id)),
        "loadout": _loadout_dict(loadout),
        "build_key": key,
        "render_status": render_status,
        "render": render_image,
        # The claim is the moment a bike starts counting, so this is the one
        # response that must carry it: it goes null -> 0.0 here, and the garage
        # reads it straight from the cache without a refetch.
        "bike_km": await _bike_km(db, user_id, item_id),
    }


# --------------------------------------------------------------------------- #
# Spending.
# --------------------------------------------------------------------------- #
async def purchase(db: AsyncSession, user_id: int, item_id: str) -> dict:
    """Buy one catalogue item at the SERVER's price.

    Raises `UnknownItemError`, `AlreadyOwnedError`, `NotClaimableError` (the free
    first bike is claimed, not bought) or `InsufficientBalanceError`;
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
    if item.kind == w3catalog.KIND_BIKE and item.price == 0:
        # The free first bike is CLAIMED, not bought. Selling it here for 0 RC
        # would be a second, silent route to bike ownership that skips the
        # loadout and the onboarding grant — leaving the rider owning a bike
        # they are not wearing, which the onboarding gate would read as
        # half-onboarded forever.
        raise NotClaimableError(item_id)
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

    # THE SAME SHAPE AS A CLAIM, AND AS THE GARAGE. The client writes this
    # response straight into its cache instead of refetching (a refetch would
    # flash a stale balance on the one screen that just took the rider's
    # RideCoin), so any key missing here would land in that cache as `undefined`
    # — and a build_key of `undefined` reads as "no bike" downstream.
    loadout = await db.get(GarageLoadout, user_id)
    key, render_status, render_image = await _render_state(db, loadout)
    return {
        "item_id": item_id,
        "price": item.price,
        "balance": balance - item.price,
        "owned": sorted(owned | {item_id}),
        "loadout": _loadout_dict(loadout),
        # Buying changes what is OWNED, never what is worn, so the build and its
        # photograph are deliberately unchanged here.
        "build_key": key,
        "render_status": render_status,
        "render": render_image,
        "bike_km": await _bike_km(db, user_id, loadout.bike_id if loadout else None),
    }


async def equip(db: AsyncSession, user_id: int, item_id: str) -> dict:
    """Put an owned item on the bike.

    A bike goes to ``bike_id``; a part goes to the column named for its slot, so
    equipping a saddle can never displace a wheel. Raises `UnknownItemError` or
    `NotOwnedError` — the loadout may only ever point at things in `garage_items`.
    The caller commits.

    The loadout row is created here if it is missing. It usually is not — it is
    born with the first bike — but a rider who has claimed no bike still owns the
    stock parts and can therefore equip one, and that edge must be a loadout with
    a null bike, not a 500.
    """
    item = w3catalog.get(item_id)
    if item is None:
        raise UnknownItemError(item_id)

    await ensure_starter(db, user_id)

    if item_id not in await _owned_ids(db, user_id):
        raise NotOwnedError(item_id)

    loadout = await db.get(GarageLoadout, user_id)
    if loadout is None:
        loadout = GarageLoadout(user_id=user_id)
        db.add(loadout)

    if item.kind == w3catalog.KIND_BIKE:
        loadout.bike_id = item_id
    else:
        if item.slot not in w3catalog.PART_SLOTS:
            raise UnknownItemError(item_id)
        setattr(loadout, f"{item.slot}_id", item_id)

    await db.flush()
    return _loadout_dict(loadout)


async def reset_render(db: AsyncSession, build_key: str) -> None:
    """Drop a failed render so the next ask tries again.

    A failure is almost always the image model being briefly unavailable, and a
    build that failed once must not be permanently pictureless. Only `failed`
    rows are cleared — an `ok` render is never re-paid for, and a `pending` one
    is somebody else's in-flight work.
    """
    row = await bike_render.get_cached(db, build_key)
    if row is not None and row.status == bike_render.STATUS_FAILED:
        await db.delete(row)
        await db.commit()


async def get_garage(db: AsyncSession, user_id: int) -> dict:
    """Balance + everything owned + what is currently worn.

    Calls `ensure_starter` first, so a rider who has never touched the shop still
    comes back owning the free stock parts. NOT a bike: until they claim one,
    ``owned`` holds no bike and ``loadout`` is the all-null shape, ``bike``
    included. That null bike is exactly what the onboarding gate keys on, so it
    is always present as a key and never simply absent."""
    await ensure_starter(db, user_id)
    loadout = await db.get(GarageLoadout, user_id)
    bike_id = loadout.bike_id if loadout is not None else None

    key, render_status, render_image = await _render_state(db, loadout)

    return {
        "balance": await _balance(db, user_id),
        "owned": sorted(await _owned_ids(db, user_id)),
        "loadout": _loadout_dict(loadout),
        "build_key": key,
        "render_status": render_status,
        "render": render_image,
        # Computed here rather than on the client: honest mileage needs every
        # ride since the bike was claimed, which can be months of activities.
        # The client would have to download them all to add them up.
        "bike_km": await _bike_km(db, user_id, bike_id),
    }
