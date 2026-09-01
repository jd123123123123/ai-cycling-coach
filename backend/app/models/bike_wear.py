"""Per-component odometers — the state the bike economy runs on.

One row per rider per component. Two odometers, and the difference between them
is the whole design:

  ``km_since_service`` resets to zero on every service. It drives the harvest,
  the status, and the fresh-drivetrain earn bonus.

  ``km_total`` NEVER resets. It is the lifetime of that physical component and
  it is what cyclists actually brag about — "4 800 km on one chain" is a real
  boast in a way no invented score is. Only replacing the component starts it
  over, and the retired one keeps its number on the wall.

WHY A TABLE AND NOT A DERIVED VALUE. Kilometres since a service cannot be
computed from the activity feed alone, because the feed does not know when the
rider last cleaned their chain. The service event is the only thing that carries
that, so it has to be stored — and once it is stored, the odometer may as well
be too rather than being re-summed over every ride on every read.

RLS-protected via ``user_id``, the same policy shape as ``garage_assets``.
"""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BikeComponent(Base):
    """One serviceable component's wear, for one rider.

    Rows are created lazily on first read (see `services/workshop`), so a rider
    who has never opened the workshop has no rows and costs nothing — and a
    component added to the catalogue later simply starts existing for everyone
    at zero rather than needing a backfill.
    """

    __tablename__ = "bike_components"
    #: Uniqueness is per rider PER BIKE now. The index lives in the migration
    #: because it needs NULLS NOT DISTINCT — Postgres treats NULLs as distinct
    #: by default, which would let a bike_id-less row duplicate without limit,
    #: and that is precisely the invariant this table exists to hold.
    __table_args__ = ()

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    #: Which bicycle this component is fitted to. Nullable only so the column
    #: could be added without a rewrite; every migrated row was pointed at the
    #: rider's default bike, and new rows should always name one.
    bike_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("bikes.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    #: Matches a key of `services.bike_wear.COMPONENTS`.
    component_id: Mapped[str] = mapped_column(String(32), nullable=False)

    #: Resets on service. Drives harvest, status and the earn bonus.
    km_since_service: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    #: Never resets on service. The lifetime boast.
    km_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    #: How many times this component has been serviced, ever. Cheap to keep and
    #: it is the basis of the "records" surface that replaces streaks.
    services: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: The best `km_since_service` ever reached before a service — the personal
    #: record this component is chasing. Captured at service time because the
    #: live value is about to be destroyed by the reset.
    longest_run_km: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    #: When this component was last serviced. Doubles as the start of the
    #: CALENDAR clock for parts that age on one, which is why a rider can set it
    #: by answering "wann zuletzt?" rather than only by servicing in-app.
    last_service_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    #: How this component is maintained, where that changes the job. Only the
    #: chain uses it today: "oil" | "wax" | "dripwax", from
    #: `bike_wear.CHAIN_METHODS`. NULL means the default (oil), which is what
    #: most bicycles arrive with — not a judgement, just the common case.
    method: Mapped[str | None] = mapped_column(String(16), nullable=True)

    #: THE THIRD ODOMETER, and the one that decides money rather than points.
    #: Weighted kilometres since this PHYSICAL part was fitted — it survives
    #: every service and resets only on replacement. `km_since_service` answers
    #: "does it need cleaning", `km_total` is the rider's brag number in real
    #: road kilometres, and this one answers "is it worn out": a chain past
    #: 0,5 % elongation starts cutting the cassette, which is the single most
    #: expensive thing a maintenance app can fail to warn about.
    life_km: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0",
    )
    #: Whether the bicycle HAS this part — three states, and the third one is
    #: the point. True: confirmed, the clock runs. False: told us they have rim
    #: brakes or inner tubes, so never mention it again. NULL: never asked, so
    #: it is a question rather than a job. See `bike_wear.is_dormant`.
    owned: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    #: The last activity folded into this odometer. The idempotency key: a ride
    #: that has already been counted can never be counted twice, however many
    #: times ingestion replays it.
    last_activity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True,
    )


class ComponentMeasurement(Base):
    """One chain-checker reading, and the odometer it was taken at.

    THE PAIRING IS THE DATA. A reading of "0,5 %" alone says nothing; "0,5 %
    after 1 800 weighted kilometres" says this rider gets 3 600 km per percent,
    and two such pairs move the estimate off the generic prior onto their own
    drivetrain (see `bike_wear.calibrate_life`).

    The odometer is SNAPSHOTTED at the moment of the reading rather than
    recomputed later, so improving the wear model can never silently rewrite
    what a past measurement meant.

    RLS-protected via ``user_id``, the same policy shape as ``bike_components``.
    """

    __tablename__ = "component_measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    #: WHICH CHAIN THIS READING WAS TAKEN ON. `calibrate_life` fits a wear rate
    #: from these pairs, so measurements from four different drivetrains fitted
    #: as one is not a rounding error — it is the wrong curve.
    bike_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("bikes.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    #: Matches a key of `services.bike_wear.COMPONENTS`.
    component_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    #: The gauge reading in percent — 0.25 / 0.5 / 0.75 on a typical checker.
    measured_pct: Mapped[float] = mapped_column(Float, nullable=False)
    #: `bike_components.life_km` at the moment of the reading.
    life_km_at: Mapped[float] = mapped_column(Float, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
