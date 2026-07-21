"""Season-trends schemas — the contract behind GET /analytics/season-trends.

The V3 · Season Progress surface (frontend BikeProgressView) needs a small set
of season-long time series that the app already stores but never aggregated:

    · vo2max       — Garmin's VO₂max estimate (daily_metric.raw_data)
    · weight_kg    — the daily weight series (daily_metric.weight_kg)
    · durability   — per-ride aerobic decoupling (activity_stream.decoupling_pct)
    · p20min_w     — best 20-min mean-maximal power (activity_stream.mmp_curve)

Every value is the athlete's OWN, aggregated into monthly buckets. A metric with
no stored data for THIS athlete stays honestly empty (its summary carries
``n_points == 0`` and every point is ``None``) — never a fabricated line.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class TrendPoint(BaseModel):
    """One monthly bucket. Every metric is nullable — a month with no reading
    for a given metric is ``None`` (honest gap), never zero-filled."""

    month: str = Field(description="ISO year-month, e.g. '2026-05'.")
    month_en: str
    month_de: str
    vo2max: float | None = None          # latest Garmin estimate in the month
    weight_kg: float | None = None        # mean daily weight in the month
    durability_pct: float | None = None   # mean aerobic decoupling (lower = better)
    p20min_w: int | None = None           # best 20-min power in the month


class MetricSummary(BaseModel):
    """First-vs-latest read of one metric across the season, so the card can
    show a headline value + an honest delta without re-deriving it client-side."""

    first: float | None = None
    latest: float | None = None
    delta: float | None = None
    n_points: int = 0
    # True when a downward move is the good direction (durability/weight); the
    # UI colours the delta accordingly.
    lower_is_better: bool = False


class SeasonTrends(BaseModel):
    available: bool
    year: int
    points: list[TrendPoint] = Field(default_factory=list)
    vo2max: MetricSummary = Field(default_factory=MetricSummary)
    weight_kg: MetricSummary = Field(default_factory=MetricSummary)
    durability_pct: MetricSummary = Field(default_factory=MetricSummary)
    p20min_w: MetricSummary = Field(default_factory=MetricSummary)
