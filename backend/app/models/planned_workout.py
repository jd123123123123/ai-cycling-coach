from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PlannedWorkout(Base):
    """Minimal PlannedWorkout stub (Phase 4). Phase 7 extends with AI-generated
    intervals, periodization metadata, etc. Keep this schema stable — additive
    changes only when Phase 7 arrives.

    Phase 6.2 additions:
        - ``indoor`` — flag set by the ``modify_planned_workout`` tool when the
          athlete asks to swap an outdoor session to a trainer / indoor ride.
          Template + power targets stay unchanged; only the flag changes.
        - ``blocks_source`` — tracks provenance of ``interval_structure`` so
          downstream UI (and future undo affordance in 06-04) can distinguish
          AI-prescribed plans from user-modified plans. Values:
              * ``ai_prescribed`` (default)
              * ``user_modified``
          Server_default ensures existing rows get ``ai_prescribed`` without a
          backfill step.
        - ``template_id`` — optional reference to the 12-template library
          (``app.services.workout_templates.TEMPLATES``). Nullable for legacy
          rows; populated on modification so the cascade has an anchor point.
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

    # Phase 6.2 — modification tracking
    indoor: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False,
    )
    blocks_source: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="ai_prescribed", default="ai_prescribed",
    )
    template_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True,
    )

    user: Mapped["User"] = relationship("User", back_populates="planned_workouts")  # noqa: F821
