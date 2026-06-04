"""Period Report schemas — the contract for GET /analytics/period-report.

A periodized verdict over a chosen window (N days) compared against the
previous equal window. Plain-language fields lead; numeric detail rides
alongside so the UI can show "science on tap".
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class RadarAxis(BaseModel):
    """One body-system dimension, scored 0-100 (higher = better)."""
    key: str = Field(description="machine key, e.g. 'aerobic'")
    label: str = Field(description="display label, e.g. 'Aerobic Fitness'")
    score: float | None = Field(description="0-100, or null when insufficient data")
    insufficient_data: bool = False
    detail: str = Field(default="", description="one-line plain explanation of the score")


class DeltaItem(BaseModel):
    """A single significant change vs the previous equal window."""
    key: str
    label: str = Field(description="plain verdict, e.g. 'Fitness climbing'")
    detail: str = Field(description="real numbers, e.g. 'CTL 48 → 52 (+4)'")
    why: str = Field(description="one line on why it matters")
    delta: float
    unit: str = ""
    direction: str = Field(description="'up' or 'down' (raw metric movement)")
    is_improvement: bool


class Milestone(BaseModel):
    """A streak, PR, or badge achieved in the window."""
    icon_key: str = Field(description="UI icon hint, e.g. 'flame', 'trophy', 'zap'")
    label: str
    detail: str = ""


class PeriodReport(BaseModel):
    days: int
    start_date: str
    end_date: str
    prev_start_date: str
    prev_end_date: str
    has_baseline: bool = Field(description="false when the previous window has no data")
    grade_letter: str | None
    grade_score: float | None = Field(description="composite 0-100, or null")
    radar: list[RadarAxis]
    improvements: list[DeltaItem]
    weaknesses: list[DeltaItem]
    milestones: list[Milestone]
    ai_verdict: str
    ai_model: str
