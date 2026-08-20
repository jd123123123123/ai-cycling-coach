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
    __table_args__ = (
        UniqueConstraint("user_id", "component_id", name="uq_bike_component_user_kind"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
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
