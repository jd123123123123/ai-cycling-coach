"""Crew Nudge — a funny trash-talk message sent to a crew-mate.

A lightweight social poke: one athlete nudges an opponent in their crew with a
witty pre-written line. Stored so the recipient can see unread nudges in their
notification feed and mark them read.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CrewNudge(Base):
    __tablename__ = "crew_nudges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    from_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    to_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    text: Mapped[str] = mapped_column(String(280), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
