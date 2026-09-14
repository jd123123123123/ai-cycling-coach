"""Explicit rider input; no guessed event or free-text goal classification."""
from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class CustomGoalInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    target_date: date | None = None
    focus: Literal["auto", "endurance", "threshold", "vo2"] = "auto"
    duration_hours: float | None = Field(default=None, ge=0.5, le=36)
    distance_km: float | None = Field(default=None, ge=5, le=1200)
    ascent_m: float | None = Field(default=None, ge=0, le=20000)
    intent: Literal["finish", "faster", "race"] = "finish"
    name: str | None = Field(default=None, max_length=120)
    weekly_hours: float = Field(ge=1, le=30)
    days_per_week: int | None = Field(default=None, ge=1, le=7)
    days_available: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] | None = Field(default=None, min_length=1, max_length=7)

    @model_validator(mode="after")
    def require_course_demand(self):
        if self.focus == "auto" and self.target_date is None:
            raise ValueError("Choose an event date")
        if self.focus == "auto" and self.duration_hours is None and self.distance_km is None:
            raise ValueError("Choose ride duration or distance")
        if self.days_available is not None:
            if len(set(self.days_available)) != len(self.days_available):
                raise ValueError("Training days must be unique")
            self.days_per_week = len(self.days_available)
        if self.name is not None:
            self.name = self.name.strip() or None
        return self


class CustomGoalPreview(BaseModel):
    goal: CustomGoalInput
    focus: Literal["endurance", "threshold", "vo2"]
    focus_label: str
    rationale: str
    program: Literal["endurance_200k", "ftp_builder", "vo2_builder"]
    event_type: Literal["audax", "fondo", "race"]
    event_duration_hours: float
    duration_estimated: bool
    long_ride_target_minutes: int
    weeks_remaining: int
    climbing: bool
    method: Literal["rule_based"] = "rule_based"
