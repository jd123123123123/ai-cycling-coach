"""GET /daily-metrics endpoint — returns the authenticated user's daily metrics for a date range."""
import logging
from datetime import date, datetime, time as dtime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select as sql_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.daily_metric_sample import DailyMetricSample
from app.models.garmin_credential import GarminCredential
from app.models.user import User
from app.schemas.daily_metric import (
    DailyMetricListResponse,
    DailyMetricRead,
    IntradayDayResponse,
    IntradayPoint,
    TodaySnapshotResponse,
    WakeNowPairOut,
)
from app.services import daily_metric_service
from app.services.biometrics_snapshot import (
    compute_today_snapshot,
    get_cached_snapshot,
    store_cached_snapshot,
)
from app.services.garmin_sync_service import create_garmin_client_for_user
from app.services.intraday_sync_service import sync_intraday_samples_for_day

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/daily-metrics", tags=["daily-metrics"])


@router.get("", response_model=DailyMetricListResponse)
async def get_daily_metrics(
    start_date: Annotated[date, Query(...)],
    end_date: Annotated[date, Query(...)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> DailyMetricListResponse:
    """Return the authenticated user's daily metrics for the given date range.

    Both start_date and end_date are required. The range must be <= 366 days
    and start_date must be on or before end_date.

    RLS is enforced via get_db_for_user which sets app.current_user_id on the
    PostgreSQL session before any query executes.
    """
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must be on or before end_date",
        )

    if (end_date - start_date).days > 366:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Date range too large (max 366 days)",
        )

    metrics = await daily_metric_service.get_daily_metrics(
        db, current_user.id, start_date, end_date
    )

    return DailyMetricListResponse(
        metrics=[DailyMetricRead.model_validate(m) for m in metrics],
        count=len(metrics),
    )


@router.get("/{iso_date}/intraday", response_model=IntradayDayResponse)
async def get_intraday_for_day(
    iso_date: date,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> IntradayDayResponse:
    """Return per-minute intraday samples (body_battery, stress, hrv) for a day.

    Serves from daily_metric_samples if the day is cached. On cache miss,
    lazy-fetches from Garmin (~5-10s round trip for 3 metrics), persists,
    then serves. `fetched_live` tells the frontend which path was taken.
    """
    day_start = datetime.combine(iso_date, dtime.min).replace(tzinfo=timezone.utc)
    day_end = datetime.combine(iso_date, dtime.max).replace(tzinfo=timezone.utc)

    async def load_samples() -> dict[str, list[DailyMetricSample]]:
        q = await db.execute(
            sql_select(DailyMetricSample)
            .where(
                DailyMetricSample.user_id == current_user.id,
                DailyMetricSample.recorded_at >= day_start,
                DailyMetricSample.recorded_at <= day_end,
            )
            .order_by(DailyMetricSample.recorded_at.asc())
        )
        rows = q.scalars().all()
        grouped: dict[str, list[DailyMetricSample]] = {
            "body_battery": [], "stress": [], "hrv": [], "hr": [],
        }
        for r in rows:
            grouped.setdefault(r.metric_type, []).append(r)
        return grouped

    cached = await load_samples()
    has_any = any(len(samples) > 0 for samples in cached.values())
    fetched_live = False

    if not has_any:
        cred_q = await db.execute(
            sql_select(GarminCredential).where(GarminCredential.user_id == current_user.id)
        )
        credential = cred_q.scalar_one_or_none()
        if credential is not None and credential.sync_enabled:
            try:
                client = create_garmin_client_for_user(credential)
                await sync_intraday_samples_for_day(db, client, current_user.id, iso_date)
                await db.commit()
                cached = await load_samples()
                fetched_live = True
            except Exception as exc:
                # Don't 500; return empty payload and let the UI handle it
                logger.warning(
                    "Lazy intraday fetch failed user=%d date=%s: %s",
                    current_user.id, iso_date, exc,
                )

    def to_points(samples: list[DailyMetricSample]) -> list[IntradayPoint]:
        return [IntradayPoint(t=s.recorded_at, v=s.value) for s in samples]

    return IntradayDayResponse(
        date=iso_date,
        body_battery=to_points(cached.get("body_battery", [])),
        stress=to_points(cached.get("stress", [])),
        hrv=to_points(cached.get("hrv", [])),
        hr=to_points(cached.get("hr", [])),
        fetched_live=fetched_live,
    )


@router.get("/today/snapshot", response_model=TodaySnapshotResponse)
async def get_today_snapshot(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> TodaySnapshotResponse:
    """Wake-vs-now biometric snapshot for the user's "today".

    Cache: process-local 15-min TTL keyed by user_id. On cache miss we
    compute from the local DB (daily_metric_samples + daily_metrics);
    we deliberately DO NOT trigger an inline Garmin refresh here even
    though the plan permits it — the scheduler-driven sync runs every 4h
    and the 04.5.1 intraday sync hook fills samples on demand. Forcing a
    Garmin round-trip on every cache miss would (a) blow the snapshot
    response time from <50 ms to 5–10 s, (b) burn rate-limit budget on a
    background-priority concern, and (c) make the endpoint racy with the
    explicit /sync route. If the user wants fresher data they hit
    /sync — that path will invalidate this cache once Step 1 lands.

    "today" is computed as datetime.now(UTC).date(). When Step 2 of the
    run-through lands the athlete-local timezone, switch to that here.
    """
    today_local = datetime.now(timezone.utc).date()

    cached = get_cached_snapshot(current_user.id)
    if cached is not None:
        return TodaySnapshotResponse(
            body_battery=WakeNowPairOut(**vars(cached.body_battery)),
            stress=WakeNowPairOut(**vars(cached.stress)),
            hrv_overnight_avg=cached.hrv_overnight_avg,
            training_readiness=cached.training_readiness,
            recovery_time_hours=cached.recovery_time_hours,
            generated_at=cached.generated_at,
            cached=True,
        )

    snapshot = await compute_today_snapshot(db, current_user.id, today_local)
    store_cached_snapshot(current_user.id, snapshot)
    return TodaySnapshotResponse(
        body_battery=WakeNowPairOut(**vars(snapshot.body_battery)),
        stress=WakeNowPairOut(**vars(snapshot.stress)),
        hrv_overnight_avg=snapshot.hrv_overnight_avg,
        training_readiness=snapshot.training_readiness,
        recovery_time_hours=snapshot.recovery_time_hours,
        generated_at=snapshot.generated_at,
        cached=False,
    )
