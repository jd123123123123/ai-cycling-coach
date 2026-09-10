from typing import Literal
from pydantic import BaseModel, Field

ProgressPeriod = Literal['week', 'month', 'year', 'plan']

class ProgressPoint(BaseModel):
    date: str
    value: float
    source: str

class ProgressMetric(BaseModel):
    points: list[ProgressPoint] = Field(default_factory=list)
    baseline: ProgressPoint | None = None
    current: float | None = None
    target: float | None = None

class ProgressRecord(BaseModel):
    seconds: int
    watts: float | None = None
    all_time_watts: float | None = None
    previous_watts: float | None = None
    date: str | None = None
    activity_id: int | None = None

class ProgressExplorer(BaseModel):
    period: ProgressPeriod
    start: str | None
    end: str
    today: str | None = None
    plan_start: str | None = None
    plan_note: str | None = None
    ftp: ProgressMetric
    vo2: ProgressMetric
    records: list[ProgressRecord] = Field(default_factory=list)
