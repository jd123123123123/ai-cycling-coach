"""Pydantic schemas for the /weeks/current endpoint (Phase 7.0 Plan 04).

WeekResponse is the contract consumed by Plan 05's UI components.
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict

Language = Literal["simple", "technical"]


class IntervalBlockOut(BaseModel):
    duration_seconds: int
    power_target_pct_ftp: float | None
    zone: int  # 1..7


class DayPlan(BaseModel):
    date: date
    sport: str
    title: str
    template_id: str | None
    duration_seconds_target: int | None
    target_tss: int | None
    category: str  # SessionType literal as plain str — 'rest','recovery','endurance','tempo','sweet_spot','threshold','vo2'
    intervals: list[IntervalBlockOut]
    rationale: str  # one-sentence per-day "why" — deterministic in 7.0; LLM-polished in 7.2
    is_today: bool


class MesoBlockContext(BaseModel):
    phase: str  # Friel phase
    block_position: str  # 'accumulation' | 'transmutation' | 'realization' | 'recovery'
    block_index_in_meso: int  # 0..3
    weekly_tss_target: int
    days_to_event: int | None
    target_event_type: str | None


class WeekResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    week_start: date
    week_end: date
    language: Language
    preface: str  # 3-5 sentence rationale from build_weekly_rationale
    meso_block: MesoBlockContext
    days: list[DayPlan]  # exactly 7


__all__ = [
    "Language",
    "IntervalBlockOut",
    "DayPlan",
    "MesoBlockContext",
    "WeekResponse",
]
