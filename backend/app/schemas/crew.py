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
    # How many accepted members the crew has (owner included). Lets the
    # frontend render ONE unambiguous crew card — never "crew exists" and
    # "no crew yet" side by side.
    member_count: int = 1


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


class AcceptOptions(BaseModel):
    """Optional body for invite-accept endpoints.

    join_challenges — explicit opt-in (default FALSE) to the crew's
    PRE-EXISTING challenges. Joining a crew never silently enters the new
    member into a scoreboard; challenges created while they are a member
    include them as before.
    """
    join_challenges: bool = False


class DiscoverMember(BaseModel):
    """A discoverable app member — handle only, never a raw email (privacy)."""
    user_id: int
    handle: str
    in_crew: bool   # already in some crew → can't be invited to yours


# ──────────────────────────────────────────────────────────────────────
# Crew-mate ride history
# ──────────────────────────────────────────────────────────────────────


class CrewMemberRide(BaseModel):
    """One ride of a crew mate, as shown on their detail screen.

    DELIBERATELY NARROW. The crew has until now shared only aggregates, so
    listing a member's individual rides widens what riders reveal to each
    other; the owner approved that on 2026-08-17 for the training facts only.

    What is NOT here, and must not be added without a fresh decision:
    - **`route_polyline` / any GPS.** A track starting at someone's front door
      is their home address. Distance and duration say how hard they trained;
      a map says where they live.
    - `external_id`, `source`, `raw_data` — plumbing, not training.

    `title` IS included because it is what the rider themselves chose to call
    the ride, but it is nullable and never invented.
    """

    activity_id: int
    started_at: datetime
    title: str | None = None
    sport: str
    distance_km: float | None = None
    duration_s: int | None = None
    tss: int | None = None
    elevation_m: float | None = None
    avg_power_w: int | None = None


class CrewMemberRides(BaseModel):
    user_id: int
    handle: str
    period: str                  # week | month | year — the window asked for
    period_start: str            # ISO yyyy-mm-dd
    period_end: str
    rides: list[CrewMemberRide]
    total_rides: int             # rides in the window (may exceed `rides` length)


# ──────────────────────────────────────────────────────────────────────
# Standings
# ──────────────────────────────────────────────────────────────────────


class StandingRow(BaseModel):
    #: The rider's own collectible, as a 96 px WebP data URL, or None when they
    #: have not made one. A thumbnail rather than the avatar: eight full renders
    #: would be a megabyte of base64 in front of the numbers this screen is for.
    avatar: str | None = None
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
    # SAW COMPUTED, NEVER SENT. `crew_score.crew_standings_window` has always
    # put an `hours` figure in this row and this schema did not declare it, so
    # pydantic dropped it on the way out and `r.hours` was undefined in the
    # client — the board's hours column, which the frontend calls "the one
    # number on this board a rider can actually feel", rendered as nothing.
    hours: float | None = None         # moving time over the window (h)
    wkg: float | None = None           # ftp_watts / weight_kg (threshold W/kg)
    vo2max: float | None = None        # latest VO2max on/before window end
    # P1-10: points are the share of each rider's OWN weekly target
    # (their 4-week avg weekly TSS × 1.05, floor 60) — never a fixed
    # 120-TSS/day wall. Exposed so the footnote can say so.
    weekly_target_tss: int | None = None
    daily_target_tss: int | None = None  # weekly_target_tss / 7


class StandingsResponse(BaseModel):
    crew_id: int
    week_start: str              # ISO yyyy-mm-dd — window start
    week_end: str                # ISO yyyy-mm-dd — window end
    daily_target_tss: int        # the CALLER's own per-day bar (personal)
    standings: list[StandingRow]
    period: str = "week"                 # day | week | month | year
    period_start: str | None = None      # ISO yyyy-mm-dd (mirrors week_start)
    period_end: str | None = None        # ISO yyyy-mm-dd (mirrors week_end)
    weekly_target_tss: int | None = None # the CALLER's own weekly bar
    # Scoring semantics marker for the footnote: points = share of each
    # rider's own weekly target.
    points_basis: str = "own_weekly_target"


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
    # This rider's OWN bars (4-week history), never fixed walls.
    weekly_target_tss: int | None = None
    active_days_target: int | None = None


class DuelResponse(BaseModel):
    week_start: str
    week_end: str
    you_this_week: DuelStats
    you_last_week: DuelStats
    crew: list[DuelStats] = Field(default_factory=list)   # crew-mates this week (excl. you)
    # Caller's personal-challenge defaults: own 4-week avg weekly TSS × 1.05
    # (floor 60) and active-days 3..6 (never 7). Replaces the fixed 800 / 7.
    weekly_target_tss: int | None = None
    active_days_target: int | None = None
    # Last week's TSS at the same weekday+time — pace basis so early-week UI
    # can say "on pace vs last week" instead of a guaranteed 0 : <total> loss.
    last_week_at_now: int = 0
