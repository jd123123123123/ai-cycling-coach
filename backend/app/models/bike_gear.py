"""What the rider OWNS and what they are WEARING.

One row per rider per item. A row existing means the item was bought — there is
no `source` column and no grant path, because in this catalogue there is no such
thing as a free item. `price_paid` is kept for the same reason it is kept on a
receipt: so a refund, a repricing or an audit can always answer what was
actually charged.

``equipped`` lives on the same row rather than in a separate loadout table.
The five slots come from `services.earn_modifiers.SLOTS`, and a loadout table
would have to hard-code one column per slot — which means a migration every time
a slot is added, and two places that can disagree about which slot an item
belongs to. A boolean plus the catalogue's own slot mapping cannot drift.

The one-item-per-slot rule is enforced in `services/gear.equip`, not by a
constraint: the slot is a property of the CATALOGUE, which the database does not
know about, and encoding it in a partial unique index would freeze the item→slot
mapping into schema.

RLS-protected via ``user_id``, the same policy shape as wallets and garage_items.
"""
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BikeGear(Base):
    """One owned item, and whether it is currently worn."""

    __tablename__ = "bike_gear"
    __table_args__ = (
        # The anti-double-buy guarantee. `gear.buy` inserts before debiting and
        # rolls the whole transaction back on conflict, so a rider can be told
        # "already owned" but can never be charged twice.
        UniqueConstraint("user_id", "item_id", name="uq_bike_gear_user_item"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    #: Matches a key of `services.earn_modifiers.MODIFIERS`.
    item_id: Mapped[str] = mapped_column(String(48), nullable=False)
    #: What was actually charged, at the price in force when it was bought.
    price_paid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    equipped: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    acquired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
