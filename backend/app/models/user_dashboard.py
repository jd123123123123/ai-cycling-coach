"""UserDashboard — a saved bento layout of ChartSpecs.

Storage strategy: store `layout` and `charts` as JSON columns rather than
splitting into a separate `dashboard_charts` row-per-chart table. The data
is small (15 charts max per dashboard, each spec ~1 KB), always loaded
together, never queried by inner field, and the UI persists every move/
edit as a single PUT — a JSON blob is the right grain.

RLS-protected so even a shared SQL query can only see the caller's rows.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserDashboard(Base):
    __tablename__ = "user_dashboards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(400), nullable=True)

    # Frontend persists the whole composition as JSON. Schemas are validated
    # in the API layer (UserDashboardWrite) — at the DB layer we treat them
    # as opaque blobs to keep migrations cheap as the spec evolves.
    layout: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    charts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True,
    )
