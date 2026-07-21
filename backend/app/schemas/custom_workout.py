"""Pydantic schemas for the custom-workout builder API."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.services.custom_workout_blocks import CustomBlock


class CustomWorkoutWrite(BaseModel):
    """Create / update payload. `blocks` is the authored block list; TSS and
    duration are computed server-side and any client value is ignored."""

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    sport: str = Field(default="cycling", max_length=30)
    blocks: list[CustomBlock] = Field(min_length=1)


class CustomWorkoutRead(BaseModel):
    id: int
    name: str
    description: str | None
    sport: str
    blocks: list[dict]
    estimated_tss: float
    estimated_duration_s: int
    created_at: datetime
    updated_at: datetime


class ScheduleRequest(BaseModel):
    date: date


class ScheduleResponse(BaseModel):
    planned_workout_id: int
    date: date
    blocks_source: str
    estimated_tss: float
