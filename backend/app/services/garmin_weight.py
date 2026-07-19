"""Garmin weight ingestion (clean retry of the reverted July 19 attempt).

Parses the weight-service range payload into per-day kilograms and applies
them to daily_metrics.weight_kg + athlete_profile.weight_kg (newest weigh-in
wins — weight drives every W/kg surface: crew leaderboards, power profile,
climb pacing, race debrief).

Pure parsing + one best-effort apply function; the sync calls it AFTER the
daily-metrics loop so a weight-service failure can never break the sync.
The NULL-id flush hazard that sank the first attempt is gone (DailyMetric.id
now carries explicit autoincrement).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.athlete_profile import AthleteProfile
from app.models.daily_metric import DailyMetric

logger = logging.getLogger(__name__)


def parse_weigh_ins(payload: dict | None) -> dict[date, float]:
    """weight-service range payload → {calendar_date: kg} (last weigh-in of a
    day wins). Grams in `weight`; entries without a parsable date/weight are
    skipped. Returns {} for any unexpected shape — never raises."""
    out: dict[date, float] = {}
    if not isinstance(payload, dict):
        return out
    summaries = payload.get("dailyWeightSummaries")
    if not isinstance(summaries, list):
        return out
    for day in summaries:
        if not isinstance(day, dict):
            continue
        d_str = day.get("summaryDate")
        try:
            d = date.fromisoformat(str(d_str))
        except (ValueError, TypeError):
            continue
        # Prefer the latest metadata entry; fall back to allWeightMetrics.
        candidates = day.get("allWeightMetrics")
        if not isinstance(candidates, list) or not candidates:
            latest = day.get("latestWeight")
            candidates = [latest] if isinstance(latest, dict) else []
        grams = None
        for m in candidates:
            if isinstance(m, dict) and isinstance(m.get("weight"), (int, float)):
                grams = float(m["weight"])  # last one wins (chronological)
        if grams is not None and 20_000 <= grams <= 300_000:  # 20–300 kg sanity
            out[d] = round(grams / 1000.0, 1)
    return out


async def apply_weigh_ins(
    db: AsyncSession, user_id: int, by_day: dict[date, float]
) -> int:
    """Write kg onto existing daily_metrics rows (non-null overwrites allowed —
    a later weigh-in supersedes) and point the profile at the newest reading.
    Commits. Returns rows updated. Best-effort by contract — never raises."""
    if not by_day:
        return 0
    try:
        updated = 0
        for d, kg in by_day.items():
            row = (
                await db.execute(
                    select(DailyMetric).where(
                        DailyMetric.user_id == user_id, DailyMetric.date == d
                    )
                )
            ).scalar_one_or_none()
            if row is None:
                # No metrics row for that day — create a minimal one so the
                # weigh-in isn't lost (mirrors upsert_daily_metric's insert).
                row = DailyMetric(
                    user_id=user_id, date=d,
                    recorded_at=datetime.now(timezone.utc), source="garmin",
                )
                db.add(row)
            if row.weight_kg != kg:
                row.weight_kg = kg
                updated += 1

        newest_day = max(by_day)
        profile = (
            await db.execute(
                select(AthleteProfile).where(AthleteProfile.user_id == user_id)
            )
        ).scalar_one_or_none()
        if profile is not None and profile.weight_kg != by_day[newest_day]:
            logger.info(
                "profile weight_kg %s -> %s (weigh-in %s, user_id=%s)",
                profile.weight_kg, by_day[newest_day], newest_day, user_id,
            )
            profile.weight_kg = by_day[newest_day]

        await db.commit()
        return updated
    except Exception:  # noqa: BLE001 — weight must never break a sync
        logger.exception("weight apply failed (user_id=%s) — non-fatal", user_id)
        await db.rollback()
        return 0
