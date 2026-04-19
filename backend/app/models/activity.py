from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Activity(Base):
    """ORM model mapping to the existing activities hypertable.

    The activities table was created as a TimescaleDB hypertable in Phase 1
    migration a076ea752213. DO NOT run Alembic autogenerate against this table
    — the migrations/env.py include_object filter excludes it.

    Composite primary key: (id, started_at) — required for TimescaleDB
    hypertable partitioning on started_at.
    """

    __tablename__ = "activities"

    # Composite PK: id + started_at (hypertable partition column must be in PK).
    # autoincrement=True is required here: with a composite PK, SQLAlchemy does NOT
    # auto-detect which column is the serial one, so RETURNING ... id would be
    # omitted from INSERTs — breaking db.refresh() after flush ("Could not refresh
    # instance"). Explicitly marking id as autoincrement makes SQLAlchemy include it
    # in the INSERT's RETURNING clause.
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False, autoincrement=False
    )

    # Ownership
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # Sport classification
    sport: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # "cycling" | "running" | "gym"

    # Duration & distance
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_meters: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Training load
    tss: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Power metrics (cycling)
    normalized_power: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_power: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Heart rate metrics
    average_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # General metrics
    calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Data source
    source: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # "manual" | "garmin" | "synthetic"
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    raw_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="activities")  # noqa: F821
