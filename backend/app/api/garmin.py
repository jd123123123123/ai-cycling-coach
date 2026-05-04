"""Garmin Connect account management API endpoints.

Provides 4 endpoints for managing a user's Garmin account connection:
    POST   /garmin/connect     — Link Garmin account + trigger initial sync
    DELETE /garmin/disconnect  — Unlink Garmin account + clean up tokens
    GET    /garmin/status      — Check connection status and last sync info
    POST   /garmin/sync        — Trigger a manual incremental sync

All endpoints require authentication via get_current_active_user.
All database access uses get_db_for_user (RLS-enabled session).

Design notes:
    - Credentials are stored encrypted via GarminCredential (EncryptedString TypeDecorator)
    - Token store lives under /data/garmin_tokens/{user_id}/ (volume-mounted in Docker)
    - Initial sync on connect: 90-day activity backfill + 30-day metrics backfill
    - Auth uses garmin-health-data's 5-strategy SSO chain (~30–45 s for fresh login)
    - On GarminAuthError during connect: credential is rolled back (bad creds not stored)
    - On GarminRateLimitError: 429 returned; user should wait 15–30 min or switch IP
    - On generic error during connect: credential is kept, sync_status="error" (will retry hourly)
"""
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_active_user, get_db_for_user
from app.models.garmin_credential import GarminCredential
from app.models.user import User
from app.schemas.garmin import (
    GarminConnectRequest,
    GarminDisconnectResponse,
    GarminStatusResponse,
    GarminSyncResponse,
)
from app.services.garmin_client import GarminAuthError, GarminRateLimitError
from app.services.garmin_sync_service import sync_user_garmin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/garmin", tags=["garmin"])


@router.post(
    "/connect",
    response_model=GarminSyncResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Connect Garmin account",
    description=(
        "Link a Garmin Connect account by storing encrypted credentials. "
        "Triggers an initial 90-day activity backfill and 30-day metrics backfill. "
        "Returns 409 if an account is already connected (disconnect first)."
    ),
)
async def connect_garmin(
    body: GarminConnectRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> GarminSyncResponse:
    """Connect a Garmin account and trigger initial sync."""
    # Check for existing credential
    existing = await db.execute(
        select(GarminCredential).where(GarminCredential.user_id == current_user.id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Garmin account already connected. Disconnect first.",
        )

    # Create and persist the credential record
    credential = GarminCredential(
        user_id=current_user.id,
        encrypted_email=body.email,
        encrypted_password=body.password,
        sync_enabled=True,
        sync_status="syncing",
    )
    db.add(credential)
    await db.commit()
    await db.refresh(credential)

    # Set per-user token store path and create the directory.
    # Root is configurable via GARMIN_TOKEN_STORE_ROOT (defaults to /data/garmin_tokens for
    # Docker; override to a writable path when running natively).
    token_store_path = os.path.join(settings.GARMIN_TOKEN_STORE_ROOT, str(current_user.id))
    os.makedirs(token_store_path, exist_ok=True)
    credential.token_store_path = token_store_path
    await db.commit()
    await db.refresh(credential)

    # Attempt initial sync
    try:
        sync_result = await sync_user_garmin(db, credential)
        logger.info(
            "Initial Garmin sync complete for user_id=%s: %s",
            current_user.id,
            sync_result,
        )
        return GarminSyncResponse(
            activities_synced=sync_result["activities_synced"],
            metrics_days=sync_result["metrics_days"],
            message="Garmin connected and initial sync complete",
            dates_touched=sync_result.get("dates_touched", []),
        )
    except GarminRateLimitError:
        # Rate-limited — roll back credential (not a bad-creds problem)
        logger.warning(
            "Garmin rate limit hit during connect for user_id=%s — removing credential",
            current_user.id,
        )
        await db.delete(credential)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Garmin is rate-limiting this server. "
                "Wait 15–30 minutes or try from a different network and reconnect."
            ),
        )
    except GarminAuthError:
        # Bad credentials — roll back the credential entirely
        logger.warning(
            "Garmin auth failed during initial connect for user_id=%s — removing credential",
            current_user.id,
        )
        await db.delete(credential)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Garmin authentication failed. Check your email and password.",
        )
    except Exception as exc:
        # Sync error — keep credential but mark as error; hourly scheduler will retry
        logger.exception(
            "Initial sync failed for user_id=%s (credential kept): %s",
            current_user.id,
            exc,
        )
        credential.sync_status = "error"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Initial sync failed but Garmin account is connected. "
                "Sync will retry automatically."
            ),
        )


