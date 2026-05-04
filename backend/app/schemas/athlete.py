from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class TrainingGoals(BaseModel):
    target_ftp: int | None = None
    target_event_name: str | None = None
    target_event_date: str | None = None  # ISO date string e.g. "2026-09-15"
    weekly_hours: float | None = None


class AthleteProfileCreate(BaseModel):
    ftp_watts: int | None = None
    lthr_cycling: int | None = None
    running_threshold_pace_ms: float | None = None
    lthr_running: int | None = None
    max_heart_rate: int | None = None
    resting_heart_rate: int | None = None
    weight_kg: float | None = None
    date_of_birth: str | None = None
    weekly_hours_available: float | None = None
    primary_sport: str | None = None
    secondary_sports: list[str] | None = None


class AthleteProfileUpdate(BaseModel):
    ftp_watts: int | None = None
    lthr_cycling: int | None = None
    running_threshold_pace_ms: float | None = None
    lthr_running: int | None = None
    max_heart_rate: int | None = None
    resting_heart_rate: int | None = None
    weight_kg: float | None = None
    date_of_birth: str | None = None
    weekly_hours_available: float | None = None
    primary_sport: str | None = None
    secondary_sports: list[str] | None = None
    # Target event fields (Phase 7 periodization engine)
    target_event_date: date | None = None
    target_event_type: Literal['race', 'fondo', 'audax', 'maintenance'] | None = None
    target_priority: Literal['A', 'B', 'C'] | None = None


class AthleteProfileRead(BaseModel):
    id: int
    user_id: int

    # Cycling
    ftp_watts: int | None = None
    lthr_cycling: int | None = None

    # Running
    running_threshold_pace_ms: float | None = None
    lthr_running: int | None = None

    # General
    max_heart_rate: int | None = None
    resting_heart_rate: int | None = None
    weight_kg: float | None = None
    date_of_birth: str | None = None

    # Availability
    weekly_hours_available: float | None = None
    primary_sport: str | None = None
    secondary_sports: list[str] | None = None

    # Goals and history
    goals: dict | None = None
    ftp_history: list | None = None

    # Target event fields (Phase 7 periodization engine)
    target_event_date: date | None = None
    target_event_type: Literal['race', 'fondo', 'audax', 'maintenance'] | None = None
    target_priority: Literal['A', 'B', 'C'] | None = None

    # Timestamps
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
