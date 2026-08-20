"""Places riders have actually ridden — the shared half of the backdrop system.

THE IDEA THIS TABLE EXISTS FOR. `services/backdrops` holds nine stages written
by hand: a mountain pass, a coast road, a velodrome. They are honest but they
are generic, and the thing a rider actually wants on their hero is the place
they rode — the Dolomites, because they were in the Dolomites.

A per-rider version of that would be ruinous: every rider who climbed the same
pass would pay to generate their own picture of it, and no two would match. So a
place is GLOBAL. The first rider whose GPS resolves to it puts it on the map, it
is rendered ONCE as a shared plate, and from then on it exists for everyone —
the gallery grows as the app's riders go places, and two riders who both climbed
the Stelvio are looking at the same Stelvio.

TWO GATES, DELIBERATELY, and they are different in kind:

  · THE STAMP is earned and cannot be bought. `RiderPlaceStamp` says this rider
    was there, from their own GPS. Nothing in the app grants one any other way.
  · THE BACKDROP is bought, in RideCoin, and only by a rider holding the stamp.

Either alone would be worse. Earned-only makes the currency pointless on the one
reward riders most want; bought-only makes the Dolomites something a rider who
has never left the flatlands can own, which empties the whole thing of meaning.
Together the money asks "do you want it enough" and the stamp asks "did you go".

Ownership itself is NOT here: it reuses `garage.RiderBackdrop`, because owning
the Dolomites and owning the velodrome are the same fact about a rider, and the
stage picker should not care which of the two systems a stage came from.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Place(Base):
    """One place, shared by every rider in the app.

    NOT per-user and not row-level-secured, unlike almost everything else in
    this schema: the catalogue is common ground. The only rider-identifying
    columns are `discovered_by_user_id` and `discovered_by_activity_id`, which
    exist so the gallery can credit whoever put a place on the map.
    """

    __tablename__ = "places"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_place_slug"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    #: Stable id, derived from the resolved name. This is what `DayScene.backdrop`,
    #: `RiderStage.backdrop` and `RiderBackdrop.backdrop` store, namespaced
    #: ("place:dolomiten") so it can never collide with a hand-written stage id.
    slug: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    #: What the rider sees. The resolver's own words — a region, not a country.
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    #: Coarser groupings, for the passport. Either may be None: the resolver
    #: answers with a region name and nothing else, so these are filled only
    #: when it gave us something we could split honestly.
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)

    #: The BACKGROUND clause this place is rendered from, in the studio's
    #: language. Written once, from the terrain the discovering ride actually
    #: had, so the picture matches the riding rather than a travel brochure.
    prose: Mapped[str] = mapped_column(Text, nullable=False)
    #: The shared render: the place ALONE, no rider and no bike, used as an
    #: image reference when a rider's hero is composed into it. Null until the
    #: plate has been generated — a place exists on the map before it has a
    #: picture, and the gallery says so rather than hiding it.
    plate_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: What it costs in RideCoin. Stored rather than computed so a pricing
    #: change never silently re-prices what riders already saw in the shop.
    price_rc: Mapped[int] = mapped_column(Integer, nullable=False)

    #: Roughly where it is, from the discovering ride's first GPS fix. Kept for
    #: de-duplication of near-identical names and for a future map, never shown
    #: as a precise location.
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)

    #: Who found it first. The gallery credits them; nothing else reads this.
    discovered_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    #: NO FOREIGN KEY, matching `RideScene` above and `RideFeedback`.
    #: `activities` is a Timescale hypertable whose primary key must include
    #: the partition column, so it is composite ``(id, started_at)`` and
    #: `activities.id` alone cannot be referenced.
    discovered_by_activity_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


class RiderPlaceStamp(Base):
    """This rider rode there. Earned, permanent, and never for sale.

    The passport. One row per rider per place, written at ingestion from the
    ride's own first GPS fix, and the sole gate on being allowed to buy that
    place's backdrop.

    `rides` counts how often they have been back, because "I have ridden the
    Dolomites eleven times" is the kind of thing a rider wants their app to
    know — and because it is free to keep, given the row has to be touched on
    every ride there anyway.
    """

    __tablename__ = "rider_place_stamps"
    __table_args__ = (
        UniqueConstraint("user_id", "place_id", name="uq_rider_place_stamp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    place_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    rides: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    first_ridden_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
