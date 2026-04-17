from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DailyMetric(Base):
    """ORM model mapping to the existing daily_metrics TimescaleDB hypertable.

    The daily_metrics table was created as a TimescaleDB hypertable in Phase 1
    migration a076ea752213. DO NOT run Alembic autogenerate against this table
    — the migrations/env.py include_object filter excludes it.

    Composite primary key: (id, recorded_at) — required for TimescaleDB
    hypertable partitioning on recorded_at.

    Uniqueness on (user_id, date) is enforced at the service layer only.
    TimescaleDB requires the partition column (recorded_at) in all unique
    constraints, which is not meaningful for a date-level uniqueness rule.
    """

    __tablename__ = "daily_metrics"

    # Composite PK: id + recorded_at (hypertable partition column must be in PK)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False, default=func.now()
    )

    # Ownership
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # Calendar date (used for app-layer uniqueness checks)
    date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Biometric metrics from Garmin
    sleep_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hrv_status: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_battery: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resting_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stress_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    steps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Data source: "garmin" | "manual"
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Full raw API response for forward compatibility
    raw_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="daily_metrics")  # noqa: F821
