"""APScheduler setup for background Garmin sync.

Runs an hourly job that iterates over all users with sync_enabled=True and
calls sync_user_garmin for each one.  Individual user failures are logged and
skipped so one bad credential never blocks the rest.

Design notes:
- Uses AsyncIOScheduler (same event loop as FastAPI).
- DB sessions are opened with async_session_maker directly — this is a system-level
  job, not a user request, so RLS is intentionally bypassed.  All queries inside
  sync_user_garmin are already scoped by user_id (WHERE user_id = ...).
- misfire_grace_time=600 allows the job to run up to 10 minutes late after a
  server restart without being counted as a missed execution.
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.database import async_session_maker
from app.models.garmin_credential import GarminCredential
from app.services.garmin_sync_service import sync_user_garmin

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")


async def run_all_user_syncs() -> None:
    """Fetch all users with sync_enabled=True and run incremental sync for each."""
    logger.info("Starting scheduled Garmin sync for all users")
    synced = 0
    failed = 0

    async with async_session_maker() as db:
        result = await db.execute(
            select(GarminCredential).where(
                GarminCredential.sync_enabled == True  # noqa: E712 — SQLAlchemy requires == True
            )
        )
        credentials = result.scalars().all()
        logger.info("Found %d users with Garmin sync enabled", len(credentials))

        for cred in credentials:
            try:
                stats = await sync_user_garmin(db, cred)
                synced += 1
                logger.info(
                    "Synced user %d: %d activities, %d metric days",
                    cred.user_id,
                    stats["activities_synced"],
                    stats["metrics_days"],
                )
            except Exception as e:
                failed += 1
                logger.error("Sync failed for user %d: %s", cred.user_id, e)
                # Continue with other users — one failure must not stop all syncs

    logger.info("Scheduled sync complete: %d succeeded, %d failed", synced, failed)
