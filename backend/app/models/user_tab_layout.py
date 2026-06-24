"""UserTabLayout — one row per user holding their per-tab card ordering.

`layouts` is a JSON blob keyed by tab id, each value an ordered list of
{id, hidden} dicts. One row per user (user_id unique). RLS-protected, same
pattern as UserDashboard — the API layer validates shape via TabLayoutsPayload.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserTabLayout(Base):
    __tablename__ = "user_tab_layouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    layouts: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )
