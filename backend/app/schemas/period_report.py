"""Period Report schemas — the contract for GET /analytics/period-report.

A periodized verdict over a chosen window (N days) compared against the
previous equal window. Plain-language fields lead; numeric detail rides
alongside so the UI can show "science on tap".
"""
from __future__ import annotations

from datetime import datetime

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


class EvidenceChip(BaseModel):
    """A compact metric chip shown under the verdict, e.g. CTL 58 / HRV -8%."""
    label: str
    value: str
    tone: str = Field(default="neutral", description="'good' | 'bad' | 'neutral'")


class Cause(BaseModel):
    """A ranked reason something is dragging, with live evidence numbers."""
    label: str
    severity: str = Field(description="'low' | 'med' | 'high'")
    evidence: str


class NextStep(BaseModel):
    """Forward-looking recommendation for the coming period."""
    headline: str
    detail: str
    tone: str = Field(default="neutral", description="'good' | 'caution' | 'bad' | 'neutral'")


class Prescription(BaseModel):
    """One ranked, concrete action for the coming window — the 'what to change'."""
    priority: int = Field(description="1 = most important")
    headline: str
    detail: str = Field(description="what to do")
    effect: str = Field(default="", description="expected outcome")
    tone: str = Field(default="neutral", description="'good' | 'caution' | 'bad' | 'neutral'")
    icon_key: str = Field(default="arrow", description="UI hint: arrow | rest | build | balance | sleep")


class IntensityMix(BaseModel):
    """Training intensity distribution vs the phase-appropriate target (Seiler)."""
    z1_pct: float = Field(description="easy share, 0-100")
    z2_pct: float = Field(description="moderate / grey-zone share")
    z3_pct: float = Field(description="hard share")
    model: str = Field(description="detected: polarized | pyramidal | threshold | high_intensity")
    target_model: str = Field(description="ideal model for the current phase")
    aligned: bool = Field(description="true when detected model matches the target")
    verdict: str = Field(description="one-line plain read")
    fix: str | None = Field(default=None, description="one-line change; null when on-model")
    sample_rides: int = Field(description="rides classified into a zone")


class LoadDynamics(BaseModel):
    """Load health — ramp + Foster monotony/strain over the window."""
    ramp_per_week: float | None = Field(default=None, description="CTL change per week")
    monotony: float | None = Field(default=None, description="Foster: mean / SD of daily TSS")
    strain: float | None = Field(default=None, description="Foster: weekly load * monotony")
    flag: str = Field(default="ok", description="'ok' | 'bouncy' | 'spiky' | 'flat'")
    note: str = Field(default="", description="plain-language read")


class Trajectory(BaseModel):
    """Adaptation toward the goal event (Banister projection)."""
    days_to_goal: int | None = None
    ctl_now: float
    ctl_7d_delta: float
    ctl_projected_at_goal: float
    ctl_target: float | None = None
    tsb_projected_at_goal: float
    taper_window: str = Field(description="'ideal' | 'too_fresh' | 'overreached' | 'unknown'")
    on_track: str = Field(description="'yes' | 'behind' | 'ahead' | 'no_goal' | ...")
    weekly_tss_required: float
    weekly_tss_actual: float
    narrative: str


class PeriodReport(BaseModel):
    days: int
    start_date: str
    end_date: str
    prev_start_date: str
    prev_end_date: str
    has_baseline: bool = Field(description="false when the previous window has no data")
    grade_letter: str | None
    grade_score: float | None = Field(description="composite 0-100, or null")
    grade_delta: float | None = Field(default=None, description="composite vs previous window")
    grade_percentile: int | None = Field(default=None, description="0-100 rank vs recent history")
    composite_trend: list[float] = Field(default_factory=list, description="historical composite scores oldest→newest for a sparkline")
    evidence: list[EvidenceChip] = Field(default_factory=list)
    causes: list[Cause] = Field(default_factory=list)
    next_step: NextStep | None = None
    prescriptions: list[Prescription] = Field(default_factory=list)
    intensity: IntensityMix | None = None
    load_dynamics: LoadDynamics | None = None
    trajectory: Trajectory | None = None
    radar: list[RadarAxis]
    improvements: list[DeltaItem]
    weaknesses: list[DeltaItem]
    milestones: list[Milestone]
    ai_verdict: str
    ai_model: str
    # Cache freshness stamp — None on a live build; set to the row's
    # generated_at when served from the period_reports cache.
    generated_at: datetime | None = None
