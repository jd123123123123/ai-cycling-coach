from datetime import date as date_type, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PlannedWorkoutCreate(BaseModel):
    date: date_type
    sport: Literal["cycling", "running", "gym"]
    title: str = Field(..., min_length=1, max_length=200)
    duration_seconds_target: int | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=2000)
    interval_structure: dict | None = None


class PlannedWorkoutUpdate(BaseModel):
    # All fields optional — used by drag-drop (date only) and general edits
    date: date_type | None = None
    sport: Literal["cycling", "running", "gym"] | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    duration_seconds_target: int | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=2000)
    interval_structure: dict | None = None


class PlannedWorkoutRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    date: date_type
    sport: str
    title: str
    duration_seconds_target: int | None
    description: str | None
    interval_structure: dict | None
    created_at: datetime


class PlannedWorkoutListResponse(BaseModel):
    planned_workouts: list[PlannedWorkoutRead]
    count: int
