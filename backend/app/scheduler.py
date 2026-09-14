"""APScheduler setup for background Garmin sync.

Runs a job every minute that iterates over the users with sync_enabled=True who
are not currently backed off, and calls sync_user_garmin for each one.
Individual user failures are logged and skipped so one bad credential never
blocks the rest.

The minute-ly interval is for CATCHING A RIDE. It is not licence to re-ask
Garmin everything every minute: `sync_user_garmin` gates the eight biometric
endpoints and the backfills behind their own intervals, because doing all of it
sixty times an hour is what got this server's IP rate-limited — and, until
2026-08-25, every rider's sync switched off as a result.

Design notes:
- Uses AsyncIOScheduler (same event loop as FastAPI).
- DB sessions are opened with async_session_maker directly — this is a system-level
  job, not a user request, so RLS is intentionally bypassed.  All queries inside
  sync_user_garmin are already scoped by user_id (WHERE user_id = ...).
- misfire_grace_time is set per job in `main`; for the sync it is 45 s, because
  a run more than one interval late has been superseded by the next one.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import or_, select

from app.database import async_session_maker
from app.models.athlete_profile import AthleteProfile
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

    # Keep scalar IDs outside the unit of work. A rollback expires ORM fields
    # even with expire_on_commit=False, including fields used by logging.
    now = datetime.now(timezone.utc)
    async with async_session_maker() as db:
        result = await db.execute(
            select(GarminCredential.user_id).where(
                GarminCredential.sync_enabled == True,  # noqa: E712
                or_(GarminCredential.backoff_until.is_(None),
                    GarminCredential.backoff_until <= now),
            )
        )
        user_ids = list(result.scalars().all())
    logger.info("Found %d users with Garmin sync enabled", len(user_ids))

    for user_id in user_ids:
        try:
            # One broken account/transaction must not expire or poison the
            # next rider's session. Recheck availability after waiting in line.
            async with async_session_maker() as db:
                cred = (await db.execute(
                    select(GarminCredential).where(
                        GarminCredential.user_id == user_id,
                        GarminCredential.sync_enabled == True,  # noqa: E712
                        or_(GarminCredential.backoff_until.is_(None),
                            GarminCredential.backoff_until <= datetime.now(timezone.utc)),
                    )
                )).scalar_one_or_none()
                if cred is None:
                    continue
                stats = await sync_user_garmin(db, cred)
                synced += 1
                logger.info("Synced user %d: %d activities, %d metric days",
                            user_id, stats["activities_synced"], stats["metrics_days"])
        except Exception:
            failed += 1
            logger.exception("Sync failed for user %d — continuing", user_id)

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
    from app.services.plan_absorption import absorb_new_activities

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
                await absorb_new_activities(db, uid)
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


async def run_brief_refresh_sweep() -> None:
    """Hourly: regenerate each athlete's coach brief on the scheduler-owned
    refresh triggers — local morning, local evening, and a missed planned
    session (coach-brief 4-trigger policy, July 2026). The fourth trigger, a
    completed workout, is handled inline by the Garmin sync. Each trigger is
    deduped per athlete-local day, so this fires at most three cheap
    regenerations per athlete per day and no-ops the rest of the time.

    System-level job — RLS intentionally bypassed, same as the sync job.
    Per-user try/except so one failure never blocks the rest."""
    from app.services.coach_service import refresh_brief_scheduled_triggers

    refreshed = 0
    async with async_session_maker() as db:
        profiles = (await db.execute(select(AthleteProfile))).scalars().all()
        for profile in profiles:
            try:
                fired = await refresh_brief_scheduled_triggers(db, profile)
                if fired:
                    refreshed += 1
                    logger.info(
                        "Coach brief refreshed for user %d: %s",
                        profile.user_id,
                        fired,
                    )
            except Exception:
                logger.exception(
                    "Brief refresh failed for user %d — continuing", profile.user_id
                )
                try:
                    await db.rollback()  # keep the shared session usable
                except Exception:  # noqa: BLE001 — rollback failure is terminal
                    logger.exception("Session rollback failed — aborting brief sweep")
                    break

    if refreshed:
        logger.info("Brief refresh sweep done: %d athletes refreshed", refreshed)


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
