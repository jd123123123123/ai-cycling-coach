"""Crew tables — the friendship graph that powers the Squad Cup.

Three tables (see docs/superpowers/specs/2026-05-13-crew-backend-design.md
for the full design):

    crews              — the crew itself: id, name, owner_user_id
    crew_memberships   — accepted (user × crew) pairs (one crew per athlete)
    crew_invites       — pending invitations (token-bound to invitee email)

Privacy posture: no discovery, no public profiles. The only way to join is
via a token in an emailed invite link. Cascading deletes on the crew row
cleans up memberships and invites.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _invite_default_expiry() -> datetime:
    """14-day default expiry on a fresh invite."""
    return datetime.now(timezone.utc) + timedelta(days=14)


class Crew(Base):
    __tablename__ = "crews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    owner_user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    memberships: Mapped[list["CrewMembership"]] = relationship(
        back_populates="crew", cascade="all, delete-orphan"
    )
    invites: Mapped[list["CrewInvite"]] = relationship(
        back_populates="crew", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_crews_owner_user_id", "owner_user_id"),
    )


class CrewMembership(Base):
    __tablename__ = "crew_memberships"

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
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    # 'owner' or 'member'. Owners get the same scoring; they can disband
    # the crew but not be kicked from it.
    role: Mapped[str] = mapped_column(String(10), nullable=False, default="member")

    crew: Mapped[Crew] = relationship(back_populates="memberships")

    __table_args__ = (
        # An athlete is in at most one crew at a time (spec non-goal:
        # multi-crew membership). Defense-in-depth: also unique on the pair.
        UniqueConstraint("user_id", name="uq_crew_memberships_user_id"),
        UniqueConstraint("crew_id", "user_id", name="uq_crew_memberships_crew_user"),
        Index("ix_crew_memberships_crew_id", "crew_id"),
    )


class CrewInvite(Base):
    __tablename__ = "crew_invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    crew_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("crews.id", ondelete="CASCADE"),
        nullable=False,
    )
    inviter_user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # The address the invite was sent to. The invitee may not yet have an
    # account; we hold the address until they sign up + accept. Stored
    # lowercase at insert (the API enforces the lowercasing) so equality
    # checks are simple.
    invitee_email: Mapped[str] = mapped_column(String(254), nullable=False)
    token: Mapped[str] = mapped_column(String(48), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_invite_default_expiry,
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    crew: Mapped[Crew] = relationship(back_populates="invites")

    __table_args__ = (
        Index("ix_crew_invites_token", "token"),
        Index("ix_crew_invites_invitee_email_status", "invitee_email", "status"),
    )
