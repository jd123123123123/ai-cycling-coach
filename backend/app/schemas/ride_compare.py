"""Contract for the head-to-head ride comparison ("duel")."""
from __future__ import annotations

from pydantic import BaseModel

Winner = str  # "self" | "rival" | "tie"


class RiderRef(BaseModel):
    user_id: int
    display_name: str
    is_self: bool


class ClimbDuel(BaseModel):
    label: str
    distance_m: float
    elev_gain_m: float
    self_time_s: int
    rival_time_s: int
    self_vam: float | None = None
    rival_vam: float | None = None
    self_wkg: float | None = None
    rival_wkg: float | None = None
    winner: Winner


class PowerDuel(BaseModel):
    duration_s: int
    self_watts: float
    rival_watts: float
    winner: Winner


class PacingDuel(BaseModel):
    metric: str            # "np" | "split" | "wprime_depth"
    self_value: float
    rival_value: float
    better: str            # "higher" | "lower"
    winner: Winner


class RideComparison(BaseModel):
    activity_id: int
    me: RiderRef
    rival: RiderRef
    overall_winner: Winner
    self_points: int
    rival_points: int
    headline: str
    climb_duels: list[ClimbDuel] = []
    power_duels: list[PowerDuel] = []
    pacing_duels: list[PacingDuel] = []
    lang: str = "en"
