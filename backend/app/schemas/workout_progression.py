"""Schemas for the same-workout progression view."""
from pydantic import BaseModel


class WorkoutRep(BaseModel):
    activity_id: int
    date: str
    duration_s: int | None = None
    distance_m: float | None = None
    tss: float | None = None
    avg_power: float | None = None
    normalized_power: float | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    efficiency_factor: float | None = None
    pace_s_per_km: float | None = None


class WorkoutTrend(BaseModel):
    metric: str
    series: list[float]
    first: float | None = None
    last: float | None = None
    delta: float | None = None
    pct: float | None = None
    improving: bool | None = None


class Headline(BaseModel):
    text: str
    tone: str  # 'good' | 'bad' | 'neutral'


class WorkoutGroupSummary(BaseModel):
    key: str
    title: str
    sport: str
    count: int
    first_date: str
    last_date: str
    headline: Headline


class WorkoutGroupDetail(BaseModel):
    key: str
    title: str
    sport: str
    reps: list[WorkoutRep]
    trends: list[WorkoutTrend]
