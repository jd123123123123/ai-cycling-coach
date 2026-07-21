"""CustomWorkout — an athlete-authored structured interval workout.

The user composes a session from typed blocks (warm-up / steady / interval /
ramp / free-ride / cool-down) in the in-app workout builder (the Zwift-style
editor), expressed in %FTP just like the template library. We store the block
list verbatim as JSON (the parametric shape from
``app.services.workout_templates.IntervalBlock``) and cache the server-computed
``estimated_tss`` / ``estimated_duration_s`` so lists render without recompute.

Ownership via ``user_id`` + Postgres RLS — the exact pattern used by
``ride_feedback`` / ``race_debriefs``. Absolute watts are NEVER stored here:
they are materialised from the athlete's current FTP at schedule time, so a
saved workout always scales with the rider's fitness.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger, DateTime, Float, ForeignKey, Integer, String, JSON, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CustomWorkout(Base):
    __tablename__ = "custom_workouts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    sport: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="cycling", default="cycling",
    )
    # The parametric block list — a JSON array of block dicts (see
    # app.services.custom_workout_blocks for the schema / validation). Always
    # %FTP, never watts.
    blocks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Server-computed caches (single source of truth is recomputed on every
    # write from `blocks` — never client-trusted).
    estimated_tss: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="0", default=0.0,
    )
    estimated_duration_s: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
        nullable=False,
    )
