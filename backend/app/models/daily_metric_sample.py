from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DailyMetricSample(Base):
    """Intraday time-series sample for a single biometric.

    Stored in a TimescaleDB hypertable partitioned by recorded_at so
    date-range queries across 90+ days stay fast. One row per
    (user_id, recorded_at, metric_type) — app-layer dedup since the
    partition column must be in any unique constraint.

    Composite primary key: (id, recorded_at) — required for TimescaleDB
    hypertable partitioning on recorded_at.

    autoincrement=True on id is required: with a composite PK, SQLAlchemy
    does NOT auto-detect which column is the serial one, so RETURNING id
    would be omitted from INSERTs — breaking db.refresh() after flush.
    Explicitly marking id as autoincrement makes SQLAlchemy include it in
    the INSERT's RETURNING clause.
    """

    __tablename__ = "daily_metric_samples"

    # Composite PK: id + recorded_at (hypertable partition column must be in PK).
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False, autoincrement=False
    )

    # Ownership
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Metric type: "body_battery" | "stress" | "hr" | "hrv"
    metric_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # Numeric reading for this sample
    value: Mapped[float] = mapped_column(Float, nullable=False)

    # Housekeeping
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="daily_metric_samples")  # noqa: F821
