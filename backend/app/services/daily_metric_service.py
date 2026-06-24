"""Daily metric CRUD service with app-layer uniqueness enforcement.

TimescaleDB hypertable (daily_metrics) requires the partition column (recorded_at)
in all unique constraints. Since a meaningful unique constraint on (user_id, date)
cannot be expressed at the DB level, uniqueness is enforced here in the service layer.

See Phase 1 decision: "daily_metrics UNIQUE(user_id, date) dropped — TimescaleDB
requires partition col in all unique constraints; app-layer enforcement in Phase 3"
"""
import logging
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_metric import DailyMetric

logger = logging.getLogger(__name__)


async def upsert_daily_metric(
    db: AsyncSession,
    user_id: int,
    for_date: date,
    data: dict,
) -> DailyMetric | None:
    """Insert or progressively update a DailyMetric for (user_id, for_date).

    Garmin's daily summary is not a single end-of-day write — it accumulates
    through the day as the watch finalizes sleep, HRV, body battery, etc. A
    sync at 10am gets a near-empty stub; the same sync at 4pm gets last
    night's full sleep score. Earlier "insert-if-not-exists" semantics
    permanently locked in whichever stub was first to arrive.

    Behaviour:
      - No row → insert with provided data.
      - Row exists → update field-by-field, but **only when the new value
        is non-None**. This protects real data already recorded from being
        clobbered by a later partial sync that happened to time out on one
        endpoint. raw_data is always overwritten because it's an opaque
        snapshot of the latest API response (callers want the freshest copy).
      - TimescaleDB hypertable: still single-row per (user_id, date) at the
        application layer. The partition column `recorded_at` is set once at
        insert and never updated — mutating it would move a re-synced past day
        across a chunk boundary, which TimescaleDB forbids.

    Caller controls the transaction — flushes only.

    Returns:
        DailyMetric (either newly inserted or updated). None only if the
        input data dict is empty AND no existing row was found.
    """
    existing_q = await db.execute(
        select(DailyMetric).where(
            DailyMetric.user_id == user_id,
            DailyMetric.date == for_date,
        )
    )
    existing = existing_q.scalar_one_or_none()

    fields = ("sleep_score", "hrv_status", "body_battery", "resting_hr",
              "stress_level", "steps")

    if existing is None:
        metric = DailyMetric(
            user_id=user_id,
            date=for_date,
            recorded_at=datetime.now(timezone.utc),
            sleep_score=data.get("sleep_score"),
            hrv_status=data.get("hrv_status"),
            body_battery=data.get("body_battery"),
            resting_hr=data.get("resting_hr"),
            stress_level=data.get("stress_level"),
            steps=data.get("steps"),
            source="garmin",
            raw_data=data.get("raw_data"),
        )
        db.add(metric)
        await db.flush()
        logger.debug(
            "Inserted DailyMetric for user_id=%s date=%s", user_id, for_date
        )
        return metric

    # Progressive update — only overwrite NULL columns with new non-None values.
    # Once a real reading is captured, we don't let a later partial sync wipe it.
    updated_fields: list[str] = []
    for f in fields:
        new_val = data.get(f)
        if new_val is None:
            continue
        if getattr(existing, f, None) is None:
            setattr(existing, f, new_val)
            updated_fields.append(f)

    # raw_data is the opaque latest API snapshot — always refresh when present
    # so downstream consumers (biometrics_snapshot, etc.) get the newest payload.
    new_raw = data.get("raw_data")
    if new_raw is not None:
        existing.raw_data = new_raw
        updated_fields.append("raw_data")

    if updated_fields:
        # NB: recorded_at is the TimescaleDB partition column. It is left
        # untouched on update — moving it to now() shoves a re-synced past day
        # across a chunk boundary, which TimescaleDB rejects (CheckViolationError),
        # aborting the whole sync. Keeping it anchored at first-write time also
        # matches the analytics that filter DailyMetric by recorded_at as the
        # metric's day (period_report, analytical_aggregates, advanced_metrics).
        await db.flush()
        logger.info(
            "Updated DailyMetric for user_id=%s date=%s fields=%s",
            user_id, for_date, updated_fields,
        )
    return existing


async def get_daily_metrics(
    db: AsyncSession,
    user_id: int,
    start_date: date,
    end_date: date,
) -> list[DailyMetric]:
    """Retrieve daily metrics for a user within a date range (inclusive).

    Results are ordered by date ascending (oldest first), suitable for
    charting and PMC calculations that require chronological order.

    Args:
        db: SQLAlchemy async session.
        user_id: ID of the user to query metrics for.
        start_date: Start of range (inclusive).
        end_date: End of range (inclusive).

    Returns:
        List of DailyMetric ORM instances ordered by date ASC.
    """
    result = await db.execute(
        select(DailyMetric)
        .where(
            DailyMetric.user_id == user_id,
            DailyMetric.date >= start_date,
            DailyMetric.date <= end_date,
        )
        .order_by(DailyMetric.date.asc())
    )
    return list(result.scalars().all())
