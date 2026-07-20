from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, field_validator

# Weekday keys used by days_available / hard_day_blackouts (Monday-first,
# matching Python's date.weekday() order).
WEEKDAY_KEYS: tuple[str, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

Weekday = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
MotivationStyle = Literal["race_focused", "fitness_builder", "fun_variety"]
VarietyDial = Literal["steady", "mixed", "adventurous"]
ExperienceLevel = Literal["new", "returning", "seasoned"]


class DaysAvailable(BaseModel):
    """Weekday availability flags + the athlete's long-ride day.

    All days default to available — the onboarding row only needs the
    exceptions. ``long_day`` must itself be an available day.
    """

    mon: bool = True
    tue: bool = True
    wed: bool = True
    thu: bool = True
    fri: bool = True
    sat: bool = True
    sun: bool = True
    long_day: Weekday | None = None

    def available_days(self) -> list[str]:
        return [d for d in WEEKDAY_KEYS if getattr(self, d)]

    @field_validator("long_day")
    @classmethod
    def _long_day_known(cls, v: str | None) -> str | None:
        return v

    def model_post_init(self, __context) -> None:  # noqa: ANN001
        if not self.available_days():
            raise ValueError("days_available cannot mark every day unavailable")
        if self.long_day is not None and not getattr(self, self.long_day):
            raise ValueError(
                f"long_day {self.long_day!r} is marked unavailable in days_available"
            )


def _validate_blackouts(v: list[str] | None) -> list[str] | None:
    if v is None:
        return v
    seen: list[str] = []
    for day in v:
        if day not in WEEKDAY_KEYS:
            raise ValueError(f"Invalid weekday in hard_day_blackouts: {day!r}")
        if day not in seen:
            seen.append(day)
    if len(seen) >= 7:
        raise ValueError("hard_day_blackouts cannot cover all seven days")
    return seen


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

    # ── Plan-engine v2 inputs (all optional; see athlete_profile.py WHYs) ──
    days_available: DaysAvailable | None = None
    motivation_style: MotivationStyle | None = None
    variety_dial: VarietyDial | None = None
    experience_level: ExperienceLevel | None = None
    hard_day_blackouts: list[str] | None = None

    @field_validator("hard_day_blackouts")
    @classmethod
    def _validate_hard_day_blackouts(cls, v: list[str] | None) -> list[str] | None:
        return _validate_blackouts(v)

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

    # Plan-engine v2 inputs (nullable — unset means "not yet learned/asked")
    days_available: dict | None = None
    motivation_style: MotivationStyle | None = None
    variety_dial: VarietyDial | None = None
    experience_level: ExperienceLevel | None = None
    hard_day_blackouts: list[str] | None = None

    # Timestamps
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
