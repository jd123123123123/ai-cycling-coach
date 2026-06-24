"""PeriodReportCache — one cached PeriodReport per (user, window).

Mirrors coach_briefs: a JSONB payload + generated_at, RLS-protected. Unlike
coach_briefs we keep only the latest row per (user_id, days) (UniqueConstraint
+ upsert) — a period report is derived analytics, not an audit trail.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger, DateTime, ForeignKey, Integer, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PeriodReportCache(Base):
    __tablename__ = "period_reports"
    __table_args__ = (UniqueConstraint("user_id", "days", name="uq_period_reports_user_days"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    days: Mapped[int] = mapped_column(Integer, nullable=False)
    report: Mapped[dict] = mapped_column(JSONB, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
