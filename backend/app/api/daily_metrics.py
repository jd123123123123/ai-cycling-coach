"""GET /daily-metrics endpoint — returns the authenticated user's daily metrics for a date range."""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.daily_metric import DailyMetricListResponse, DailyMetricRead
from app.services import daily_metric_service

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
