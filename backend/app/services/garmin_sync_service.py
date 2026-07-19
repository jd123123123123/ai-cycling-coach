"""Garmin sync service — orchestrates activity and daily metrics sync for a user.

This service coordinates the full Garmin data pipeline:
1. Authenticate with Garmin Connect using stored (encrypted) credentials
2. Fetch activities for a date range and persist via create_activity (auto-TSS)
3. Fetch daily biometrics (sleep, HRV, body battery, HR, stress, steps) per day
4. Update sync metadata on GarminCredential (last_sync_at, sync_status)

Design principles:
- ALL Garmin API interactions go through GarminProvider (Protocol), NOT garminconnect directly
- Idempotent: duplicate activities are detected by external_id and skipped
- Defensive: each daily biometric endpoint is wrapped in try/except so a single
  endpoint failure doesn't abort the entire sync
- Rate-limited: INTER_REQUEST_DELAY=0.3s between daily metric days to avoid hammering
  the unofficial API
- Auth failures immediately disable sync (sync_enabled=False) and surface via sync_status

Initial backfill:
- Activities: 90 days, fetched in 30-day chunks to respect pagination limits
- Daily metrics: 30 days

Incremental sync:
- Activities: from last_sync_at - 2h buffer (catches late Garmin uploads)
- Daily metrics: same start as activities

Transaction model:
- Activities: each create_activity calls db.commit() internally
- Daily metrics: upsert_daily_metric uses db.flush(); sync_daily_metrics commits once at end
- sync_user_garmin commits credential updates
"""
import asyncio
import logging
from datetime import UTC, date, datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.coach_brief import CoachBrief
from app.models.daily_metric import DailyMetric
from app.models.garmin_credential import GarminCredential
from app.models.period_report_cache import PeriodReportCache
from app.services.period_report import precompute_preset_reports, should_precompute_daily
from app.services.activity_service import create_activity
from app.services.daily_metric_service import upsert_daily_metric
from app.services.garmin_details_parser import garmin_details_to_records
from app.services.stream_extraction import records_to_streams
from app.services.stream_ingestion import has_gps, ingest_activity_streams
from app.services.garmin_client import GarminAuthError, GarminProvider
from app.services.garmin_mapper import map_daily_metrics, map_garmin_activity
from app.services.garmin_sleep_parser import apply_sleep_vitals, merge_raw_snapshots
from app.services.intraday_sync_service import sync_intraday_samples_for_day
from app.services.weather_client import fetch_ride_weather

logger = logging.getLogger(__name__)

# --- Constants ---

# How far back to backfill activities on first connect (days)
INITIAL_BACKFILL_DAYS = 90

# How far back to backfill daily metrics on first connect (days)
DAILY_METRICS_BACKFILL_DAYS = 30

# Overlap buffer for incremental sync — handles Garmin's delayed activity uploads
# (e.g., user records ride offline, sync happens 90 min later)
SYNC_BUFFER_HOURS = 2

# Seconds to pause between daily metric API calls (rate-limit protection)
INTER_REQUEST_DELAY = 0.3

# Max days per activity fetch chunk — avoids undocumented pagination limits
ACTIVITY_CHUNK_DAYS = 30


# ---------------------------------------------------------------------------
# Client factory
# ---------------------------------------------------------------------------


async def create_garmin_client_for_user(credential: GarminCredential):
    """Instantiate and authenticate a GarminConnectClient for a credential record.

    Reads encrypted credentials from the ORM object (EncryptedString TypeDecorator
    decrypts transparently at access time).

    On GarminAuthError: marks the credential as auth_error + sync_enabled=False
    before re-raising, so callers know to skip this user in future runs.

    Note: Does NOT commit the credential change — caller is responsible for commit.

    Args:
        credential: GarminCredential ORM instance with encrypted_email/password.

    Returns:
        Authenticated GarminConnectClient (satisfies GarminProvider Protocol).

    Raises:
        GarminAuthError: If authentication fails.
    """
    from app.services.garmin_client import GarminHealthDataClient  # noqa: PLC0415 — lazy import

    client = GarminHealthDataClient(
        email=credential.encrypted_email,
        password=credential.encrypted_password,
        token_store_path=credential.token_store_path,
    )
    try:
        await client.authenticate()
        return client
    except GarminAuthError:
        logger.error(
            "Garmin auth failed for user_id=%s — disabling sync", credential.user_id
        )
        credential.sync_status = "auth_error"
        credential.sync_enabled = False
        raise


# ---------------------------------------------------------------------------
# Activity sync
# ---------------------------------------------------------------------------


