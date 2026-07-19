"""Plan import API — upload the athlete's own plan (PDF/image), extract it
via Claude vision, adapt it deterministically, and apply it to the calendar.

POST /plan-import/extract  — multipart file (pdf/png/jpg, <= 10 MB) →
    adapted-plan preview. 503 without ANTHROPIC_API_KEY; the LLM only
    extracts — zones / watts / squeezes are computed server-side from the
    athlete profile (see services.plan_import).

POST /plan-import/apply    — {plan, start_monday} → PlannedWorkout rows with
    blocks_source='user_plan', replacing only future rows on the covered
    dates. The echoed plan is re-sanitized; watts are re-derived from FTP —
    nothing numeric is trusted from the client.
"""
from datetime import date as date_type
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_active_user, get_db_for_user
from app.models.athlete_profile import AthleteProfile
from app.models.user import User
from app.services import plan_import as plan_import_service

router = APIRouter(prefix="/plan-import", tags=["plan-import"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # ~10 MB
ALLOWED_MEDIA_TYPES = {"application/pdf", "image/png", "image/jpeg"}


class PlanApplyRequest(BaseModel):
    plan: dict[str, Any] = Field(..., description="The adapted plan returned by /extract")
    start_monday: date_type = Field(..., description="Monday the plan's week 1 starts on")


class PlanApplyResponse(BaseModel):
    created: int
    replaced: int
    start_monday: date_type


async def _load_profile(db: AsyncSession, user_id: int) -> AthleteProfile | None:
    result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    return result.scalar_one_or_none()


@router.post("/extract", summary="Extract + adapt a training plan from a PDF or image")
async def extract_plan(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    file: UploadFile = File(...),
) -> dict:
    """Upload the athlete's own plan file; returns the adapted-plan preview."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Plan import is unavailable — AI extraction is not configured on this server.",
        )

    media_type = (file.content_type or "").lower()
    if media_type == "image/jpg":
        media_type = "image/jpeg"
    if media_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type — upload a PDF, PNG, or JPG.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large — the limit is 10 MB.",
        )

    raw = await plan_import_service.extract_plan_from_file(data, media_type)
    if raw is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not read a training plan from this file.",
        )

    sanitized = plan_import_service.sanitize_extracted_plan(raw)
    if not sanitized["weeks"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No training plan found in this file — try a clearer scan or a PDF export.",
        )

    profile = await _load_profile(db, current_user.id)
    adapted = plan_import_service.adapt_plan(
        sanitized,
        ftp_watts=getattr(profile, "ftp_watts", None) if profile else None,
        weekly_hours_available=getattr(profile, "weekly_hours_available", None) if profile else None,
        date_of_birth=getattr(profile, "date_of_birth", None) if profile else None,
        running_threshold_pace_ms=getattr(profile, "running_threshold_pace_ms", None) if profile else None,
    )
    return {
        "plan": adapted,
        "source": {
            "filename": file.filename,
            "media_type": media_type,
            "plan_name": sanitized.get("plan_name"),
        },
    }


@router.post("/apply", response_model=PlanApplyResponse, summary="Write the adapted plan to the calendar")
async def apply_plan(
    payload: PlanApplyRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> PlanApplyResponse:
    """Create PlannedWorkout rows (blocks_source='user_plan') for future dates."""
    if payload.start_monday.weekday() != 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_monday must be a Monday.",
        )
    sanitized = plan_import_service.sanitize_adapted_plan(payload.plan)
    if not sanitized["weeks"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The plan payload contains no valid weeks.",
        )
    result = await plan_import_service.apply_plan(
        db, current_user.id, payload.plan, payload.start_monday
    )
    await db.commit()
    return PlanApplyResponse(
        created=result["created"],
        replaced=result["replaced"],
        start_monday=payload.start_monday,
    )
