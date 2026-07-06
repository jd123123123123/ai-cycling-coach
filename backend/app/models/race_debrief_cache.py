"""RaceDebriefCache — one cached RaceDebrief per (user, activity).

Mirrors PeriodReportCache: a JSONB payload + generated_at, RLS-protected, one
latest row per (user_id, activity_id) via UniqueConstraint + upsert.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger, DateTime, ForeignKey, Integer, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RaceDebriefCache(Base):
    __tablename__ = "race_debriefs"
    __table_args__ = (
        UniqueConstraint("user_id", "activity_id", name="uq_race_debriefs_user_activity"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    activity_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    report: Mapped[dict] = mapped_column(JSONB, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
