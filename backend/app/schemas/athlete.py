from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, field_validator

# Weekday keys used by days_available / hard_day_blackouts (Monday-first,
# matching Python's date.weekday() order).
WEEKDAY_KEYS: tuple[str, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

Weekday = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
MotivationStyle = Literal["race_focused", "fitness_builder", "fun_variety"]
VarietyDial = Literal["steady", "mixed", "adventurous"]
ExperienceLevel = Literal["new", "returning", "seasoned"]
# UI depth register (onboarding depth selector ↔ Settings "Detailgrad").
DetailLevel = Literal["guide", "numbers", "pro"]

#: Ceiling on the stored target-event course, in bytes. Deliberately the same
#: 10 MB the crew tour uploader (crew_events.MAX_TOUR_BYTES) and the rehearsal
#: POST (schemas.rehearsal.MAX_GPX_BYTES) enforce — one GPX limit across the
#: app, restated here rather than imported so a schema module stays free of
#: service-layer imports.
MAX_TARGET_EVENT_GPX_BYTES = 10 * 1024 * 1024


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
    # Optional multi-day endurance preference. ``long_day`` remains the
    # primary/backwards-compatible value for older clients and generators.
    long_days: list[Weekday] | None = None

    def available_days(self) -> list[str]:
        return [d for d in WEEKDAY_KEYS if getattr(self, d)]

    @field_validator("long_day")
    @classmethod
    def _long_day_known(cls, v: str | None) -> str | None:
        return v

    def model_post_init(self, __context) -> None:  # noqa: ANN001
        if not self.available_days():
            raise ValueError("days_available cannot mark every day unavailable")
        selected = list(dict.fromkeys(self.long_days or ([] if self.long_day is None else [self.long_day])))
        if self.long_day is not None and self.long_day not in selected:
            selected.insert(0, self.long_day)
        if any(not getattr(self, day) for day in selected):
            bad = next(day for day in selected if not getattr(self, day))
            raise ValueError(f"long_day {bad!r} is marked unavailable in days_available")
        if selected:
            object.__setattr__(self, "long_days", selected)
            if self.long_day is None:
                object.__setattr__(self, "long_day", selected[0])


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


from app.schemas.plan_goal import CustomGoalInput


class TrainingGoals(BaseModel):
    custom_goal: CustomGoalInput | None = None
    custom_goal_recommendation: dict | None = None
    custom_goal_started: str | None = None
    custom_goal_block_end_date: str | None = None
    training_model: Literal["pyramidal", "polarized", "sweetspot"] | None = None
    target_ftp: int | None = None
    target_event_name: str | None = None
    target_event_date: str | None = None  # ISO date string e.g. "2026-09-15"
    weekly_hours: float | None = None
    # HOW MANY DAYS A WEEK THE RIDER WANTS TO RIDE. Asked during onboarding and
    # sent by `W3OnboardGoalsPage`, but undeclared here — so this schema
    # silently dropped it on every save, `coach_service` read it back as None,
    # and the periodizer's rest-day and quality-session caps never applied. The
    # rider answered the question and nothing downstream ever saw the answer.
    days_per_week: int | None = Field(default=None, ge=1, le=7)
    # How hard the athlete wants to be pushed. Modulates ONLY the upside of the
    # adaptive engine (escalate/push volume + escalation eagerness); the HRV
    # back-off safety gate is never relaxed. See adaptive_readiness.ambition_from_intensity.
    push_intensity: Literal['steady', 'balanced', 'aggressive', 'all_in'] | None = None
    # The rider's own season distance target in km. Set BY the rider — the
    # Fahrten dock refuses to fill its season meter against anything else
    # (a hardcoded 12 000 km once told new riders they were "hinter Plan").
    # 0 clears it.
    season_km_goal: int | None = Field(default=None, ge=0, le=100_000)
    # What stands on the hero stage: the photographed machine or the bought
    # collection bike. Without this the 15 000-RC catalogue bike changed
    # nothing a photographed-bike rider could ever see — the economy's largest
    # sink was cosmetically inert.
    stage_bike: Literal['photo', 'collection'] | None = None
    # Which backdrop the hero room wears. The catalogue of ids lives in the
    # frontend (w3stageThemes) — the server only remembers the choice, so a
    # new theme never needs a deploy here. Bounded to keep junk out.
    stage_theme: str | None = Field(default=None, max_length=32)
    # Which register the coach writes in (D10). The catalogue lives in
    # services/coach_prompt.COACH_VOICES; unknown values degrade to the default
    # voice rather than erroring, so this stays a plain bounded string.
    coach_voice: str | None = Field(default=None, max_length=24)


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


class WorkRhythm(BaseModel):
    """Der Alltag, den der Plan bisher nicht kannte.

    Vier Angaben. Mehr fuellt niemand aus, und weniger traegt nicht:
    Arbeitstage sagen, WANN Pendellast anfaellt; die Uhrzeiten sagen, welches
    Trainingsfenster uebrig bleibt und ob eine Fahrt ein Arbeitsweg sein kann;
    Modus und Dauer sagen, WIE VIEL Grundlagenlast der Weg bringt.

    `docs/2026-09-19-pendlerfehler-reizkonten.md`, Abschnitt 6.
    """

    work_days: list[str] = Field(default_factory=list)
    start: str | None = None
    end: str | None = None
    commute: Literal["bike", "partly", "none"] | None = None
    #: Je Richtung. Ein Arbeitsweg ueber zwei Stunden je Richtung ist kein
    #: Arbeitsweg mehr, sondern eine Ausfahrt -- und fast sicher ein Vertipper.
    commute_minutes: int | None = Field(default=None, ge=1, le=120)

    @field_validator("work_days")
    @classmethod
    def _tage(cls, v: list[str]) -> list[str]:
        for tag in v:
            if tag not in WEEKDAY_KEYS:
                raise ValueError(f"Unbekannter Wochentag: {tag!r}")
        return v

    @field_validator("start", "end")
    @classmethod
    def _uhrzeit(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            h, m = v.split(":")[:2]
            if not (0 <= int(h) <= 23 and 0 <= int(m) <= 59):
                raise ValueError
        except (ValueError, TypeError):
            raise ValueError(f"Uhrzeit muss HH:MM sein, nicht {v!r}")
        return v


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
    # The official course of the target event, as raw GPX text. This is the
    # ONLY writer for the column the route-rehearsal 'target_event' source
    # reads, so without it that source can only ever 404. Sending null clears
    # it. Never echoed back on the read model — see has_target_event_route.
    target_event_gpx: str | None = None
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
    work_rhythm: WorkRhythm | None = None

    # V3 Settings — suppress coach push notices on rest days (default ON).
    quiet_on_rest_days: bool | None = None

    # UI depth register — onboarding depth selector / Settings "Detailgrad".
    detail_level: DetailLevel | None = None

    @field_validator("hard_day_blackouts")
    @classmethod
    def _validate_hard_day_blackouts(cls, v: list[str] | None) -> list[str] | None:
        return _validate_blackouts(v)

    @field_validator("target_event_gpx")
    @classmethod
    def _validate_target_event_gpx(cls, v: str | None) -> str | None:
        """Bound the course in BYTES, and refuse anything that is plainly not GPX."""
        if v is None:
            return v
        if len(v.encode("utf-8")) > MAX_TARGET_EVENT_GPX_BYTES:
            raise ValueError(
                "that GPX file is too large — the limit is "
                f"{MAX_TARGET_EVENT_GPX_BYTES // (1024 * 1024)} MB"
            )
        if "<gpx" not in v[:4096].lower():
            raise ValueError("that file could not be read as a GPX route")
        return v

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
    # Whether an official course is stored for the target event — the GPX
    # itself is never echoed back (it can be megabytes and nothing renders it).
    has_target_event_route: bool = False

    # IANA timezone of the athlete (None → backend default Europe/Berlin)
    timezone: str | None = None

    # Plan-engine v2 inputs (nullable — unset means "not yet learned/asked")
    days_available: dict | None = None
    motivation_style: MotivationStyle | None = None
    variety_dial: VarietyDial | None = None
    experience_level: ExperienceLevel | None = None
    hard_day_blackouts: list[str] | None = None
    work_rhythm: dict | None = None

    # V3 Settings — suppress coach push notices on rest days
    quiet_on_rest_days: bool = True

    # UI depth register — onboarding depth selector / Settings "Detailgrad"
    detail_level: DetailLevel | None = None

    # Timestamps
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
