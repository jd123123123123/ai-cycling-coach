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
from app.services.garmin_client import (
    GarminAuthError, GarminError, GarminProvider, GarminRateLimitError,
    GarminTransientError,
)
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

#: How long a rate-limited rider is left alone, and how it grows.
#:
#: Garmin's own guidance for a throttled IP is "wait 15–30 minutes". The first
#: refusal buys 15 minutes; each further one while still backed off doubles it,
#: to a ceiling of four hours. It resets the moment a sync succeeds.
BACKOFF_BASE_MINUTES = 15
BACKOFF_MAX_MINUTES = 240

#: The eight biometric endpoints answer the same thing all day. A ride can land
#: any minute; last night's sleep cannot change sixty times an hour. This is the
#: single biggest saving in the sync — it takes the per-run upstream cost from
#: eleven-to-nineteen calls down to one, on all but a handful of runs an hour.
METRICS_MIN_INTERVAL_MINUTES = 20

#: The backfills and the weigh-in fetch. None of them is why a sync runs every
#: minute, and the elevation backfill is deliberately unbounded over history.
MAINTENANCE_MIN_INTERVAL_MINUTES = 360

#: How many auth failures IN A ROW before we believe the credential is bad.
#:
#: One is not evidence. Measured 2026-08-25: two riders were disabled by an auth
#: failure sixty seconds after the same credentials had authenticated and pulled
#: seven rides — Garmin's login is behind a bot-detection layer that fails
#: intermittently, and a login that worked a minute ago says far more about the
#: password than a login that failed just now. Three consecutive failures, with
#: a growing backoff between them, is a rider who really does need to reconnect.
AUTH_FAILURES_BEFORE_DISABLE = 3

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
    except (GarminRateLimitError, GarminTransientError):
        # ORDER MATTERS, AND IT IS THE WHOLE BUG. This clause did not exist,
        # `GarminRateLimitError` subclassed `GarminAuthError`, and so being
        # throttled fell into the branch below and turned the rider off for
        # good. Neither of these says anything about the credential; the caller
        # sets a backoff and we try again later.
        logger.warning(
            "Garmin unavailable during auth for user_id=%s — backing off, "
            "sync stays enabled", credential.user_id,
        )
        raise
    except GarminAuthError:
        # ONE FAILURE IS NOT A VERDICT. Garmin's login sits behind bot
        # detection that refuses intermittently, so a single "auth failed" is
        # far more likely to be a bad minute than a bad password. Count them,
        # back off between attempts, and only disable once the credential has
        # failed three times in a row without a success in between.
        credential.auth_failures = (credential.auth_failures or 0) + 1
        if credential.auth_failures >= AUTH_FAILURES_BEFORE_DISABLE:
            logger.error(
                "Garmin auth failed %d times running for user_id=%s — disabling sync",
                credential.auth_failures, credential.user_id,
            )
            credential.sync_status = "auth_error"
            credential.sync_enabled = False
        else:
            logger.warning(
                "Garmin auth failed for user_id=%s (%d/%d) — backing off, sync stays enabled",
                credential.user_id, credential.auth_failures, AUTH_FAILURES_BEFORE_DISABLE,
            )
            credential.sync_status = "auth_retry"
            credential.backoff_until = _next_backoff(credential, datetime.now(timezone.utc))
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
            # Tightens the corrupt-power ingest guard from the absolute 500 W
            # bound to 5 W/kg when the athlete's weight is known.
            weight_kg=float(profile.weight_kg) if profile and profile.weight_kg else None,
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
        except GarminError:
            raise  # Auth and rate-limit both abort the whole sync
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
    except GarminError:
        # Auth AND rate limit propagate. A throttled endpoint answering "None"
        # would be written down as "this rider had no sleep last night".
        raise
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


async def invalidate_coach_brief_cache(db: AsyncSession, user_id: int) -> None:
    """Bust the athlete's cached coach briefs — the "completed workout" refresh
    trigger. Called from the sync ONLY when a new activity landed, so the next
    read of /coach/brief rebuilds the post-ride review. Defensive: a delete
    failure must NEVER break the sync return.

    AUDIT rows are NOT cache and are preserved: absorption dedup keys off
    verdict='absorption' rows and the undo window off 'modification' /
    'modification_undo'. Deleting them made every sync re-absorb the same rides
    and eat the week's biggest planned session (the Z2 death-spiral,
    plan-engine recon 2026-07-20).
    """
    try:
        await db.execute(
            delete(CoachBrief).where(
                CoachBrief.user_id == user_id,
                CoachBrief.verdict.notin_(
                    ("absorption", "modification", "modification_undo")
                ),
            )
        )
        await db.commit()
    except Exception as exc:
        logger.warning(
            "Failed to invalidate coach_briefs for user_id=%s after sync (non-fatal): %s",
            user_id,
            exc,
        )
        await db.rollback()


def _next_backoff(credential: GarminCredential, now: datetime) -> datetime:
    """When to try this rider again after Garmin refused.

    Doubles while the rider is STILL inside a backoff — that is what tells a
    one-off refusal from a server whose IP is genuinely in the doghouse — and
    starts fresh otherwise, so an unlucky minute six hours ago costs nothing.
    """
    minutes = BACKOFF_BASE_MINUTES
    if credential.backoff_until and credential.backoff_until > now:
        remaining = (credential.backoff_until - now).total_seconds() / 60
        minutes = min(BACKOFF_MAX_MINUTES, max(BACKOFF_BASE_MINUTES, remaining * 2))
    return now + timedelta(minutes=minutes)


