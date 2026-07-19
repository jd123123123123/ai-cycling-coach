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

    # Composite PK: id + recorded_at (hypertable partition column must be in PK).
    # autoincrement MUST be explicit on a composite PK — without it SQLAlchemy
    # doesn't fetch the BIGSERIAL back via RETURNING, the instance keeps
    # id=None, and any later same-session mutation of a freshly-inserted row
    # dies with "Can't update ... using NULL for primary key" (bit us when the
    # sleep-vitals pass started mutating rows right after insert).
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
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

    # Wake-vs-now biometric snapshot columns (today-runthrough Step 5).
    # Populated by services/biometrics_snapshot.py from daily_metric_samples +
    # Garmin training_readiness endpoint. All nullable — historic rows are
    # backfilled None and the service tolerates missing values.
    body_battery_wake: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body_battery_now: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body_battery_now_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    stress_wake: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stress_now: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hrv_overnight_avg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    training_readiness: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recovery_time_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Sleep vitals parsed from the raw Garmin sleep payload (migration
    # f3a4b5c6d7e8, populated by services/garmin_sleep_parser.py during sync).
    # All nullable — an untracked night stays None end-to-end, never a fake 0.
    # Skin temperature is deliberately absent: Garmin's free feed reports
    # skinTempDataExists=false, so there is no honest value to store.
    sleep_total_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_deep_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_light_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_rem_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_awake_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_awake_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    spo2_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    spo2_low: Mapped[int | None] = mapped_column(Integer, nullable=True)
    spo2_high: Mapped[int | None] = mapped_column(Integer, nullable=True)
    respiration_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    respiration_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    respiration_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_stress_avg: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Data source: "garmin" | "manual"
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Full raw API response for forward compatibility
    raw_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="daily_metrics")  # noqa: F821
