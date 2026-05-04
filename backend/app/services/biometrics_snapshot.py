"""Wake-vs-now biometrics snapshot (today-runthrough Step 5).

Surfaces a paired snapshot of body_battery / stress / HRV (wake → now)
plus training_readiness and recovery_time_hours for the user's "today".

Inputs:
    - daily_metrics row for target_date — for sleep_end_timestamp,
      hrv_overnight_avg, training_readiness, recovery_time_hours.
    - daily_metric_samples hypertable — 3-min granularity for
      body_battery / stress / hrv. Wake values = first sample at or after
      the wake timestamp; now values = latest sample for the day.

Wake fallback: if today's daily_metric is missing or has no
sleep_end_timestamp, fall back to 04:00 UTC for the target_date. The plan
specifies 04:00 athlete-local but AthleteProfile has no timezone column
yet (Step 2 of the run-through introduces local-day handling) — UTC 04:00
is a tolerable approximation for the solo-dev tonight; revisit when the
timezone column lands.

Cache: a process-local dict with 15-minute TTL keyed by user_id. Solo-dev
acceptable; not multi-worker safe — replace with Redis when we scale past
one uvicorn worker.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time as dtime, timedelta, timezone
from typing import Any

from sqlalchemy import select as sql_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_metric import DailyMetric
from app.models.daily_metric_sample import DailyMetricSample

logger = logging.getLogger(__name__)


# 15 minute snapshot freshness — matches the cadence the scheduler-driven
# Garmin sync runs at, so we never serve a value older than the most
# recent sync round-trip.
SNAPSHOT_TTL = timedelta(minutes=15)

# Module-level in-memory cache. {user_id: (snapshot, computed_at_utc)}.
# Solo-dev / single-worker assumption documented at module top.
_snapshot_cache: dict[int, tuple["TodaySnapshot", datetime]] = {}


@dataclass
class WakeNowPair:
    """One metric, paired wake → now."""

    wake: int | None
    now: int | None
    now_at: datetime | None


@dataclass
class TodaySnapshot:
    """Composite snapshot consumed by /api/daily-metrics/today/snapshot."""

    body_battery: WakeNowPair
    stress: WakeNowPair
    hrv_overnight_avg: int | None
    training_readiness: int | None
    recovery_time_hours: int | None
    generated_at: datetime


def _empty_pair() -> WakeNowPair:
    return WakeNowPair(wake=None, now=None, now_at=None)


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _resolve_wake_time(daily_metric: DailyMetric | None, target_date: date) -> datetime:
    """Derive the wake timestamp.

    Order of preference:
        1. daily_metric.raw_data["sleep"]["sleep_end_timestamp"] / "sleepEndTimestampGMT"
           (string ISO or ms-epoch — both shapes seen across firmware versions)
        2. 04:00 UTC for target_date (documented fallback).
    """
    fallback = datetime.combine(target_date, dtime(4, 0), tzinfo=timezone.utc)
    if daily_metric is None or not daily_metric.raw_data:
        return fallback

    sleep = daily_metric.raw_data.get("sleep") or {}
    candidate_keys = (
        "sleep_end_timestamp",
        "sleepEndTimestampGMT",
        "sleepEndTimestamp",
    )
    for key in candidate_keys:
        raw = sleep.get(key)
        if raw is None:
            continue
        # Numeric ms-epoch
        if isinstance(raw, (int, float)):
            try:
                return datetime.fromtimestamp(raw / 1000.0, tz=timezone.utc)
            except (OverflowError, OSError, ValueError):
                continue
        # String ISO 8601 (Garmin sometimes omits tz suffix → treat as UTC)
        if isinstance(raw, str):
            try:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except ValueError:
                continue
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt

    return fallback


async def _fetch_today_metric(
    db: AsyncSession, user_id: int, target_date: date
) -> DailyMetric | None:
    q = await db.execute(
        sql_select(DailyMetric)
        .where(DailyMetric.user_id == user_id, DailyMetric.date == target_date)
        .order_by(DailyMetric.recorded_at.desc())
        .limit(1)
    )
    return q.scalars().first()


async def _fetch_samples(
    db: AsyncSession, user_id: int, target_date: date
) -> dict[str, list[DailyMetricSample]]:
    """All samples for target_date, grouped by metric_type, sorted ascending."""
    day_start = datetime.combine(target_date, dtime.min).replace(tzinfo=timezone.utc)
    day_end = datetime.combine(target_date, dtime.max).replace(tzinfo=timezone.utc)
    q = await db.execute(
        sql_select(DailyMetricSample)
        .where(
            DailyMetricSample.user_id == user_id,
            DailyMetricSample.recorded_at >= day_start,
            DailyMetricSample.recorded_at <= day_end,
        )
        .order_by(DailyMetricSample.recorded_at.asc())
    )
    grouped: dict[str, list[DailyMetricSample]] = {
        "body_battery": [],
        "stress": [],
        "hrv": [],
    }
    for row in q.scalars().all():
        grouped.setdefault(row.metric_type, []).append(row)
    return grouped


def _pair_from_samples(
    samples: list[DailyMetricSample], wake_at: datetime
) -> WakeNowPair:
    if not samples:
        return _empty_pair()
    # First sample at or after wake_at — falls back to first-of-day if none.
    wake_sample = next((s for s in samples if s.recorded_at >= wake_at), samples[0])
    now_sample = samples[-1]
    return WakeNowPair(
        wake=_coerce_int(wake_sample.value),
        now=_coerce_int(now_sample.value),
        now_at=now_sample.recorded_at,
    )


async def compute_today_snapshot(
    db: AsyncSession, user_id: int, target_date: date
) -> TodaySnapshot:
    """Compose a TodaySnapshot from DB rows only — no Garmin round-trip.

    The endpoint layer is responsible for any pre-compute Garmin refresh.
    Keeping the service pure-DB makes it cheap to call from tests and from
    the scheduler.
    """
    daily_metric = await _fetch_today_metric(db, user_id, target_date)
    samples_by_type = await _fetch_samples(db, user_id, target_date)

    wake_at = _resolve_wake_time(daily_metric, target_date)

    body_battery_pair = _pair_from_samples(samples_by_type.get("body_battery", []), wake_at)
    stress_pair = _pair_from_samples(samples_by_type.get("stress", []), wake_at)

    hrv_overnight_avg: int | None = None
    training_readiness: int | None = None
    recovery_time_hours: int | None = None
    if daily_metric is not None:
        hrv_overnight_avg = daily_metric.hrv_overnight_avg
        training_readiness = daily_metric.training_readiness
        recovery_time_hours = daily_metric.recovery_time_hours

    return TodaySnapshot(
        body_battery=body_battery_pair,
        stress=stress_pair,
        hrv_overnight_avg=hrv_overnight_avg,
        training_readiness=training_readiness,
        recovery_time_hours=recovery_time_hours,
        generated_at=datetime.now(tz=timezone.utc),
    )


def get_cached_snapshot(user_id: int) -> TodaySnapshot | None:
    """Return a cached snapshot if it's fresh, else None.

    A snapshot is fresh when (now - computed_at) < SNAPSHOT_TTL.
    """
    entry = _snapshot_cache.get(user_id)
    if entry is None:
        return None
    snapshot, computed_at = entry
    if datetime.now(tz=timezone.utc) - computed_at >= SNAPSHOT_TTL:
        _snapshot_cache.pop(user_id, None)
        return None
    return snapshot


def store_cached_snapshot(user_id: int, snapshot: TodaySnapshot) -> None:
    _snapshot_cache[user_id] = (snapshot, datetime.now(tz=timezone.utc))


def invalidate_cached_snapshot(user_id: int) -> None:
    """Drop a user's cached snapshot — call after a sync writes new samples."""
    _snapshot_cache.pop(user_id, None)
