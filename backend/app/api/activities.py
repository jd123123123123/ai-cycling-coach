"""Activities API endpoints.

All endpoints are RLS-protected via get_db_for_user which sets the PostgreSQL
session variable app.current_user_id, enabling RLS policies on the activities
hypertable to filter rows by the authenticated user.
"""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity_stream import ActivityStream
from app.models.user import User
from app.schemas.activity import ActivityCreate, ActivityListResponse, ActivityRead
from app.services import activity_service
from app.services.activity_stream_analysis import analyze_stream_blob
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
    await db.commit()
    return ActivityRead.model_validate(activity)


@router.post(
    "/recompute-load",
    summary="Backfill TSS for activities missing training load",
)
async def recompute_load(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Recompute TSS for the authenticated user's activities where tss is null.

    Useful after threshold/HR-fallback changes: activities logged before HR-based
    TSS was computable (e.g. runs and gym sessions without threshold pace/LTHR)
    get their training load backfilled from stored HR data. Returns the count
    of activities updated.
    """
    updated = await activity_service.recompute_missing_tss(db, current_user.id)
    return {"updated": updated}


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


@router.delete(
    "/{activity_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an activity by ID",
)
async def delete_activity(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> None:
    """Delete one of the authenticated user's activities.

    Useful for removing a mis-logged session (e.g. a gym entry logged as a
    ride). Returns 204 on success, 404 if the activity does not exist or
    belongs to a different user. RLS enforces ownership at the DB level.
    """
    deleted = await activity_service.delete_activity(
        db=db,
        user_id=current_user.id,
        activity_id=activity_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )
    await db.commit()


@router.get(
    "/{activity_id}/stream-analysis",
    summary="Per-second stream-derived analysis (splits, HR zones, GPS, dynamics)",
)
async def get_stream_analysis(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Return display-ready analysis derived from the activity's stored 1 Hz
    stream: per-km splits, HR-zone time, GPS polyline, elevation profile, and
    sport-specific dynamics (running dynamics for runs; L/R balance, PCO, power
    phase, stamina for rides). ``{"has_streams": false}`` when none stored."""
    activity = await activity_service.get_activity(
        db=db, user_id=current_user.id, activity_id=activity_id
    )
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

    row = (
        await db.execute(
            select(ActivityStream).where(ActivityStream.activity_id == activity_id)
        )
    ).scalars().first()
    if row is None or not row.streams:
        return {"has_streams": False, "sport": activity.sport}

    result = analyze_stream_blob(
        row.streams,
        sport=activity.sport,
        device_max_hr=float(activity.max_hr) if activity.max_hr else None,
    )
    result["weather"] = row.weather
    result["has_gps_flag"] = bool(row.has_gps)
    # Route-card image hint: Zwift/ROUVY indoor vs GPS outdoor.
    title = (activity.title or "").lower()
    if "zwift" in title:
        result["route_kind"] = "zwift"
    elif "rouvy" in title:
        result["route_kind"] = "rouvy"
    elif result.get("gps"):
        result["route_kind"] = "outdoor"
    else:
        result["route_kind"] = "indoor"
    return result
