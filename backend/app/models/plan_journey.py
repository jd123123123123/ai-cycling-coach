"""A rider's chosen plan, independent of mutable generated four-week blocks."""
from datetime import date, datetime
from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class PlanJourney(Base):
    __tablename__ = 'plan_journeys'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    started_on: Mapped[date] = mapped_column(Date, nullable=False)
    planned_end: Mapped[date] = mapped_column(Date, nullable=False)
    ended_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default='active')
    goal: Mapped[dict] = mapped_column(JSON, nullable=False)
    baseline: Mapped[dict] = mapped_column(JSON, nullable=False)
    revisions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    outcome: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
