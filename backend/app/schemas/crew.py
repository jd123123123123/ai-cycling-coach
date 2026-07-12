"""Pydantic schemas for the Crew API."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


# ──────────────────────────────────────────────────────────────────────
# Read shapes
# ──────────────────────────────────────────────────────────────────────


class CrewMemberRead(BaseModel):
    user_id: int
    handle: str          # local-part of email, capitalised. No raw email.
    joined_at: datetime
    role: Literal["owner", "member"]


class CrewInviteRead(BaseModel):
    id: int
    invitee_email: str   # only returned for the crew's own pending invites
    created_at: datetime
    expires_at: datetime
    status: Literal["pending", "accepted", "revoked", "expired"]


class CrewRead(BaseModel):
    id: int
    name: str
    owner_user_id: int


class CrewMineResponse(BaseModel):
    crew: CrewRead | None = None
    members: list[CrewMemberRead] = Field(default_factory=list)
    pending_invites: list[CrewInviteRead] = Field(default_factory=list)


# ──────────────────────────────────────────────────────────────────────
# Write shapes
# ──────────────────────────────────────────────────────────────────────


class CrewCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)


class CrewInviteCreate(BaseModel):
    email: EmailStr


class InviteByUserCreate(BaseModel):
    user_id: int


class DiscoverMember(BaseModel):
    """A discoverable app member — handle only, never a raw email (privacy)."""
    user_id: int
    handle: str
    in_crew: bool   # already in some crew → can't be invited to yours


# ──────────────────────────────────────────────────────────────────────
# Standings
# ──────────────────────────────────────────────────────────────────────


class StandingRow(BaseModel):
    user_id: int
    handle: str
    is_you: bool
    weekly_score: int            # 0..1050, sum of daily points (cap 150/day)
    weekly_tss: int
    daily_pct: list[int]         # 7 entries Mon..Sun, capped at 150


class StandingsResponse(BaseModel):
    crew_id: int
    week_start: str              # ISO yyyy-mm-dd
    week_end: str                # ISO yyyy-mm-dd (Sunday)
    daily_target_tss: int
    standings: list[StandingRow]
