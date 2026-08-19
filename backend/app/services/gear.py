"""Buying and wearing equipment. The only way an item is ever owned.

THERE IS NO GRANT PATH IN THIS FILE, and that is the point. No starter item, no
onboarding gift, no free tier, no promotional unlock. `buy` is the sole writer
of `bike_gear` rows and it always debits through `rewards.spend`. If a free item
is ever wanted it must be added deliberately and visibly here, not fall out of a
default somewhere.

PRICES ARE NEVER IN A REQUEST. `buy` takes an item id and nothing else; the
amount comes from the catalogue. There is deliberately no body to tamper with —
the same property `shop.purchase` had, kept.

THE ORDER IS LOAD-BEARING, and it is the same order `shop.purchase` used for the
same reason: insert the ownership row FIRST, then debit. If the insert loses a
race to a concurrent buy of the same item, the whole transaction rolls back
before any debit exists. A rider can be told "already owned"; they can never be
charged twice.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bike_gear import BikeGear
from app.models.rewards import REASON_PART_PURCHASE
from app.services import earn_modifiers as em
from app.services import rewards


class UnknownItemError(Exception):
    def __init__(self, item_id: str) -> None:
        super().__init__(f"no such item: {item_id}")
        self.item_id = item_id


class AlreadyOwnedError(Exception):
    def __init__(self, item_id: str) -> None:
        super().__init__(f"already owned: {item_id}")
        self.item_id = item_id


class NotOwnedError(Exception):
    def __init__(self, item_id: str) -> None:
        super().__init__(f"not owned: {item_id}")
        self.item_id = item_id


@dataclass(frozen=True)
class GearItem:
    """One catalogue entry as the shop screen needs it."""

    id: str
    name_de: str
    slot: str
    slot_label: str
    rarity: str
    pct: int
    price_rc: int
    why: str
    flavour_de: str
    owned: bool
    equipped: bool
    #: True when the rider could buy it right now. Shown rather than hiding the
    #: item: an item you cannot yet afford is a goal, and hiding goals is how a
    #: catalogue stops being something to work toward.
    affordable: bool


@dataclass(frozen=True)
class GearView:
    items: list[GearItem]
    balance: int
    slots: dict[str, str]


async def _owned(db: AsyncSession, user_id: int) -> dict[str, BikeGear]:
    rows = (
        await db.execute(select(BikeGear).where(BikeGear.user_id == user_id))
    ).scalars()
    return {r.item_id: r for r in rows}


async def read(db: AsyncSession, user_id: int) -> GearView:
    """The whole catalogue, marked up with what this rider owns and wears.

    A pure read — unlike the workshop, nothing is created lazily here, because
    an unowned item has no row by definition.
    """
    owned = await _owned(db, user_id)
    balance = await rewards.balance_of(db, user_id)
    items = [
        GearItem(
            id=m.id, name_de=m.name_de, slot=m.slot,
            slot_label=em.SLOTS.get(m.slot, m.slot), rarity=m.rarity,
            pct=m.pct, price_rc=m.price_rc, why=m.why, flavour_de=m.flavour_de,
            owned=m.id in owned,
            equipped=bool(owned[m.id].equipped) if m.id in owned else False,
            affordable=balance >= m.price_rc,
        )
        for m in em.catalogue()
    ]
    return GearView(items=items, balance=balance, slots=dict(em.SLOTS))


@dataclass(frozen=True)
class BuyResult:
    item_id: str
    name_de: str
    price: int
    balance: int


async def buy(db: AsyncSession, user_id: int, item_id: str) -> BuyResult:
    """Buy one catalogue item at the SERVER's price.

    Raises `UnknownItemError`, `AlreadyOwnedError`, or
    `rewards.InsufficientBalanceError`. In every refusal case not one RideCoin
    has moved and no row exists.

    The bought item is NOT auto-equipped. Equipping is a separate, deliberate
    act because the slots hold one item each — silently displacing something the
    rider chose would be worse than making them choose again.
    """
    item = em.MODIFIERS.get(item_id)
    if item is None:
        raise UnknownItemError(item_id)

    if item_id in await _owned(db, user_id):
        raise AlreadyOwnedError(item_id)

    # Row first, then money — see the module docstring.
    db.add(BikeGear(user_id=user_id, item_id=item_id, price_paid=item.price_rc))
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise AlreadyOwnedError(item_id) from None

    balance = await rewards.spend(
        db, user_id, item.price_rc, REASON_PART_PURCHASE,
        context={"item_id": item_id, "name": item.name_de, "slot": item.slot},
    )
    return BuyResult(
        item_id=item_id, name_de=item.name_de, price=item.price_rc, balance=balance,
    )


async def equip(db: AsyncSession, user_id: int, item_id: str) -> None:
    """Wear an owned item, displacing whatever shared its slot.

    The one-item-per-slot rule is enforced HERE rather than by a constraint,
    because the slot is a property of the catalogue and the database has no idea
    which slot an item belongs to. Encoding it in a partial index would freeze
    the item→slot mapping into schema and make re-slotting an item a migration.
    """
    item = em.MODIFIERS.get(item_id)
    if item is None:
        raise UnknownItemError(item_id)

    owned = await _owned(db, user_id)
    row = owned.get(item_id)
    if row is None:
        raise NotOwnedError(item_id)

    for other_id, other in owned.items():
        if other_id == item_id or not other.equipped:
            continue
        spec = em.MODIFIERS.get(other_id)
        if spec is not None and spec.slot == item.slot:
            other.equipped = False
    row.equipped = True
    await db.flush()


async def unequip(db: AsyncSession, user_id: int, item_id: str) -> None:
    """Take an item off. Owning it is unaffected."""
    row = (await _owned(db, user_id)).get(item_id)
    if row is None:
        raise NotOwnedError(item_id)
    row.equipped = False
    await db.flush()


async def equipped_ids(db: AsyncSession, user_id: int) -> list[str]:
    """What the rider is wearing — the input to `earn_modifiers.resolve`."""
    return [i for i, r in (await _owned(db, user_id)).items() if r.equipped]
