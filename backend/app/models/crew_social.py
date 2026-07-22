"""Crew social tables — the chat wall and the flexible reaction graph that back
the V3 · Social screen.

Two tables:

    crew_messages   — one chat line per (crew, author): free text (≤2000 chars),
                      newest-last in the wall.
    crew_reactions  — a flexible emoji reaction keyed by (target_type, target_id):
                      a member can cheer a chat message, a crew-mate's ride, an
                      event, or "the crew this week" (target_type='crew_week',
                      target_id NULL). Toggling is enforced by a unique key on
                      (user_id, target_type, target_id, emoji).

Crew-shared data (every crew member reads the same wall + reactions), so — like
the crews / crew_memberships / crew_events tables — there is NO row-level-security
policy here; access is scoped in the API by crew membership. Cascading deletes on
the crew and user rows clean these up.
"""

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CrewMessage(Base):
    __tablename__ = "crew_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    crew_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("crews.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_crew_messages_crew_id", "crew_id"),
        # The wall is paginated newest-first per crew, so (crew_id, id) is the
        # hot index.
        Index("ix_crew_messages_crew_id_id", "crew_id", "id"),
    )


class CrewReaction(Base):
    __tablename__ = "crew_reactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    crew_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("crews.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # What is being reacted to: 'message' | 'crew_week' | 'event' | 'ride'.
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # The target's id. NULL for 'crew_week' (there is one "cheer the crew this
    # week" bucket per crew, so the target is the crew itself, carried by crew_id).
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # A short emoji from the allowed set (🔥 💪 👏 🚀 🙌 ⚡).
    emoji: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        # One reaction per (user, target, emoji) — toggling deletes/re-inserts.
        # NOTE: Postgres treats NULLs as distinct in a UNIQUE constraint, so this
        # does NOT dedupe 'crew_week' rows (target_id IS NULL) at the DB level;
        # the API's read-then-toggle handles those. It fully dedupes the
        # message/event/ride targets that carry a concrete id.
        UniqueConstraint(
            "user_id",
            "target_type",
            "target_id",
            "emoji",
            name="uq_crew_reaction_user_target_emoji",
        ),
        Index("ix_crew_reactions_crew_id", "crew_id"),
        # Summaries fetch every reaction for a (crew, target_type, target_id).
        Index(
            "ix_crew_reactions_target",
            "crew_id",
            "target_type",
            "target_id",
        ),
    )
