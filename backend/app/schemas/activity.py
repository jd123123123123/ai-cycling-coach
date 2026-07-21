from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ActivityCreate(BaseModel):
    """Schema for creating a new activity.

    TSS is computed automatically from sport type + athlete profile thresholds.
    """

    sport: Literal["cycling", "running", "gym"]
    started_at: datetime
    duration_seconds: int = Field(..., gt=0, description="Activity duration in seconds")
    distance_meters: float | None = None
    # Total ascent in metres (Höhenmeter). Cycling-only; null for indoor/no-GPS.
    elevation_gain_m: float | None = None
    average_power: float | None = None
    normalized_power: float | None = None
    average_hr: int | None = None
    max_hr: int | None = None
    calories: int | None = None
    title: str | None = None
    source: str = "manual"
    external_id: str | None = None
    # Provider-supplied training load (e.g. COROS Training Load) used ONLY as a
    # TSS fallback when the sport-based computation can't produce one (no FTP /
    # no HR anchor). A computed Coggan/hrTSS always takes precedence.
    external_tss: float | None = None
    # Extra provider fields with no first-class column yet (elevation, cadence,
    # zones, laps). Preserved verbatim so nothing is dropped.
    raw_data: dict | None = None


class ActivityRead(BaseModel):
    """Schema for reading an activity from the database."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    started_at: datetime
    user_id: int
    sport: str
    duration_seconds: int | None
    distance_meters: float | None
    elevation_gain_m: float | None
    tss: float | None
    normalized_power: float | None
    average_power: float | None
    average_hr: int | None
    max_hr: int | None
    calories: int | None
    title: str | None
    source: str | None
    external_id: str | None
    raw_data: dict | None
    created_at: datetime


class ActivityListResponse(BaseModel):
    """Paginated list of activities."""

    activities: list[ActivityRead]
    count: int
