from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ActivityStream(Base):
    """Per-second power/HR/cadence/altitude streams for one activity, plus the
    stream-derived science metrics computed by `activity_analysis.analyze_streams`.

    Keyed by `activity_id` (the activities sequence id is unique even though the
    hypertable's PK is composite). No FK to the `activities` hypertable — FKs to a
    TimescaleDB hypertable are awkward; ownership is enforced via `user_id` + RLS,
    matching the rest of the schema.

    `streams` holds the aligned 1 Hz arrays:
        {"power": [...], "heart_rate": [...], "cadence": [...], "altitude": [...]}
    plus, when the ride recorded them, the optional channels `latitude`,
    `longitude`, `speed`, `distance`, `temperature`, `left_right_balance`,
    `torque_effectiveness`, and `pedal_smoothness`.
    Stored as JSON for portability; downsample before persisting very long rides.

    `weather` is the Open-Meteo hourly JSON fetched for the ride's start
    location/time (best-effort; null when GPS or the fetch is unavailable).
    `has_gps` flags whether the ride carries a usable lat/lng track.
    """

    __tablename__ = "activity_streams"

    activity_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    streams: Mapped[dict] = mapped_column(JSON, nullable=False)
    mmp_curve: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    weather: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    has_gps: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Stream-derived scalars (mirrored here so queries don't re-parse the arrays).
    normalized_power: Mapped[float | None] = mapped_column(Float, nullable=True)
    decoupling_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_kj: Mapped[float | None] = mapped_column(Float, nullable=True)
    cp_watts: Mapped[float | None] = mapped_column(Float, nullable=True)
    w_prime_j: Mapped[float | None] = mapped_column(Float, nullable=True)
    eftp_watts: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
