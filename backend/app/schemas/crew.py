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
    weekly_score: int            # sum of daily points (cap 150/day) over the window
    weekly_tss: int              # total TSS over the window
    daily_pct: list[int]         # ≤14 summed buckets across the window, capped at 150/day
    # Real per-member values over the SAME window — for metric re-ranking on the
    # leaderboard. Nullable: honest "—" where the source is missing. Elevation
    # and 5K-PR have no data source and are intentionally absent.
    distance_km: float | None = None   # cumulative ridden distance (km)
    wkg: float | None = None           # ftp_watts / weight_kg (threshold W/kg)
    vo2max: float | None = None        # latest VO2max on/before window end


class StandingsResponse(BaseModel):
    crew_id: int
    week_start: str              # ISO yyyy-mm-dd — window start
    week_end: str                # ISO yyyy-mm-dd — window end
    daily_target_tss: int
    standings: list[StandingRow]
    period: str = "week"                 # day | week | month | year
    period_start: str | None = None      # ISO yyyy-mm-dd (mirrors week_start)
    period_end: str | None = None        # ISO yyyy-mm-dd (mirrors week_end)


# ── Duel — head-to-head rich stats (You vs Last Week / You vs Crew) ──
class DuelStats(BaseModel):
    handle: str = "rider"
    user_id: int | None = None
    tss: int = 0
    distance_km: float = 0.0
    hours: float = 0.0
    kj: int = 0
    rides: int = 0
    active_days: int = 0
    best_tss: int = 0
    ring_score: int = 0
    avg_if: float = 0.0


class DuelResponse(BaseModel):
    week_start: str
    week_end: str
    you_this_week: DuelStats
    you_last_week: DuelStats
    crew: list[DuelStats] = Field(default_factory=list)   # crew-mates this week (excl. you)
