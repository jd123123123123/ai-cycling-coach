"""Challenge enrollment — a rider's stake in one monthly challenge.

Challenges are app-defined monthly targets (the catalog lives in
services/challenges.py). A rider *joins* one, and the app tracks their real
progress from their own activities. When the target is met, a fixed
tier-based RideCoin reward is paid once via the points ledger.

One row per (user, challenge_key, period). `awarded_rc`/`completed_at` are set
exactly once on completion — the uniqueness rule plus the awarded guard make the
payout idempotent. RLS-protected via user_id (same pattern as achievements).
"""
from datetime import date, datetime

from sqlalchemy import (
    Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ChallengeEnrollment(Base):
    __tablename__ = "challenge_enrollments"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "challenge_key", "period",
            name="uq_challenge_enrollment_user_key_period",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    challenge_key: Mapped[str] = mapped_column(String(48), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)  # "YYYY-MM"

    # Snapshotted from the catalog at join time so a later catalog tweak never
    # moves the goalposts on an in-flight challenge.
    metric: Mapped[str] = mapped_column(String(20), nullable=False)
    target: Mapped[float] = mapped_column(Float, nullable=False)
    tier: Mapped[str] = mapped_column(String(12), nullable=False)
    reward_rc: Mapped[int] = mapped_column(Integer, nullable=False)
    # Title for a rider-created ("custom:*") challenge; catalog challenges take
    # their title from services/challenges.py and leave this NULL.
    title: Mapped[str | None] = mapped_column(String(80), nullable=True)

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    awarded_rc: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # For completion-window boundaries (athlete-local month), snapshotted too.
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
