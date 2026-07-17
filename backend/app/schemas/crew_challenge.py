"""Pydantic schemas for custom crew challenges."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ChallengeMetric = Literal[
    "tss", "distance_km", "active_days", "hours", "kj", "rides"
]


class ChallengeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    metric: ChallengeMetric
    target: float = Field(..., gt=0)
    period: Literal["week", "custom"] = "week"
    starts_on: date | None = None
    ends_on: date | None = None


class ChallengeParticipant(BaseModel):
    user_id: int
    handle: str
    value: float          # this member's sum of `metric` over the window
    reached: bool         # value >= target
    pct: int              # min(100, round(value/target*100))


class ChallengeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    metric: ChallengeMetric
    target: float
    period: str
    starts_on: date
    ends_on: date
    creator_handle: str
    created_at: datetime
    participants: list[ChallengeParticipant] = Field(default_factory=list)
