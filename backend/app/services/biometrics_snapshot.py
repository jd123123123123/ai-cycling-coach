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
from zoneinfo import ZoneInfo
from typing import Any  # noqa: F401 — kept for older type-hint usage below
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


def _resolve_wake_time(
    daily_metric: DailyMetric | None,
    target_date: date,
    athlete_tz: ZoneInfo | None = None,
) -> datetime:
    """Derive the wake timestamp.

    Order of preference:
        1. daily_metric.raw_data["sleep"]["sleep_end_timestamp"] / "sleepEndTimestampGMT"
           (string ISO or ms-epoch — both shapes seen across firmware versions)
        2. 06:00 in the athlete's local timezone (a defensible "after-most-
           people-wake" cutoff). If no tz is provided, fall back to 06:00 UTC —
           still later than the previous 04:00 UTC which was filing overnight
           Garmin HRV syncs as "wake" values.
    """
    if athlete_tz is not None:
        local_fallback = datetime.combine(target_date, dtime(6, 0), tzinfo=athlete_tz)
        fallback = local_fallback.astimezone(timezone.utc)
    else:
        fallback = datetime.combine(target_date, dtime(6, 0), tzinfo=timezone.utc)
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
    # Wake reading: first sample at or after wake_at — falls back to the latest
    # pre-wake sample (overnight HRV/body-battery sync) so we have *some*
    # baseline rather than nothing.
    post_wake = [s for s in samples if s.recorded_at >= wake_at]
    wake_sample = post_wake[0] if post_wake else samples[-1]
    # "Now" only makes sense if we actually have a post-wake reading — showing
    # an overnight 3am Garmin sync as the day's "current" value is misleading
    # ("AS OF 3:24am"). When the day's first post-wake sample hasn't landed
    # yet, leave now/now_at as None so the UI can show "awaiting today's data"
    # instead of a stale pre-wake number.
    now_sample = post_wake[-1] if post_wake else None
    return WakeNowPair(
        wake=_coerce_int(wake_sample.value),
        now=_coerce_int(now_sample.value) if now_sample else None,
        now_at=now_sample.recorded_at if now_sample else None,
    )


async def compute_today_snapshot(
    db: AsyncSession,
    user_id: int,
    target_date: date,
    athlete_tz: ZoneInfo | None = None,
) -> TodaySnapshot:
    """Compose a TodaySnapshot from DB rows only — no Garmin round-trip.

    Garmin's API convention: overnight metrics (sleep, HRV-overnight,
    training-readiness, recovery-time) for the night that ENDED this morning
    are filed under YESTERDAY's date (the day sleep started). Today's row is
    a stub until Garmin's backend post-processes the day. To surface "last
    night's" numbers immediately, we read today's row first and fall back to
    yesterday's row field-by-field for any None values.

    The endpoint layer is responsible for any pre-compute Garmin refresh.
    Keeping the service pure-DB makes it cheap to call from tests and from
    the scheduler.
    """
    daily_metric = await _fetch_today_metric(db, user_id, target_date)
    yesterday_metric = await _fetch_today_metric(
        db, user_id, target_date - timedelta(days=1)
    )

    # Intraday samples: today first, but for body_battery / stress "now"
    # values, fall back to yesterday's stream when today has no data yet
    # (e.g., watch hasn't uploaded today's samples). The wake-vs-now framing
    # still holds — wake = first-of-today-or-yesterday-evening, now = latest
    # sample we have.
    samples_today = await _fetch_samples(db, user_id, target_date)
    samples_used: dict[str, list[DailyMetricSample]] = dict(samples_today)
    if not any(samples_today.values()):
        samples_used = await _fetch_samples(
            db, user_id, target_date - timedelta(days=1)
        )

    wake_at = _resolve_wake_time(
        daily_metric or yesterday_metric, target_date, athlete_tz
    )

    body_battery_pair = _pair_from_samples(samples_used.get("body_battery", []), wake_at)
    stress_pair = _pair_from_samples(samples_used.get("stress", []), wake_at)

    # Field-by-field fallback to yesterday's overnight row. Garmin files the
    # overnight HRV / readiness / recovery numbers under the night-start date,
    # so on a fresh morning yesterday's row holds last night's data.
    def _field(today_val, yest_val):
        return today_val if today_val is not None else yest_val

    hrv_overnight_avg: int | None = None
    training_readiness: int | None = None
    recovery_time_hours: int | None = None
    if daily_metric is not None or yesterday_metric is not None:
        hrv_overnight_avg = _field(
            getattr(daily_metric, "hrv_overnight_avg", None),
            getattr(yesterday_metric, "hrv_overnight_avg", None),
        )
        training_readiness = _field(
            getattr(daily_metric, "training_readiness", None),
            getattr(yesterday_metric, "training_readiness", None),
        )
        recovery_time_hours = _field(
            getattr(daily_metric, "recovery_time_hours", None),
            getattr(yesterday_metric, "recovery_time_hours", None),
        )

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


async def wake_values_for_days(
    db: AsyncSession,
    user_id: int,
    days: list[date],
    metrics_by_day: dict[date, DailyMetric] | None = None,
    athlete_tz: ZoneInfo | None = None,
) -> dict[date, dict[str, int | None]]:
    """Sample-derived wake values for a span of days, in a single query.

    The `body_battery_wake` / `stress_wake` columns on daily_metrics are
    written by no ingestion path, and deliberately so: Garmin's daily payload
    offers `charged` / `drained`, which are the amounts gained and lost over
    the day, not the level at wake. Filing a delta as a level would read as a
    measurement while being a different quantity.

    The intraday sample stream does carry levels, and `compute_today_snapshot`
    already derives a wake value from it for a single day. This is that same
    derivation over a span, so the readiness drivers can compare today's wake
    values against their own baseline instead of dropping out entirely.
    """
    if not days:
        return {}
    span_start = datetime.combine(min(days), dtime.min).replace(tzinfo=timezone.utc)
    span_end = datetime.combine(max(days), dtime.max).replace(tzinfo=timezone.utc)
    q = await db.execute(
        sql_select(DailyMetricSample)
        .where(
            DailyMetricSample.user_id == user_id,
            DailyMetricSample.recorded_at >= span_start,
            DailyMetricSample.recorded_at <= span_end,
            DailyMetricSample.metric_type.in_(("body_battery", "stress")),
        )
        .order_by(DailyMetricSample.recorded_at.asc())
    )
    # Group by the same UTC-day boundary `_fetch_samples` uses, so a value
    # here and a value on the Today card cannot disagree about which day a
    # sample belongs to.
    grouped: dict[date, dict[str, list[DailyMetricSample]]] = {}
    for row in q.scalars().all():
        if row.recorded_at is None:
            continue
        bucket = grouped.setdefault(row.recorded_at.date(), {})
        bucket.setdefault(row.metric_type, []).append(row)

    out: dict[date, dict[str, int | None]] = {}
    for day in days:
        per_type = grouped.get(day)
        if not per_type:
            continue
        wake_at = _resolve_wake_time(
            (metrics_by_day or {}).get(day), day, athlete_tz
        )
        out[day] = {
            "body_battery_wake": _pair_from_samples(
                per_type.get("body_battery", []), wake_at
            ).wake,
            "stress_wake": _pair_from_samples(
                per_type.get("stress", []), wake_at
            ).wake,
        }
    return out
