from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, field_validator


class TrainingGoals(BaseModel):
    target_ftp: int | None = None
    target_event_name: str | None = None
    target_event_date: str | None = None  # ISO date string e.g. "2026-09-15"
    weekly_hours: float | None = None
    # How hard the athlete wants to be pushed. Modulates ONLY the upside of the
    # adaptive engine (escalate/push volume + escalation eagerness); the HRV
    # back-off safety gate is never relaxed. See adaptive_readiness.ambition_from_intensity.
    push_intensity: Literal['steady', 'balanced', 'aggressive', 'all_in'] | None = None


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
    # IANA timezone (e.g. "Europe/Berlin") — drives every "what day is it?"
    # computation (athlete_time). Frontend sends
    # Intl.DateTimeFormat().resolvedOptions().timeZone.
    timezone: str | None = None

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            ZoneInfo(v)
        except Exception as exc:
            raise ValueError(f"Invalid IANA timezone: {v!r}") from exc
        return v


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

    # IANA timezone of the athlete (None → backend default Europe/Berlin)
    timezone: str | None = None

    # Timestamps
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
