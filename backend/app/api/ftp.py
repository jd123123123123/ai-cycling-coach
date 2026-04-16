"""FTP update and history endpoints.

Provides dedicated FTP management outside the general athlete profile PATCH:
  PUT  /athletes/me/ftp         — update current FTP, append to history
  GET  /athletes/me/ftp/history — return FTP progression timeline

All endpoints are RLS-protected via get_db_for_user.
"""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.training_load import FTPHistoryEntry, FTPHistoryResponse
from app.services.athlete_service import get_or_create_profile

router = APIRouter(prefix="/athletes/me/ftp", tags=["ftp"])


class FTPUpdateRequest(BaseModel):
    """Request body for updating the athlete's FTP."""

    ftp_watts: int = Field(..., ge=50, le=2000, description="New FTP in watts")
    source: str = Field(
        default="manual",
        description='Source of the FTP measurement (e.g. "manual", "ramp_test", "20min_test")',
    )


@router.put(
    "",
    response_model=FTPHistoryResponse,
    summary="Update current FTP and append to history",
)
async def update_ftp(
    data: FTPUpdateRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> FTPHistoryResponse:
    """Update the athlete's current FTP and record it in the history timeline.

    Each call appends a new entry to ftp_history with the timestamp and source.
    SQLAlchemy requires flag_modified() to detect mutations to JSON columns.

    The updated FTP is immediately reflected in TSS calculations for new activities
    and in the zones endpoint.
    """
    profile = await get_or_create_profile(db, current_user.id)

    now_utc_iso = datetime.now(timezone.utc).isoformat()

    # Update current FTP
    profile.ftp_watts = data.ftp_watts

    # Append to history — MUST use flag_modified so SQLAlchemy tracks the JSON mutation
    current_history = profile.ftp_history or []
    new_entry = {
        "ftp_watts": data.ftp_watts,
        "measured_at": now_utc_iso,
        "source": data.source,
    }
    profile.ftp_history = current_history + [new_entry]
    flag_modified(profile, "ftp_history")

    await db.commit()
    await db.refresh(profile)

    return _build_history_response(profile)


@router.get(
    "/history",
    response_model=FTPHistoryResponse,
    summary="Return the athlete's FTP progression timeline",
)
async def get_ftp_history(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> FTPHistoryResponse:
    """Return the athlete's current FTP and full history, sorted chronologically.

    Useful for charting FTP progression over time and correlating with CTL trends.
    """
    profile = await get_or_create_profile(db, current_user.id)
    return _build_history_response(profile)


def _build_history_response(profile) -> FTPHistoryResponse:
    """Build FTPHistoryResponse from an AthleteProfile instance."""
    raw_history = profile.ftp_history or []

    entries: list[FTPHistoryEntry] = []
    for item in raw_history:
        # Support legacy entries that lack a "source" field (from athlete PATCH route)
        entries.append(
            FTPHistoryEntry(
                ftp_watts=item["ftp_watts"],
                measured_at=item["measured_at"],
                source=item.get("source", "manual"),
            )
        )

    # Sort chronologically (oldest first)
    entries.sort(key=lambda e: e.measured_at)

    return FTPHistoryResponse(
        current_ftp=profile.ftp_watts,
        history=entries,
    )
