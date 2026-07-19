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
    # Dual-sport: a same-day session in the OTHER sport (e.g. an easy run on a
    # bike day). Compact — title only; the run detail lives on its own row.
    secondary_title: str | None = None


class MesoBlockContext(BaseModel):
    phase: str  # Friel phase
    block_position: str  # 'accumulation' | 'transmutation' | 'realization' | 'recovery'
    block_index_in_meso: int  # 0..3
    weekly_tss_target: int
    days_to_event: int | None
    target_event_type: str | None


class PlanChangeItem(BaseModel):
    """One detected deviation between the plan and what actually happened."""
    type: str  # 'skipped' | 'undertrained' | 'overtrained'
    severity: str  # 'ease' | 'boost'
    # Present for 'skipped' only:
    dow: int | None = None
    date: str | None = None  # ISO date string
    category: str | None = None
    planned_tss: float | None = None
    actual_tss: float | None = None
    acwr: float | None = None


class PlanChanges(BaseModel):
    """How the athlete's real training diverged from the plan, and how the week
    adapted. Surfaced when a day was skipped or the athlete over/under-trained;
    None when the week is on track. The frontend renders `message` verbatim.
    """
    status: str  # 'skipped' | 'undertrained' | 'overtrained'
    message: str  # clear, localized (de/en) one-liner
    changes: list[PlanChangeItem]


class ProjectionPoint(BaseModel):
    """One sampled point on the forward projection path with confidence bands."""
    date: str  # ISO date
    central: float
    p10: float  # 80% band lower
    p90: float  # 80% band upper
    p25: float  # 50% band lower
    p75: float  # 50% band upper


class Projection(BaseModel):
    """Bayesian Fitness-Fatigue performance projection with confidence bands.

    Decision-support (NOT a guarantee). `mode` is 'performance' when a real
    eFTP marker series drove the fit, 'fitness' when we fell back to projecting
    the fitness signal with deliberately wider bands. All watts.
    """
    mode: str  # 'performance' | 'fitness'
    unit: str  # 'watts'
    metric_label: str
    samples_used: int
    horizon_date: str  # ISO date
    days_out: int
    current_estimate: float | None
    projected_central: float | None
    band_50: list[float] | None  # [lo, hi] at horizon (50% band)
    band_80: list[float] | None  # [lo, hi] at horizon (80% band)
    path: list[ProjectionPoint]
    projected_outcome: str  # localized plain-language outcome
    caveat: str  # localized honest caveat


class Readiness(BaseModel):
    """Illness / overtraining / readiness signal from the athlete's OWN rolling
    HRV (ln-RMSSD) + resting-HR baselines. `status` drives the "what could
    change" note. Localized `reason` already matches the request locale.
    """
    status: str  # 'green' | 'amber' | 'illness' | 'overreaching' | 'unknown'
    reason: str
    suggest_easy: bool


class WeekResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    week_start: date
    week_end: date
    language: Language
    preface: str  # 3-5 sentence rationale (LLM-personalized when available)
    meso_block: MesoBlockContext
    days: list[DayPlan]  # exactly 7
    # Plan-change communication — populated when a day was skipped or the
    # athlete over/under-trained vs the plan; None when on track. The message
    # is already localized to the request locale.
    plan_changes: PlanChanges | None = None
    # Forward performance projection with 50%/80% confidence bands. None only
    # when projection could not be computed at all.
    projection: Projection | None = None
    # Today's readiness signal (illness/overreaching/amber/green). None when
    # there is no biometric history to judge.
    readiness: Readiness | None = None


__all__ = [
    "Language",
    "IntervalBlockOut",
    "DayPlan",
    "MesoBlockContext",
    "PlanChangeItem",
    "PlanChanges",
    "ProjectionPoint",
    "Projection",
    "Readiness",
    "WeekResponse",
]
