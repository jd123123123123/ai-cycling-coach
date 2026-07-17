"""Crew Challenge — a custom goal a crew member sets for the whole crew.

One athlete defines a challenge (a metric + a target over a period); the app
tracks each crew member's progress and whether they've reached the target so
the frontend can fire confetti / a notification on completion.
"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CrewChallenge(Base):
    __tablename__ = "crew_challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    crew_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("crews.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    creator_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # one of: tss | distance_km | active_days | hours | kj | rides
    metric: Mapped[str] = mapped_column(String(20), nullable=False)
    target: Mapped[float] = mapped_column(Float, nullable=False)
    # "week" = the current crew week (Mon–Sun), or "custom"
    period: Mapped[str] = mapped_column(String(20), nullable=False, default="week")
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=func.false(),
    )
