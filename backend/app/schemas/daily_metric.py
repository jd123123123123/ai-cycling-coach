"""Pydantic schemas for the daily_metrics endpoint."""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class DailyMetricRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    date: date | None
    recorded_at: datetime
    sleep_score: int | None
    hrv_status: float | None
    body_battery: int | None
    resting_hr: int | None
    stress_level: int | None
    steps: int | None
    weight_kg: float | None
    source: str | None


class DailyMetricListResponse(BaseModel):
    metrics: list[DailyMetricRead]
    count: int


# ─── Intraday samples ─────────────────────────────────────────────────────────


class IntradayPoint(BaseModel):
    """One intraday sample: UTC timestamp + value."""
    t: datetime
    v: float


class IntradayDayResponse(BaseModel):
    """All available intraday samples for a given calendar day.

    `fetched_live` is True when the server hit Garmin on this request
    (cold cache path, ~5-10s latency). False = served from DB.
    """
    date: date
    body_battery: list[IntradayPoint]
    stress: list[IntradayPoint]
    hrv: list[IntradayPoint]
    hr: list[IntradayPoint] = []  # reserved for future — not yet synced
    fetched_live: bool
