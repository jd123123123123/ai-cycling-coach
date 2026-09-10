"""Versioned, evidence-first post-ride review. No inferred physiological gains."""
from typing import Literal
from pydantic import BaseModel, Field

class ReviewPair(BaseModel):
    label: str
    actual: float | None
    planned: float | None
    unit: str

class ReviewZone(BaseModel):
    label: str
    actual_seconds: float | None
    planned_seconds: float | None

class ReviewTrace(BaseModel):
    at_s: int
    actual_pct: float | None
    planned_pct: float | None

class ReviewChange(BaseModel):
    date: str
    before: str
    after: str
    reason: str

class ReviewImpact(BaseModel):
    day: int
    fitness: float
    fatigue: float
    form: float

class ReviewAdaptation(BaseModel):
    state: Literal['adapted', 'unchanged', 'pending', 'protected', 'limited']
    reason: str
    automatic: bool

class TrainingReview(BaseModel):
    version: str = '1.0'
    activity_id: int
    adaptation: ReviewAdaptation | None = None
    headline: str
    summary: str
    score: int | None = None
    score_label: str = 'Planpassung'
    status: Literal['matched', 'different', 'extra', 'unplanned', 'limited']
    planned_title: str | None = None
    actual_title: str
    coverage: float | None = None
    stimulus: str
    stimulus_detail: str
    pairs: list[ReviewPair] = Field(default_factory=list)
    zones: list[ReviewZone] = Field(default_factory=list)
    trace: list[ReviewTrace] = Field(default_factory=list)
    impact: list[ReviewImpact] = Field(default_factory=list)
    impact_basis: str | None = None
    changes: list[ReviewChange] = Field(default_factory=list)
    action: str
    limitations: list[str] = Field(default_factory=list)
    method: str = 'Planpassung: 55 % Zonenzeit, 25 % Dauer, 20 % TSS. Transparente Produktheuristik, kein validierter Leistungstest. Mehr Belastung gibt keine Bonuspunkte.'
