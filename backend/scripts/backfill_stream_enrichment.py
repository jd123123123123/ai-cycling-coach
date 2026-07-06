"""Backfill GPS/speed/temp/biomech + weather onto historical cycling streams.

Re-fetches Garmin activity details for each stored cycling ride and re-ingests
the streams (now capturing the enriched channels added in Race Debrief Phase 0:
GPS/lat-lng, speed, distance, temperature, and biomech balance/effectiveness/
smoothness channels), plus a best-effort weather fetch. Idempotent: re-ingest
upserts the existing `activity_streams` row (see `ingest_activity_streams`).

This is a standalone batch version of `garmin_sync_service._sync_activity_streams`
that iterates already-stored activities instead of freshly-synced ones, so it
can be run once to enrich rides that were ingested before Tasks 1-3 added the
new channels.

Usage:
    cd backend && python -m scripts.backfill_stream_enrichment --user-id 1 [--limit 10]
"""
from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import event, select, text

from app.database import async_session_maker
from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.garmin_credential import GarminCredential
from app.services.garmin_details_parser import garmin_details_to_records
from app.services.garmin_sync_service import create_garmin_client_for_user
from app.services.stream_extraction import records_to_streams
from app.services.stream_ingestion import has_gps, ingest_activity_streams
from app.services.weather_client import fetch_ride_weather

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backfill_stream_enrichment")


async def backfill_user(user_id: int, limit: int | None) -> None:
    async with async_session_maker() as db:
        # Mirror dependencies.get_db_for_user's RLS setup: SET LOCAL is
        # transaction-scoped, so re-apply it at the start of every new
        # transaction (initial + each implicit BEGIN after a commit), since
        # ingest_activity_streams commits per-activity below.
        set_local_sql = text(f"SET LOCAL app.current_user_id = '{user_id}'")

        def _reapply_rls(session, transaction, connection):  # type: ignore[no-untyped-def]
            connection.execute(set_local_sql)

        event.listen(db.sync_session, "after_begin", _reapply_rls)
        await db.execute(set_local_sql)

        try:
            credential = (
                await db.execute(
                    select(GarminCredential).where(GarminCredential.user_id == user_id)
                )
            ).scalar_one_or_none()
            if credential is None:
                logger.error("No GarminCredential for user_id=%s — aborting", user_id)
                return

            profile = (
                await db.execute(
                    select(AthleteProfile).where(AthleteProfile.user_id == user_id)
                )
            ).scalar_one_or_none()
            ftp = float(profile.ftp_watts) if profile and profile.ftp_watts else None

            q = select(Activity).where(
                Activity.sport == "cycling", Activity.external_id.isnot(None)
            ).order_by(Activity.started_at.desc())
            if limit:
                q = q.limit(limit)
            activities = (await db.execute(q)).scalars().all()
            logger.info(
                "Backfilling %d cycling activities for user_id=%s", len(activities), user_id
            )

            client = await create_garmin_client_for_user(credential)

            for act in activities:
                try:
                    detail = await client.get_activity_details(int(act.external_id))
                    records = garmin_details_to_records(detail)
                    if not records or not any(r.get("power") is not None for r in records):
                        logger.info("skip activity %s: no power stream", act.id)
                        continue
                    streams = records_to_streams(records)
                    weather = None
                    if has_gps(streams) and act.started_at is not None:
                        lat = next((v for v in streams.latitude if v is not None), None)
                        lng = next((v for v in streams.longitude if v is not None), None)
                        if lat is not None and lng is not None:
                            end = act.started_at + timedelta(seconds=streams.duration_s)
                            weather = await fetch_ride_weather(lat, lng, act.started_at, end)
                    await ingest_activity_streams(
                        db,
                        user_id=user_id,
                        activity_id=act.id,
                        streams=streams,
                        ftp=ftp,
                        weather=weather,
                        commit=True,
                    )
                    logger.info(
                        "backfilled activity %s (gps=%s)", act.id, has_gps(streams)
                    )
                except Exception as exc:
                    logger.warning("skip activity %s: %s", act.id, exc)
        finally:
            event.remove(db.sync_session, "after_begin", _reapply_rls)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--user-id", type=int, required=True)
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    await backfill_user(args.user_id, args.limit)


if __name__ == "__main__":
    asyncio.run(main())
