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
    """Insert a DailyMetric for the given user + date, skipping if one already exists.

    App-layer uniqueness: queries for an existing row with the same (user_id, date)
    before inserting. If found, returns None without modifying the existing record.
    This prevents duplicate rows since the TimescaleDB hypertable cannot enforce
    a UNIQUE constraint on (user_id, date) without including the partition column.

    Caller controls the transaction — this method calls db.flush() (not db.commit())
    so the caller can batch multiple inserts into a single transaction and commit once.

    Args:
        db: SQLAlchemy async session (transaction controlled by caller).
        user_id: ID of the user who owns this metric.
        for_date: Calendar date the metric represents.
        data: Dict with metric fields — keys: sleep_score, hrv_status, body_battery,
              resting_hr, stress_level, steps, raw_data. Missing keys default to None.

    Returns:
        Created DailyMetric if inserted, None if record already exists for that date.
    """
    # App-layer uniqueness check: does a record already exist for this user + date?
    existing = await db.execute(
        select(DailyMetric).where(
            DailyMetric.user_id == user_id,
            DailyMetric.date == for_date,
        )
    )
    if existing.scalar_one_or_none() is not None:
        logger.debug(
            "Skipping DailyMetric insert for user_id=%s date=%s — record already exists",
            user_id,
            for_date,
        )
        return None

    metric = DailyMetric(
        user_id=user_id,
        date=for_date,
        recorded_at=datetime.now(timezone.utc),  # Required partition column
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
    await db.flush()  # Caller commits — do NOT call db.commit() here
    logger.debug(
        "Inserted DailyMetric for user_id=%s date=%s", user_id, for_date
    )
    return metric


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
