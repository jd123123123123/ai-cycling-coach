"""APScheduler setup for background Garmin sync.

Runs a job every 15 minutes that iterates over all users with sync_enabled=True
and calls sync_user_garmin for each one.  Individual user failures are logged
and skipped so one bad credential never blocks the rest.

Design notes:
- Uses AsyncIOScheduler (same event loop as FastAPI).
- DB sessions are opened with async_session_maker directly — this is a system-level
  job, not a user request, so RLS is intentionally bypassed.  All queries inside
  sync_user_garmin are already scoped by user_id (WHERE user_id = ...).
- misfire_grace_time=600 allows the job to run up to 10 minutes late after a
  server restart without being counted as a missed execution.
"""

import logging
from datetime import date, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.database import async_session_maker
from app.models.garmin_credential import GarminCredential
from app.models.planned_workout import PlannedWorkout
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


async def run_hourly_plan_adaptation() -> None:
    """Hourly plan-adaptation sweep (plan-engine v2): every user with an
    active plan gets today + the next six days re-evaluated against fresh
    signals (sleep/HRV/status/load) by plan_adaptation_engine.run_for_user.

    Mirrors run_all_user_syncs: system-level job (RLS intentionally bypassed —
    all engine queries are user_id-scoped), per-user try/except so one failure
    never blocks the rest. Cheap when nothing changes — the engine fingerprints
    its signal snapshot and exits quietly on an unchanged hour."""
    from app.services.plan_adaptation_engine import run_for_user

    adapted = 0
    failed = 0
    async with async_session_maker() as db:
        # "Active plan" = at least one planned workout today or in the future
        # (yesterday included to tolerate timezone skew around midnight UTC).
        rows = await db.execute(
            select(PlannedWorkout.user_id)
            .where(PlannedWorkout.date >= date.today() - timedelta(days=1))
            .distinct()
        )
        user_ids = [r[0] for r in rows.all()]

        for uid in user_ids:
            try:
                result = await run_for_user(db, uid)
                if result.get("changes"):
                    adapted += 1
                    logger.info(
                        "Plan adapted for user %d: %s",
                        uid,
                        [c["rule"] for c in result["changes"]],
                    )
            except Exception:
                failed += 1
                logger.exception("Plan adaptation failed for user %d — continuing", uid)
                try:
                    await db.rollback()  # keep the shared session usable
                except Exception:  # noqa: BLE001 — rollback failure is terminal for this sweep
                    logger.exception("Session rollback failed — aborting adaptation sweep")
                    break

    if adapted or failed:
        logger.info("Plan adaptation sweep done: %d adapted, %d failed", adapted, failed)


async def run_morning_push_briefs() -> None:
    """Hourly: send the morning-brief push to athletes inside their local
    morning hour (roadmap P1.5). System-level job — RLS intentionally
    bypassed, same as the sync job."""
    from app.services.push_service import push_configured, run_morning_briefs

    if not push_configured():
        return
    async with async_session_maker() as db:
        try:
            sent = await run_morning_briefs(db)
            if sent:
                logger.info("Morning brief push sent to %d athletes", sent)
        except Exception:
            logger.exception("Morning brief push job failed (non-fatal)")