async def sync_activities(
    db: AsyncSession,
    user_id: int,
    client: GarminProvider,
    start_date: date,
    end_date: date,
) -> int:
    """Sync Garmin activities for a user within a date range.

    - Fetches activities from the Garmin API for the range
    - Maps each raw dict to ActivityCreate via map_garmin_activity (skips unsupported sports)
    - Checks for existing Activity with same external_id (idempotent dedup)
    - Calls create_activity for new activities (auto-calculates TSS)
    - Athlete profile loaded once per call (not per activity)

    Args:
        db: SQLAlchemy async session.
        user_id: User to sync activities for.
        client: Authenticated GarminProvider implementation.
        start_date: Start of date range (inclusive).
        end_date: End of date range (inclusive).

    Returns:
        Number of newly inserted activities.
    """
    raw_activities = await client.get_activities(start_date, end_date)
    logger.info(
        "Fetched %d raw activities for user_id=%s (%s – %s)",
        len(raw_activities),
        user_id,
        start_date,
        end_date,
    )

    # Load athlete profile once — needed by create_activity for TSS calculation
    profile_result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()

    if profile is None:
        logger.warning(
            "No AthleteProfile found for user_id=%s — activities will be created with TSS=None",
            user_id,
        )
        # Create a minimal profile stub so create_activity doesn't crash
        # TSS will be None for all activities (no thresholds available)
        profile = AthleteProfile(user_id=user_id)

    synced = 0
    for raw in raw_activities:
        mapped = map_garmin_activity(raw)
        if mapped is None:
            logger.debug(
                "Skipped activity activityId=%s (unsupported sport or missing ID)",
                raw.get("activityId"),
            )
            continue

        # Idempotent dedup: skip if we already have this external_id
        existing = await db.execute(
            select(Activity).where(
                Activity.user_id == user_id,
                Activity.external_id == mapped.external_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            logger.debug(
                "Skipped duplicate activity external_id=%s for user_id=%s",
                mapped.external_id,
                user_id,
            )
            continue

        # create_activity auto-calculates TSS. It flushes (no commit) so the
        # RLS session var (SET LOCAL app.current_user_id) survives the loop.
        activity = await create_activity(db, user_id, mapped, profile)
        # Phase 0: fetch + store the per-second stream so CP/W′bal/durability
        # have real data. Best-effort and cycling-only; never breaks the sync.
        await _sync_activity_streams(db, user_id, client, activity, raw, profile)
        synced += 1
        logger.debug(
            "Synced activity external_id=%s sport=%s for user_id=%s",
            mapped.external_id,
            mapped.sport,
            user_id,
        )

    logger.info(
        "Activity sync complete for user_id=%s: %d/%d new",
        user_id,
        synced,
        len(raw_activities),
    )
    return synced


async def _sync_activity_streams(
    db: AsyncSession,
    user_id: int,
    client,
    activity,
    raw: dict,
    profile,
) -> None:
    """Best-effort: fetch the per-second stream for a freshly-synced ride or run
    and persist it + derived science metrics.

    Rides get the full power-duration model (CP/W′/durability). Runs get their
    complete stream blob — GPS, pace, grade-adjusted pace, HR, and running
    dynamics (vertical oscillation, ground contact, vertical ratio, stride
    length) — but skip the cycling power model. Fully defensive: any failure
    (no data, Garmin hiccup, parse error) is logged and swallowed so a stream
    problem can never break the core activity sync. Uses commit=False to stay
    inside the sync's single transaction (preserves the RLS SET LOCAL).
    """
    sport = getattr(activity, "sport", None) if activity is not None else None
    if activity is None or sport not in ("cycling", "running"):
        return
    is_ride = sport == "cycling"
    garmin_id = raw.get("activityId")
    if garmin_id is None:
        return
    try:
        detail = await client.get_activity_details(int(garmin_id))
        records = garmin_details_to_records(detail)
        if not records:
            return
        # Rides need a power stream to be worth storing (drives the CP model);
        # runs are worth storing for GPS / pace / HR / dynamics even without power.
        if is_ride and not any(r.get("power") is not None for r in records):
            return
        streams = records_to_streams(records)
        weather = None
        if has_gps(streams) and activity.started_at is not None:
            first_lat = next((v for v in streams.latitude if v is not None), None)
            first_lng = next((v for v in streams.longitude if v is not None), None)
            if first_lat is not None and first_lng is not None:
                end = activity.started_at + timedelta(seconds=streams.duration_s)
                weather = await fetch_ride_weather(
                    first_lat, first_lng, activity.started_at, end
                )
        ftp = float(profile.ftp_watts) if profile and profile.ftp_watts else None
        analysis = await ingest_activity_streams(
            db,
            user_id=user_id,
            activity_id=activity.id,
            streams=streams,
            ftp=ftp,
            weather=weather,
            commit=False,
            store_power_model=is_ride,
        )
        logger.info(
            "Ingested streams for activity id=%s (garmin %s): NP=%.0f, CP=%s",
            activity.id, garmin_id, analysis.np_watts,
            analysis.cp.cp_watts if analysis.cp else "n/a",
        )
    except Exception as exc:
        logger.warning(
            "Stream ingest failed for garmin activity %s (non-fatal): %s",
            garmin_id, exc,
        )


# ---------------------------------------------------------------------------
# Daily metrics sync
# ---------------------------------------------------------------------------


async def sync_daily_metrics(
    db: AsyncSession,
    user_id: int,
    client: GarminProvider,
    start_date: date,
    end_date: date,
) -> int:
    """Sync Garmin daily biometrics day-by-day within a date range.

    For each day, fetches up to 6 biometric data sources:
        sleep, HRV, body battery, heart rates, stress, user summary

    Each endpoint is independently wrapped in try/except — a device that doesn't
    support HRV will return None from get_hrv; API failures are logged and treated
    as None (partial data is better than no data).

    Uses INTER_REQUEST_DELAY between days to avoid rate-limiting the unofficial API.
    Commits once at the end of the date range (batched transaction).

    Args:
        db: SQLAlchemy async session.
        user_id: User to sync metrics for.
        client: Authenticated GarminProvider implementation.
        start_date: Start of range (inclusive).
        end_date: End of range (inclusive).

    Returns:
        Number of days for which a DailyMetric was inserted (skips existing rows).
    """
    inserted = 0
    current_day = start_date

    while current_day <= end_date:
        # Fetch each biometric source independently — failure in one doesn't abort day
        sleep = await _safe_fetch(client.get_sleep, current_day, "sleep", user_id)
        hrv = await _safe_fetch(client.get_hrv, current_day, "hrv", user_id)
        # body_battery returns list[dict] — call with same-day range
        body_battery = await _safe_fetch(
            lambda d: client.get_body_battery(d, d), current_day, "body_battery", user_id
        )
        heart_rates = await _safe_fetch(
            client.get_heart_rates, current_day, "heart_rates", user_id
        )
        stress = await _safe_fetch(client.get_stress, current_day, "stress", user_id)
        summary = await _safe_fetch(
            client.get_user_summary, current_day, "user_summary", user_id
        )
        # VO₂max / fitness age (training status) + training readiness — extra datapoints.
        training_status = await _safe_fetch(
            client.get_training_status, current_day, "training_status", user_id
        )
        training_readiness = await _safe_fetch(
            client.get_training_readiness, current_day, "training_readiness", user_id
        )

        mapped_data = map_daily_metrics(
            sleep, hrv, body_battery, heart_rates, stress, summary,
            training_status=training_status, training_readiness=training_readiness,
        )

        # Snapshot the previously stored raw payload BEFORE upsert overwrites
        # it — upsert_daily_metric always replaces raw_data with the latest
        # fetch, and a re-sync where one endpoint failed would otherwise wipe
        # a rich sleep payload already captured for that night.
        old_row = (
            await db.execute(
                select(DailyMetric).where(
                    DailyMetric.user_id == user_id,
                    DailyMetric.date == current_day,
                )
            )
        ).scalar_one_or_none()
        old_raw = dict(old_row.raw_data) if old_row is not None and isinstance(old_row.raw_data, dict) else None

        result = await upsert_daily_metric(db, user_id, current_day, mapped_data)
        if result is not None:
            inserted += 1
            # Persist parsed sleep vitals (stages / SpO₂ / respiration /
            # overnight HRV) as real columns — progressive, never clobbers.
            filled = apply_sleep_vitals(result, mapped_data)
            if filled:
                logger.debug(
                    "Sleep vitals filled for user_id=%s date=%s: %s",
                    user_id, current_day, filled,
                )
            # Keep the richer per-source raw snapshot (newest-non-null wins).
            merged_raw = merge_raw_snapshots(old_raw, result.raw_data)
            if merged_raw is not None and merged_raw != result.raw_data:
                result.raw_data = merged_raw
            await db.flush()

        # Also persist intraday samples for this day — enables fast drill-down later.
        # Wrapped independently so a Garmin intraday API failure doesn't abort daily sync.
        try:
            await sync_intraday_samples_for_day(db, client, user_id, current_day)
        except GarminAuthError:
            raise  # Auth errors propagate to abort the whole sync
        except Exception as exc:
            logger.warning(
                "Intraday sync failed for user_id=%s date=%s (non-fatal): %s",
                user_id,
                current_day,
                exc,
            )

        current_day += timedelta(days=1)

        # Rate-limit: pause between days to avoid overwhelming the unofficial API
        if current_day <= end_date:
            await asyncio.sleep(INTER_REQUEST_DELAY)

    # Batch commit — upsert_daily_metric only flushes; we commit all days at once
    await db.commit()
    logger.info(
        "Daily metrics sync complete for user_id=%s: %d/%d days inserted",
        user_id,
        inserted,
        (end_date - start_date).days + 1,
    )
    return inserted


async def _safe_fetch(fetch_fn, day: date, name: str, user_id: int):
    """Call a single Garmin API endpoint, returning None on any non-auth error.

    GarminAuthError is re-raised (caller should abort sync for auth failures).
    All other exceptions are caught, logged, and return None so the day's sync
    continues with whatever data is available.

    Args:
        fetch_fn: Async callable taking a date argument.
        day: Date to fetch data for.
        name: Human-readable endpoint name for logging.
        user_id: User ID for log context.

    Returns:
        API response (dict, list, or None) or None on failure.
    """
    try:
        return await fetch_fn(day)
    except GarminAuthError:
        raise  # Auth errors must propagate — sync should be disabled
    except Exception as exc:
        logger.warning(
            "Failed to fetch %s for user_id=%s date=%s: %s",
            name,
            user_id,
            day,
            exc,
        )
        return None


async def _refresh_period_report_cache(db, user_id, today, new_activities, tz_name) -> None:
    """Keep the period_reports cache fresh after a sync. Best-effort: never raises.

    - A workout landed (new_activities > 0): invalidate today's cached reports
      (all windows, incl. custom) and warm the presets.
    - Else, on the first sync past the morning hour today: warm the presets.
    """
    try:
        last = (
            await db.execute(
                select(PeriodReportCache.generated_at)
                .where(PeriodReportCache.user_id == user_id)
                .order_by(PeriodReportCache.generated_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        daily_due = should_precompute_daily(datetime.now(timezone.utc), tz_name, last)

        if new_activities > 0:
            # New data landed → invalidate ALL cached windows (presets + custom).
            # TTL is effectively infinite (refresh-on-demand), so a date-scoped
            # delete would strand a prior-day custom window as permanently stale.
            await db.execute(
                delete(PeriodReportCache).where(PeriodReportCache.user_id == user_id)
            )
            await db.commit()
            await precompute_preset_reports(db, user_id)
        elif daily_due:
            await precompute_preset_reports(db, user_id)
    except Exception as exc:  # noqa: BLE001 — cache refresh must not break sync
        logger.warning(
            "period-report cache refresh failed for user_id=%s (non-fatal): %s", user_id, exc
        )
        await db.rollback()


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def sync_user_garmin(db: AsyncSession, credential: GarminCredential) -> dict:
    """Orchestrate full Garmin data sync for a single user.

    Determines sync strategy based on credential.last_sync_at:
    - First sync (last_sync_at is None): full backfill
      - Activities: 90 days, fetched in 30-day chunks
      - Daily metrics: last 30 days
    - Incremental sync: from (last_sync_at - 2h) to today
      - The 2-hour buffer catches Garmin's delayed activity uploads

    Updates GarminCredential.last_sync_at and sync_status on completion.

    Args:
        db: SQLAlchemy async session.
        credential: GarminCredential ORM instance for the user to sync.

    Returns:
        dict with keys: activities_synced (int), metrics_days (int)

    Raises:
        GarminAuthError: If authentication fails (sync disabled on credential).
        Exception: Any other error (sync_status set to "error").
    """
    user_id = credential.user_id
    today = datetime.now(timezone.utc).date()

    logger.info("Starting Garmin sync for user_id=%s", user_id)

    try:
        client = await create_garmin_client_for_user(credential)
    except GarminAuthError:
        await db.commit()  # Persist auth_error status set in create_garmin_client_for_user
        raise

    is_initial_sync = credential.last_sync_at is None

    # --- Determine activity sync range ---
    if is_initial_sync:
        activity_start = today - timedelta(days=INITIAL_BACKFILL_DAYS)
    else:
        # Subtract buffer to catch uploads that arrived after last sync
        last_sync_date = credential.last_sync_at - timedelta(hours=SYNC_BUFFER_HOURS)
        activity_start = last_sync_date.date()

    activity_end = today

    # --- Determine daily metrics range ---
    if is_initial_sync:
        metrics_start = max(
            activity_start,
            today - timedelta(days=DAILY_METRICS_BACKFILL_DAYS),
        )
    else:
        metrics_start = activity_start  # Same window as activities for incremental

    try:
        total_activities = 0

        if is_initial_sync:
            # Chunk activities to avoid undocumented pagination limits
            chunk_start = activity_start
            while chunk_start <= activity_end:
                chunk_end = min(
                    chunk_start + timedelta(days=ACTIVITY_CHUNK_DAYS - 1),
                    activity_end,
                )
                logger.info(
                    "Fetching activity chunk %s – %s for user_id=%s",
                    chunk_start,
                    chunk_end,
                    user_id,
                )
                count = await sync_activities(db, user_id, client, chunk_start, chunk_end)
                total_activities += count
                chunk_start = chunk_end + timedelta(days=1)

                # Pause between chunks to rate-limit
                if chunk_start <= activity_end:
                    await asyncio.sleep(INTER_REQUEST_DELAY)
        else:
            total_activities = await sync_activities(
                db, user_id, client, activity_start, activity_end
            )

        # Daily metrics sync (day-by-day with per-day commit at end)
        metrics_days = await sync_daily_metrics(
            db, user_id, client, metrics_start, activity_end
        )

        # Update sync metadata
        credential.last_sync_at = datetime.now(timezone.utc)
        credential.sync_status = "ok"
        await db.commit()

        # Absorb-and-replan (P1.4): unplanned/oversized rides get absorbed and
        # the week gently rebalanced. Best-effort by contract — never breaks sync.
        if total_activities > 0:
            from app.services.plan_absorption import absorb_new_activities

            await absorb_new_activities(db, user_id)

        # Weight (best-effort, one range call per sync): scale/manual weigh-ins
        # from the free weight-service → daily_metrics + profile W/kg source.
        try:
            from app.services.garmin_weight import apply_weigh_ins, parse_weigh_ins

            payload = await client.get_weigh_ins(metrics_start, activity_end)
            await apply_weigh_ins(db, user_id, parse_weigh_ins(payload))
        except Exception:  # noqa: BLE001 — weight must never break a sync
            logger.warning("weight fetch failed (user_id=%s) — non-fatal", user_id)

        # Build the list of athlete-days the sync may have changed. Step 2 will
        # rethread this through athlete-local time; UTC `today` is fine for now.
        dates_touched: list[date] = []
        cursor = activity_start
        while cursor <= activity_end:
            dates_touched.append(cursor)
            cursor += timedelta(days=1)

        # Invalidate ALL cached coach briefs for this user. Briefs now use an
        # effectively-infinite TTL (refresh-on-demand), so a date-scoped delete
        # would leave a prior-day brief stuck forever. A Garmin sync is exactly
        # the "new data arrived" signal that should regenerate it — the next read
        # of /coach/brief rebuilds against the freshly-synced activities/metrics.
        # Defensive: a delete failure must NOT break the sync return.
        try:
            await db.execute(
                delete(CoachBrief).where(CoachBrief.user_id == user_id)
            )
            await db.commit()
        except Exception as exc:
            logger.warning(
                "Failed to invalidate coach_briefs for user_id=%s after sync (non-fatal): %s",
                user_id,
                exc,
            )
            await db.rollback()

        # Keep the period-report cache fresh (mirror coach_briefs). Reads the
        # athlete's timezone for the once-a-day morning gate.
        prof = (
            await db.execute(
                select(AthleteProfile).where(AthleteProfile.user_id == user_id)
            )
        ).scalar_one_or_none()
        await _refresh_period_report_cache(
            db, user_id, today, total_activities, prof.timezone if prof else None,
        )

        result = {
            "activities_synced": total_activities,
            "metrics_days": metrics_days,
            "dates_touched": dates_touched,
        }
        logger.info(
            "Garmin sync complete for user_id=%s: %s", user_id, result
        )
        return result

    except GarminAuthError:
        # A failed flush/commit leaves the session in a pending-rollback state;
        # roll back first or the status-reset commit itself raises
        # PendingRollbackError and the credential stays stuck at "syncing".
        await db.rollback()
        credential.sync_status = "auth_error"
        credential.sync_enabled = False
        await db.commit()
        raise

    except Exception as exc:
        logger.exception(
            "Unexpected error during Garmin sync for user_id=%s: %s", user_id, exc
        )
        # See note above: roll the poisoned session back before resetting status.
        await db.rollback()
        credential.sync_status = "error"
        await db.commit()
        raise
