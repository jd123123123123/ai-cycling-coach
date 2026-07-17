"""Strength training subsystem.

Athletes define named routines (their splits: "3er Split Push", "Pull", …),
each holding an ordered list of exercises. They log sessions with actual
weights; the next session prefills from the most recent logged weights.

Four tables:
    strength_routines   — a named split owned by a user, with ordered exercises
    routine_exercises   — the exercises inside a routine (name + targets)
    strength_sessions   — a logged workout instance (optionally against a routine)
    strength_set_logs   — the individual sets performed in a session
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class StrengthRoutine(Base):
    __tablename__ = "strength_routines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True,
    )

    exercises: Mapped[list["RoutineExercise"]] = relationship(
        "RoutineExercise",
        back_populates="routine",
        cascade="all, delete-orphan",
        order_by="RoutineExercise.position",
    )


class RoutineExercise(Base):
    __tablename__ = "routine_exercises"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    routine_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("strength_routines.id", ondelete="CASCADE"), nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    target_sets: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    target_reps: Mapped[str] = mapped_column(String(20), nullable=False, default="8-12")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    routine: Mapped["StrengthRoutine"] = relationship(
        "StrengthRoutine", back_populates="exercises",
    )


class StrengthSession(Base):
    __tablename__ = "strength_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    routine_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("strength_routines.id", ondelete="SET NULL"), nullable=True,
    )
    performed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    sets: Mapped[list["StrengthSetLog"]] = relationship(
        "StrengthSetLog",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="StrengthSetLog.set_index",
    )


class StrengthSetLog(Base):
    __tablename__ = "strength_set_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("strength_sessions.id", ondelete="CASCADE"), nullable=False,
    )
    exercise_name: Mapped[str] = mapped_column(String(120), nullable=False)
    set_index: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    reps: Mapped[int] = mapped_column(Integer, nullable=False)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)

    session: Mapped["StrengthSession"] = relationship(
        "StrengthSession", back_populates="sets",
    )
