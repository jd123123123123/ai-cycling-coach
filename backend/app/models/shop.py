"""The W3 shop's two durable tables — what a rider OWNS and what they WEAR.

The RideCoin economy already had a faucet (`models/rewards`: wallets +
points_ledger) and no sink. These two tables are the sink's memory:

- ``garage_items``   — one row per (rider, item) they own, however it was got.
  The UNIQUE (user_id, item_id) constraint is the whole idempotency story: the
  starter grant can be replayed on every read, and two simultaneous buys of the
  same bike cannot both land, because the database refuses the second row. The
  purchase path inserts the row FIRST and only debits once that insert stuck, so
  a lost race costs the rider nothing.
- ``garage_loadout`` — one row per rider, the bike plus the four cosmetic slots
  currently on it. A loadout is a pointer, not a possession: it may only name
  ids the rider also owns in ``garage_items``.

``kind`` and ``source`` are deliberately plain strings, not two-value enums.
Seasons, rarity tiers, bundles and gifted items are all obvious next moves, and
none of them should need a migration to add a word to a vocabulary. The closed
set that actually matters (what exists and what it costs) lives in
`services/w3catalog`, which is generated from the frontend catalogue.

Both tables are RLS-protected via ``user_id`` — the same policy shape as
wallets / points_ledger / garage_assets.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# How an item entered the garage. Free things are granted, everything else is
# bought — open-ended on purpose (see the module docstring).
SOURCE_GRANT = "grant"
SOURCE_PURCHASE = "purchase"


class GarageItem(Base):
    """One thing a rider owns — a bike from the ladder or a cosmetic part.

    ``price_paid`` is the price AT ACQUISITION, recorded rather than looked up:
    the catalogue's prices will be tuned, and a rider's history of what they
    actually spent must not silently rewrite itself when it is. Grants are 0.
    """

    __tablename__ = "garage_items"
    __table_args__ = (
        UniqueConstraint("user_id", "item_id", name="uq_garage_item_user_item"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    item_id: Mapped[str] = mapped_column(String(48), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default=SOURCE_PURCHASE)
    price_paid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    acquired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


class GarageLoadout(Base):
    """What the rider's bike looks like right now: the frame under them and the
    four cosmetics on it.

    There is no row at all until the rider CLAIMS their first bike
    (`services/shop.claim_first_bike`) — a missing row is how the server says
    "this rider has no bike yet", which is what the onboarding gate reads.

    ``bike_id`` is nullable for one narrow case: a rider who has claimed no bike
    still owns the free stock parts and may equip one, and `shop.equip` creates
    the row for them rather than failing. The four slot columns are nullable so a
    slot can be left bare, and so a new slot can be added later without
    back-filling every rider.

    The slot columns are named ``<slot>_id`` to match `w3catalog.PART_SLOTS`
    exactly — `shop.equip` derives the column from the part's slot, so a new
    slot is a migration plus a catalogue re-sync and no branching code.
    """

    __tablename__ = "garage_loadout"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True,
    )
    bike_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    frame_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    wheels_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    bars_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    saddle_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


class BikeRender(Base):
    """The composed photograph of one BUILD — a bike wearing a set of parts.

    WHY THIS IS NOT PER-RIDER, AND HAS NO ``user_id``. The picture of a lime
    Rostlaube on gold rims is the same picture for everyone who builds one. The
    cache key is the build, so a combination is rendered ONCE for the entire
    user base and is free for every rider after the first — which is what makes
    paying an image model for this affordable at all. It is also why this table
    carries no RLS policy: there is nothing private in it, and two riders
    sharing a render is the point rather than a leak.

    WHY RENDER AT ALL. The alternative was drawing the bike as vectors so parts
    could be composited. That works, and it is honest, but it does not look like
    the rest of the catalogue: 26 bikes rendered by an image model next to one
    drawn by hand reads as a downgrade the moment a rider equips anything. So
    the parts are applied the same way the bikes were made — by the model, from
    the real base photograph, through the same locked camera.

    STATUS is the honest state machine: ``pending`` while a render is in flight,
    ``ok`` with an image, ``failed`` when the model refused or is unavailable.
    The UI shows the plain bike until an ``ok`` lands, so a slow or missing image
    model degrades to exactly what shipped before rather than to a hole.
    """

    __tablename__ = "bike_renders"

    # "<bike>|<frame>|<wheels>|<bars>|<saddle>", stock slots collapsed to "-".
    # Deterministic and human-readable, so a bad render can be found and deleted
    # by reading the key.
    build_key: Mapped[str] = mapped_column(String(255), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    # The composed WebP as a data URL. Nullable while pending or after a failure.
    image: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Why a render failed, kept for support rather than shown to riders.
    detail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
