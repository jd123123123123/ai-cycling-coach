"""Pydantic schemas for the Strength API."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ──────────────────────────────────────────────────────────────────────
# Exercises
# ──────────────────────────────────────────────────────────────────────


class ExerciseInput(BaseModel):
    """One exercise as supplied when creating/updating a routine."""
    name: str = Field(..., min_length=1, max_length=120)
    target_sets: int = Field(3, ge=1, le=50)
    target_reps: str = Field("8-12", max_length=20)


class ExerciseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    target_sets: int
    target_reps: str
    position: int


# ──────────────────────────────────────────────────────────────────────
# Routines
# ──────────────────────────────────────────────────────────────────────


class RoutineCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    notes: str | None = Field(None, max_length=1000)
    exercises: list[ExerciseInput] = Field(default_factory=list)


class RoutineUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    notes: str | None = Field(None, max_length=1000)
    # When provided (even empty), the routine's exercises are replaced wholesale.
    exercises: list[ExerciseInput] | None = None


class RoutineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    notes: str | None
    position: int
    archived: bool
    exercises: list[ExerciseRead] = Field(default_factory=list)


# ── Prefill ──


class PrefillSet(BaseModel):
    weight_kg: float
    reps: int
    rpe: float | None = None


class PrefillExercise(BaseModel):
    name: str
    target_sets: int
    target_reps: str
    last_sets: list[PrefillSet] = Field(default_factory=list)


class RoutineRef(BaseModel):
    id: int
    name: str


class PrefillResponse(BaseModel):
    routine: RoutineRef
    exercises: list[PrefillExercise] = Field(default_factory=list)


# ──────────────────────────────────────────────────────────────────────
# Sessions
# ──────────────────────────────────────────────────────────────────────


class SetInput(BaseModel):
    exercise_name: str = Field(..., min_length=1, max_length=120)
    set_index: int = Field(..., ge=0)
    weight_kg: float = Field(..., ge=0)
    reps: int = Field(..., ge=0)
    rpe: float | None = Field(None, ge=0, le=10)


class SessionCreate(BaseModel):
    routine_id: int | None = None
    performed_at: datetime | None = None
    notes: str | None = Field(None, max_length=1000)
    sets: list[SetInput] = Field(default_factory=list)


class SetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_name: str
    set_index: int
    weight_kg: float
    reps: int
    rpe: float | None


class TopSet(BaseModel):
    exercise_name: str
    weight_kg: float
    reps: int


class SessionRead(BaseModel):
    id: int
    routine_id: int | None
    routine_name: str | None
    performed_at: datetime
    notes: str | None = None
    total_volume_kg: float
    top_set: TopSet | None = None
    sets: list[SetRead] = Field(default_factory=list)
