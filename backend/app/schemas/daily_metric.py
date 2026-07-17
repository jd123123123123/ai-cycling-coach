"""Pydantic schemas for the daily_metrics endpoint."""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class SleepDetail(BaseModel):
    """Rich sleep + overnight-vitals breakdown extracted from the stored Garmin
    sleep payload (dailySleepDTO). All optional — a device/night may lack any."""
    total_s: int | None = None
    deep_s: int | None = None
    light_s: int | None = None
    rem_s: int | None = None
    awake_s: int | None = None
    awake_count: int | None = None
    spo2_avg: float | None = None
    spo2_low: int | None = None
    spo2_high: int | None = None
    respiration_avg: float | None = None
    respiration_low: float | None = None
    respiration_high: float | None = None
    sleep_stress: float | None = None


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
    # Enriched from raw_data (no schema migration): sleep stages, SpO₂, respiration.
    sleep_detail: SleepDetail | None = None
    vo2max: float | None = None
    training_readiness: int | None = None
    recovery_time_hours: int | None = None


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


# ─── Wake-vs-now snapshot (today-runthrough Step 5) ───────────────────────────


class WakeNowPairOut(BaseModel):
    """One metric, paired wake → now."""
    wake: int | None
    now: int | None
    now_at: datetime | None


class TodaySnapshotResponse(BaseModel):
    """Composite today snapshot served from /daily-metrics/today/snapshot.

    Cached server-side for SNAPSHOT_TTL (15 minutes). The frontend's
    React Query staleTime can be shorter — the server is the source of
    truth for "is this fresh enough to redisplay".
    """
    body_battery: WakeNowPairOut
    stress: WakeNowPairOut
    hrv_overnight_avg: int | None
    training_readiness: int | None
    recovery_time_hours: int | None
    generated_at: datetime
    cached: bool
