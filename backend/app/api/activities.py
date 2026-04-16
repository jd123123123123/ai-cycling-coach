"""Activities API endpoints.

All endpoints are RLS-protected via get_db_for_user which sets the PostgreSQL
session variable app.current_user_id, enabling RLS policies on the activities
hypertable to filter rows by the authenticated user.
"""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.activity import ActivityCreate, ActivityListResponse, ActivityRead
from app.services import activity_service
from app.services.athlete_service import get_or_create_profile

router = APIRouter(prefix="/activities", tags=["activities"])


@router.post(
    "",
    response_model=ActivityRead,
    status_code=status.HTTP_201_CREATED,
    summary="Log a new activity with auto-TSS calculation",
)
async def create_activity(
    data: ActivityCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> ActivityRead:
    """Create a new activity for the authenticated user.

    TSS is auto-calculated based on sport type and athlete profile thresholds:
    - cycling: Coggan TSS using normalized_power (or average_power as fallback)
    - running: rTSS using distance/duration-derived speed vs threshold pace
    - gym: hrTSS via Banister TRIMP using heart rate data

    If the athlete profile lacks the required thresholds (e.g. FTP not set),
    the activity is created with tss=null.
    """
    profile = await get_or_create_profile(db, current_user.id)
    activity = await activity_service.create_activity(
        db=db,
        user_id=current_user.id,
        data=data,
        profile=profile,
    )
    return ActivityRead.model_validate(activity)


@router.get(
    "",
    response_model=ActivityListResponse,
    summary="List activities with optional filters",
)
async def list_activities(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    sport: Annotated[str | None, Query(description="Filter by sport: cycling, running, gym")] = None,
    start_date: Annotated[datetime | None, Query(description="Filter activities on or after this datetime (ISO 8601)")] = None,
    end_date: Annotated[datetime | None, Query(description="Filter activities on or before this datetime (ISO 8601)")] = None,
    limit: Annotated[int, Query(ge=1, le=500, description="Maximum number of results")] = 50,
) -> ActivityListResponse:
    """Return the authenticated user's activities, most recent first.

    Supports filtering by sport type and date range. RLS ensures users can
    only see their own activities — the filter is applied at the DB level.
    """
    activities = await activity_service.list_activities(
        db=db,
        user_id=current_user.id,
        sport=sport,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )
    return ActivityListResponse(
        activities=[ActivityRead.model_validate(a) for a in activities],
        count=len(activities),
    )


@router.get(
    "/{activity_id}",
    response_model=ActivityRead,
    summary="Get a single activity by ID",
)
async def get_activity(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> ActivityRead:
    """Return a single activity by ID.

    Returns 404 if the activity does not exist or belongs to a different user.
    RLS provides an additional layer of enforcement at the DB level.
    """
    activity = await activity_service.get_activity(
        db=db,
        user_id=current_user.id,
        activity_id=activity_id,
    )
    if activity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )
    return ActivityRead.model_validate(activity)
