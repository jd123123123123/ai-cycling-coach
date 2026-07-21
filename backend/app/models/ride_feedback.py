"""RideFeedback — the athlete's 1-tap post-ride RPE ("how hard did that feel?").

One row per (user, activity). This is the persistence side of the V3 Ride
Recap "planned-vs-actual RPE loop": the subjective effort the athlete reports
after a ride, stored so it (a) re-hydrates the recap's selected chip on reload
and (b) is available to ride_compliance (RPE-power decoupling, Kolie Moore) and
next-week target tuning.

Ownership via user_id + RLS — same pattern as race_debriefs / period_reports.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RideFeedback(Base):
    __tablename__ = "ride_feedback"
    __table_args__ = (
        UniqueConstraint("user_id", "activity_id", name="uq_ride_feedback_user_activity"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    activity_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # One of: 'easy' | 'moderate' | 'hard' | 'all_out' — the 4-tap RPE scale
    # from the recap card (maps to session RPE ~2 / 4 / 7 / 9).
    rpe: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
