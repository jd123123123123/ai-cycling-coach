from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PlannedWorkout(Base):
    """Minimal PlannedWorkout stub (Phase 4). Phase 7 extends with AI-generated
    intervals, periodization metadata, etc. Keep this schema stable — additive
    changes only when Phase 7 arrives.
    """
    __tablename__ = "planned_workouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    sport: Mapped[str] = mapped_column(String(30), nullable=False)  # "cycling" | "running" | "gym"
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    duration_seconds_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # interval_structure JSON schema (formalized in plan 04-04):
    #   { "intervals": [{ "duration_seconds": int, "power_target_pct_ftp": float | null, "zone": int 1..7 }] }
    interval_structure: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True,
    )

    user: Mapped["User"] = relationship("User", back_populates="planned_workouts")  # noqa: F821
