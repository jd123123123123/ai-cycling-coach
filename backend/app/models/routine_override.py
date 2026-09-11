"""The rider's own word on whether ONE ride was worth posting.

── WHY A TABLE AND NOT A COLUMN ON `activities` ────────────────────────────

A nullable `activities.routine_override` would have worked and would have saved
a join. Two reasons it is here instead:

1. `activities` is a TimescaleDB hypertable. `ALTER TABLE ... ADD COLUMN` on a
   hypertable touches every chunk, and on chunks that Timescale has compressed
   it is a restricted operation. A migration that stalls or errors on the
   hypertable at boot is the failure mode this repo has already lived through
   (see `bd9f2a4c7e13` and `rp7c2e9a41b8`). A new, tiny, ordinary table has
   none of that risk.
2. Overrides are sparse by design — the detector should be right almost always,
   so almost no ride will ever have a row here. A column would be NULL in
   millions of rows to serve thousands.

── NO FOREIGN KEY TO `activities`, AND THAT IS NOT AN OVERSIGHT ────────────

The hypertable's primary key must include its partition column and is therefore
composite `(id, started_at)`; `activities.id` alone carries no unique
constraint for Postgres to reference. Adding one here would fail the migration
and crash-loop the container on boot — it has happened. `ride_photos`,
`ride_scenes` and `ride_feedback` all carry bare BigInteger activity ids for
exactly this reason, and so does this.

The cost is that deleting an activity leaves an orphan row. That is handled
where the app deletes an activity, not by a constraint the database cannot
express — and an orphan override is inert anyway: nothing reads it without an
activity id to look up.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RideRoutineOverride(Base):
    """One row per ride the rider has ruled on. Absent row = detector decides."""

    __tablename__ = "ride_routine_overrides"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    #: BARE, NO FOREIGN KEY — see the module docstring. Unique: one ruling per
    #: ride, and the ride's owner is the only one who may write it.
    activity_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)

    #: Denormalised so ownership is checked without joining the hypertable —
    #: every write here is an authorisation check first.
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    #: True  — "this one IS routine, keep it out of the feed."
    #: False — "this one WAS worth posting", and it stays visible however
    #:         strongly the detector disagrees.
    #: There is no third value: clearing the ruling deletes the row, which is
    #: how a rider hands the decision back to the detector.
    is_routine: Mapped[bool] = mapped_column(Boolean, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    __table_args__ = (Index("ix_ride_routine_overrides_user", "user_id"),)