@router.delete(
    "/disconnect",
    response_model=GarminDisconnectResponse,
    summary="Disconnect Garmin account",
    description="Remove Garmin credentials and stop automatic sync for the current user.",
)
async def disconnect_garmin(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> GarminDisconnectResponse:
    """Disconnect Garmin account and clean up token files."""
    result = await db.execute(
        select(GarminCredential).where(GarminCredential.user_id == current_user.id)
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Garmin account connected.",
        )

    # Clean up token store directory (non-fatal on failure)
    token_store_path = credential.token_store_path
    await db.delete(credential)
    await db.commit()

    if token_store_path:
        try:
            import shutil
            shutil.rmtree(token_store_path, ignore_errors=True)
            logger.info(
                "Cleaned up Garmin token store at %s for user_id=%s",
                token_store_path,
                current_user.id,
            )
        except Exception as exc:
            logger.warning(
                "Failed to clean up Garmin token store at %s: %s",
                token_store_path,
                exc,
            )

    logger.info("Garmin account disconnected for user_id=%s", current_user.id)
    return GarminDisconnectResponse(message="Garmin account disconnected")


@router.get(
    "/status",
    response_model=GarminStatusResponse,
    summary="Get Garmin connection status",
    description=(
        "Returns connection status and last sync information. "
        "When connected=false, all other fields will be null."
    ),
)
async def get_garmin_status(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> GarminStatusResponse:
    """Return Garmin connection status for the current user."""
    result = await db.execute(
        select(GarminCredential).where(GarminCredential.user_id == current_user.id)
    )
    credential = result.scalar_one_or_none()

    if credential is None:
        return GarminStatusResponse(connected=False)

    return GarminStatusResponse(
        connected=True,
        sync_enabled=credential.sync_enabled,
        last_sync_at=credential.last_sync_at,
        sync_status=credential.sync_status,
    )


@router.post(
    "/sync",
    response_model=GarminSyncResponse,
    summary="Trigger manual Garmin sync",
    description=(
        "Manually trigger an incremental sync for the current user's connected Garmin account. "
        "Returns 404 if no account is connected, 409 if a sync is already in progress."
    ),
)
async def trigger_garmin_sync(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> GarminSyncResponse:
    """Trigger a manual incremental Garmin sync."""
    result = await db.execute(
        select(GarminCredential).where(GarminCredential.user_id == current_user.id)
    )
    credential = result.scalar_one_or_none()

    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Garmin account connected.",
        )

    if credential.sync_status == "syncing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sync already in progress.",
        )

    # Mark as syncing before starting
    credential.sync_status = "syncing"
    await db.commit()

    try:
        sync_result = await sync_user_garmin(db, credential)
        logger.info(
            "Manual sync complete for user_id=%s: %s",
            current_user.id,
            sync_result,
        )
        return GarminSyncResponse(
            activities_synced=sync_result["activities_synced"],
            metrics_days=sync_result["metrics_days"],
            message="Sync complete",
            dates_touched=sync_result.get("dates_touched", []),
        )
    except GarminAuthError:
        logger.warning(
            "Garmin auth error during manual sync for user_id=%s",
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Garmin authentication failed. Please reconnect.",
        )
    except Exception as exc:
        logger.exception(
            "Manual sync failed for user_id=%s: %s",
            current_user.id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sync failed. Check server logs for details.",
        )