def _due(stamp: datetime | None, now: datetime, minutes: int) -> bool:
    """Has `minutes` passed since `stamp`? Never having run counts as due."""
    return stamp is None or (now - stamp) >= timedelta(minutes=minutes)


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
    except (GarminRateLimitError, GarminTransientError) as exc:
        credential.sync_status = (
            "rate_limited" if isinstance(exc, GarminRateLimitError) else "unavailable"
        )
        credential.backoff_until = _next_backoff(credential, datetime.now(timezone.utc))
        await db.commit()
        raise
    except GarminAuthError:
        await db.commit()  # Persist the count/disable decision made above
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

        # Daily metrics sync (day-by-day with per-day commit at end).
        #
        # NOT EVERY RUN. Eight endpoints per day in the window is the whole cost
        # of a sync — at one run a minute that was ~16 000 calls per rider per
        # day against an unofficial API, which is how the rate limit that
        # disabled everybody got hit in the first place. A ride can land any
        # minute and still does; last night's sleep cannot.
        now = datetime.now(timezone.utc)
        metrics_due = _due(credential.metrics_synced_at, now, METRICS_MIN_INTERVAL_MINUTES)
        if metrics_due:
            metrics_days = await sync_daily_metrics(
                db, user_id, client, metrics_start, activity_end
            )
            credential.metrics_synced_at = now
        else:
            metrics_days = 0

        # Update sync metadata
        credential.last_sync_at = datetime.now(timezone.utc)
        credential.sync_status = "ok"
        credential.backoff_until = None   # it worked; forget the last refusal
        credential.auth_failures = 0      # ...and the run of failures before it
        await db.commit()

        # ── THE ONCE-IN-A-WHILE WORK ──────────────────────────────────────
        # Two DB backfills and an upstream weigh-in call, all of which used to
        # run on every single minute-ly sync. The elevation one is deliberately
        # unbounded over the rider's whole history. None of it is why this job
        # runs often, and a new activity is reason enough to do it now.
        maintenance_due = (
            total_activities > 0
            or _due(credential.maintenance_at, now, MAINTENANCE_MIN_INTERVAL_MINUTES)
        )
        if maintenance_due:
            credential.maintenance_at = now

        # Backfill TSS for the last 90 days of NULL-tss activities — a sync
        # may have delivered HR-only sessions whose thresholds only now
        # resolve (derived max HR / wearable resting HR). Best-effort.
        try:
            from app.services.activity_service import recompute_missing_tss

            if maintenance_due:
                await recompute_missing_tss(db, user_id, days=90)
        except Exception:  # noqa: BLE001 — backfill must never break a sync
            logger.warning(
                "recompute_missing_tss failed after sync (user_id=%s) — non-fatal",
                user_id,
            )

        # Backfill elevation gain (Höhenmeter) for NULL rows that carry a raw_data
        # blob — self-heals historical/COROS rides. Best-effort, never breaks sync.
        #
        # UNBOUNDED, NOT 90 DAYS. Reported 2026-08-19: lifetime Höhenmeter came
        # back too low. The cause is not the extractor — it is that a ride whose
        # column is NULL contributes 0 to every lifetime sum (the frontend
        # reducer does `elevation_gain_m ?? 0`), silently, and a 90-day window
        # meant any older ride that missed the value could never be healed. A
        # rider with four years of history had most of their ascent counted as
        # zero for good.
        #
        # Safe to run over the whole history: the query already filters to
        # `elevation_gain_m IS NULL AND raw_data IS NOT NULL`, so it is
        # self-limiting — once a row is filled it stops matching, and after the
        # first pass there is nothing left to scan.
        try:
            from app.services.activity_service import backfill_missing_elevation

            if maintenance_due:
                await backfill_missing_elevation(db, user_id, days=None)
        except Exception:  # noqa: BLE001 — backfill must never break a sync
            logger.warning(
                "backfill_missing_elevation failed after sync (user_id=%s) — non-fatal",
                user_id,
            )

        # Absorb-and-replan (P1.4): unplanned/oversized rides get absorbed and
        # the week gently rebalanced. Best-effort by contract — never breaks sync.
        if total_activities > 0:
            from app.services.plan_absorption import absorb_new_activities

            await absorb_new_activities(db, user_id)

        # Weight (best-effort, one range call per sync): scale/manual weigh-ins
        # from the free weight-service → daily_metrics + profile W/kg source.
        try:
            from app.services.garmin_weight import apply_weigh_ins, parse_weigh_ins

            if maintenance_due:
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

        # Coach-brief refresh policy (July 2026): the brief regenerates on
        # exactly four triggers (morning / evening / missed / completed-workout).
        # The "completed workout" trigger is HERE — bust the cache ONLY when a
        # NEW activity landed (total_activities > 0), so the next read of
        # /coach/brief flips to the post-ride review. A metrics-only sync
        # (sleep/HRV/RHR, no ride) must NOT regenerate the brief — that used to
        # fire on every 15-min sync and burned LLM cost all day. Morning /
        # evening / missed are handled by the hourly scheduler sweep
        # (coach_service.refresh_brief_scheduled_triggers).
        if total_activities > 0:
            await invalidate_coach_brief_cache(db, user_id)

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

    except (GarminRateLimitError, GarminTransientError) as exc:
        # THE RIDER STAYS ENABLED. This is the clause whose absence disabled
        # every account in production: throttling, and a network that dropped,
        # are facts about the next quarter of an hour — not about the credential.
        await db.rollback()
        credential.sync_status = (
            "rate_limited" if isinstance(exc, GarminRateLimitError) else "unavailable"
        )
        credential.backoff_until = _next_backoff(credential, datetime.now(timezone.utc))
        await db.commit()
        raise

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
