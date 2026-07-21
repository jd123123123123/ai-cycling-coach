"""Schemas for the post-ride RPE loop (V3 Ride Recap)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# The 4-tap scale on the recap's "How hard did that feel?" card.
RpeValue = Literal["easy", "moderate", "hard", "all_out"]


class RideFeedbackIn(BaseModel):
    rpe: RpeValue


class RideFeedbackRead(BaseModel):
    activity_id: int
    rpe: RpeValue | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
