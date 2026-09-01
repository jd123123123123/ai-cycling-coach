"""A rider's bicycles — one row each.

WHY THIS TABLE EXISTS. Before it, the schema could not count past one bike:
`bike_components` was unique on (user_id, component_id), so there was exactly
one chain row per RIDER, and `activities` had no way to say which bicycle rode
a ride. A rider with a road bike, a gravel bike, a winter trainer and a project
frame had all four averaged into a single drivetrain — and since
`indoor_cycling` and `virtual_ride` both map to sport="cycling", turbo sessions
booked wear onto tyres that had never touched tarmac.

That is not cosmetic. `bike_wear.calibrate_life` fits a per-kilometre wear rate
from chain-checker readings, so measurements taken on four different chains were
being fitted as if they came from one.

`is_default` IS THE COMPATIBILITY SEAM. Every surface that is not yet bike-aware
reads the rider's default bike, which is the one their existing data was
migrated onto — so behaviour is unchanged until each surface is taught to ask
which bicycle. The partial unique index `uq_bikes_one_default_per_user` holds
the "exactly one" half of that promise in the database rather than in a comment.
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Bike(Base):
    __tablename__ = "bikes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    #: The rider's own name for it, seeded from their garage bike where they had
    #: one. Null is fine: a bicycle nobody has named is still a bicycle.
    name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    #: Exactly one per rider — enforced by a partial unique index, not here.
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: Set rather than deleted, so a sold bike keeps the rides and the service
    #: history that happened on it.
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True,
    )
