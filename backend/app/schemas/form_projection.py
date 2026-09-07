"""Response schema for GET /analytics/form-projection.

Fitness / fatigue / form on the athlete's OWN fitted time constants, projected
forward, with the model choice and its uncertainty made explicit.

The honesty contract this schema encodes:

  · ``model`` is ``"individual"`` only when a Banister fit on this athlete's own
    (load → 20-min power) history beat the standard 42/7 constants on AICc.
    Otherwise ``"standard"``, and ``fallback_reason`` says why.
  · ``confidence_pct`` follows the same 0–100 convention as
    ``app/schemas/weeks.py`` ``Projection.confidence_pct``. The documented app
    rule — below 30, render a range and never a point — arrives pre-resolved as
    ``range_required`` so no client has to re-derive it.
  · ``today`` carries no band: it is measured, not projected. Every entry in
    ``projection`` carries an 80 % band.
  · ``load.source`` is ``"plan"`` only for days a plan actually covers. Days it
    does not are ``"recent-average"`` and ``load.assumption`` says in words that
    nobody planned them.
"""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class FormPoint(BaseModel):
    """One measured day. No band — today is not a projection."""
    date: date
    fitness: float = Field(description="CTL-scale EWMA of TSS at the model's τ1")
    fatigue: float = Field(description="ATL-scale EWMA of TSS at the model's τ2")
    form: float = Field(description="fitness − fatigue (same-day TSB convention)")


class ProjectedDay(BaseModel):
    """One projected day, always with its 80 % band."""
    date: date
    days_out: int
    tss: float = Field(description="the load this day assumes")
    load_source: str = Field(description='"plan" | "recent-average"')
    fitness: float
    fatigue: float
    form: float
    fitness_low: float
    fitness_high: float
    fatigue_low: float
    fatigue_high: float
    form_low: float
    form_high: float


class ModelConstants(BaseModel):
    """The fitted constants, and the standard ones they were scored against."""
    tau1_days: float = Field(description="fitness time constant actually in use")
    tau2_days: float = Field(description="fatigue time constant actually in use")
    standard_tau1_days: float = 42.0
    standard_tau2_days: float = 7.0
    k1: float | None = Field(default=None, description="fitness gain (individual fit only)")
    k2: float | None = Field(default=None, description="fatigue gain (individual fit only)")
    p0: float | None = Field(default=None, description="baseline performance (individual fit only)")
    r_squared: float | None = Field(default=None, description="in-sample R² of the individual fit")
    standard_r_squared: float | None = Field(
        default=None, description="R² of 42/7 on the SAME observations"
    )
    aicc: float | None = None
    standard_aicc: float | None = None
    selection_criterion: str
    n_observations: int
    n_observations_required: int


class PerformancePoint(BaseModel):
    date: date
    watts: float


class PerformanceSeries(BaseModel):
    """What was fed to the fit, and the gate that decided it. Inspectable."""
    source: str
    metric: str
    unit: str
    gate: str
    gate_watts: float | None = None
    window_best_watts: float | None = None
    n_candidate_days: int
    n_observations: int
    points: list[PerformancePoint]


class LoadUncertainty(BaseModel):
    sigma_tss_per_day: float
    source: str = Field(description='"plan_compliance" | "recent_variability"')
    n: int
    band: str
    covers: str


class ForwardLoad(BaseModel):
    source: str = Field(description='"plan" | "recent-average" | "mixed"')
    assumption: str | None = Field(
        default=None,
        description="Set whenever any projected day is NOT covered by a plan.",
    )
    rolling_7d_tss: float
    planned_days: int
    horizon_days: int
    uncertainty: LoadUncertainty


class FormProjection(BaseModel):
    """The full payload. ``available: false`` carries only ``reason``."""
    available: bool
    reason: str | None = None
    history_days: int | None = None
    history_days_required: int | None = None

    model: str | None = Field(default=None, description='"individual" | "standard"')
    model_reason: str | None = None
    fallback_reason: str | None = None

    confidence_pct: int | None = Field(
        default=None, description="0–100, same convention as weeks.Projection"
    )
    confidence_threshold_pct: int | None = None
    range_required: bool | None = Field(
        default=None,
        description="True → the client MUST render a range, never a point.",
    )

    today: FormPoint | None = None
    standard_today: FormPoint | None = Field(
        default=None, description="What a fixed-42/7 PMC shows for the same day."
    )
    constants: ModelConstants | None = None
    performance_series: PerformanceSeries | None = None
    load: ForwardLoad | None = None
    projection: list[ProjectedDay] = []

    # `model_*` fields collide with pydantic v2's protected namespace.
    model_config = {"protected_namespaces": ()}
