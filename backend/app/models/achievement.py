"""Achievement — one unlocked training milestone per (user, key).

The persistence the localStorage-v0 AchievementBadges component asked for:
unlocks are detected SERVER-side (achievement_service) from the athlete's own
activities + PMC + activity_streams, and stored once with the date of the
triggering ride/day — so the unlock date survives device switches.

`context` carries the trigger details (activity_id, value, category, …).
Keys with a leading underscore ('_climb_scan') are internal scan bookmarks and
are never returned by the API.

RLS-protected via user_id, same pattern as race_debriefs / period_reports.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Achievement(Base):
    __tablename__ = "achievements"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_achievements_user_key"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
