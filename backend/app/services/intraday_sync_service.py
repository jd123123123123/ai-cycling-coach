"""Intraday sample fetcher — fetches Garmin's 3-minute body_battery, stress,
and hrv arrays for a single calendar day and bulk-upserts into daily_metric_samples.

Called lazily by GET /daily-metrics/{date}/intraday when samples for a day are missing,
and eagerly by sync_daily_metrics after the daily aggregate sync.

Design:
- Each call deletes existing same-day/same-metric rows then bulk-inserts fresh data
  (idempotent refresh — safe to call multiple times).
- Auth errors propagate (caller should abort); per-metric fetch errors are logged
  and that metric is skipped (partial data better than no data).
- Uses pg_insert (core SQL) not ORM add() to avoid session tracking overhead on
  potentially hundreds of rows per metric.
"""
import logging
from datetime import date as date_type, datetime, time as dtime, timezone

from sqlalchemy import delete as sql_delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_metric_sample import DailyMetricSample
from app.services.garmin_client import GarminAuthError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Payload parsers
# ---------------------------------------------------------------------------


def _parse_body_battery(payload: dict | list | None) -> list[tuple[datetime, float]]:
    """Parse Garmin body_battery API response.

    Garmin returns either a list wrapper or a raw dict:
      [{ 'bodyBatteryValuesArray': [[ts_ms, level, ...], ...] }]

    Extracts (utc_datetime, level) pairs. Null entries are skipped.
    """
    if payload is None:
        return []
    # Unwrap single-day list wrapper
    data = payload[0] if isinstance(payload, list) and payload else payload
    if not isinstance(data, dict):
        return []
    arr = data.get("bodyBatteryValuesArray") or []
    out: list[tuple[datetime, float]] = []
    for row in arr:
        if not isinstance(row, list) or len(row) < 2:
            continue
        ts_ms, level = row[0], row[1]
        if ts_ms is None or level is None:
            continue
        out.append((datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc), float(level)))
    return out


def _parse_stress(payload: dict | None) -> list[tuple[datetime, float]]:
    """Parse Garmin intraday stress API response.

    Response: { 'stressValuesArray': [[ts_ms, stress_level], ...] }
    Stress values of -1 or -2 mean 'no reading' — filtered out.
    """
    if not isinstance(payload, dict):
        return []
    arr = payload.get("stressValuesArray") or []
    out: list[tuple[datetime, float]] = []
    for row in arr:
        if not isinstance(row, list) or len(row) < 2:
            continue
        ts_ms, level = row[0], row[1]
        if ts_ms is None or level is None or level < 0:
            continue
        out.append((datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc), float(level)))
    return out


def _parse_hrv(payload: dict | None) -> list[tuple[datetime, float]]:
    """Parse Garmin HRV API response.

    Response: { 'hrvSummary': {...}, 'hrvReadings': [{'readingTimeGMT', 'hrvValue'}, ...] }
    readingTimeGMT is UTC without tz suffix — treated as UTC.
    """
    if not isinstance(payload, dict):
        return []
    arr = payload.get("hrvReadings") or []
    out: list[tuple[datetime, float]] = []
    for r in arr:
        ts = r.get("readingTimeGMT")
        v = r.get("hrvValue")
        if ts is None or v is None:
            continue
        try:
            # Garmin drops tz suffix e.g. "2026-04-19T00:03:43.0" — treat as UTC
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            out.append((dt, float(v)))
        except (ValueError, TypeError):
            continue
    return out


# ---------------------------------------------------------------------------
# Core sync function
# ---------------------------------------------------------------------------


async def sync_intraday_samples_for_day(
    db: AsyncSession,
    client,  # GarminProvider — typed loosely to avoid circular import
    user_id: int,
    target_date: date_type,
) -> dict[str, int]:
    """Fetch body_battery + stress + hrv from Garmin for target_date.

    For each metric:
    1. Fetch from Garmin API
    2. Delete existing same-day/same-type rows (idempotent)
    3. Bulk-insert fresh rows via pg_insert (no ORM tracking overhead)

    Returns dict of {metric_type: row_count}.
    GarminAuthError propagates; per-metric exceptions are swallowed and logged.

    Note: Caller is responsible for db.commit() after this function returns.
    The function only flushes (preserving any outer transaction).
    """
    iso = target_date.isoformat()
    day_start = datetime.combine(target_date, dtime.min).replace(tzinfo=timezone.utc)
    day_end = datetime.combine(target_date, dtime.max).replace(tzinfo=timezone.utc)
    result: dict[str, int] = {}

    metrics_config = [
        (
            "body_battery",
            lambda: client.get_body_battery(target_date, target_date),
            _parse_body_battery,
        ),
        (
            "stress",
            lambda: client.get_intraday_stress(target_date),
            _parse_stress,
        ),
        (
            "hrv",
            lambda: client.get_hrv(target_date),
            _parse_hrv,
        ),
    ]

    for metric_type, fetch_fn, parse_fn in metrics_config:
        try:
            payload = await fetch_fn()
            points = parse_fn(payload)

            # Delete existing rows for this (user, metric, day) before reinserting
            await db.execute(
                sql_delete(DailyMetricSample).where(
                    DailyMetricSample.user_id == user_id,
                    DailyMetricSample.metric_type == metric_type,
                    DailyMetricSample.recorded_at >= day_start,
                    DailyMetricSample.recorded_at <= day_end,
                )
            )

            if points:
                rows = [
                    {
                        "user_id": user_id,
                        "metric_type": metric_type,
                        "recorded_at": t,
                        "value": v,
                    }
                    for t, v in points
                ]
                await db.execute(pg_insert(DailyMetricSample).values(rows))

            result[metric_type] = len(points)
            logger.debug(
                "Intraday %s synced %d points for user_id=%d date=%s",
                metric_type,
                len(points),
                user_id,
                iso,
            )

        except GarminAuthError:
            raise  # Auth errors must propagate
        except Exception as exc:
            logger.warning(
                "Intraday %s fetch failed for user_id=%d date=%s: %s",
                metric_type,
                user_id,
                iso,
                exc,
            )
            result[metric_type] = 0

    await db.flush()
    return result
