"""Persist activity streams + their derived science metrics.

Thin DB wiring on top of the pure `activity_analysis.analyze_streams`:
  1. analyze the 1 Hz streams,
  2. upsert an `activity_streams` row (raw arrays + MMP curve + scalars),
  3. backfill `activities.normalized_power` when it was missing (the legacy
     Garmin summary import left it null on every ride).

The session is assumed RLS-scoped to `user_id` by the caller (dependencies.py).
"""
from __future__ import annotations

import logging

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.services.activity_analysis import RideAnalysis, analyze_streams
from app.services.stream_extraction import ActivityStreams

logger = logging.getLogger(__name__)


def _hr_for_analysis(streams: ActivityStreams) -> list[float] | None:
    """Decoupling needs a clean numeric HR array; skip it if any sample is None."""
    hr = streams.heart_rate
    if hr and all(v is not None for v in hr):
        return [float(v) for v in hr]  # type: ignore[arg-type]
    return None


async def ingest_activity_streams(
    db: AsyncSession,
    *,
    user_id: int,
    activity_id: int,
    streams: ActivityStreams,
    ftp: float | None,
    commit: bool = True,
) -> RideAnalysis:
    """Analyze + persist streams for one activity. Returns the analysis bundle.

    Pass ``commit=False`` from inside a larger transaction (e.g. the Garmin sync
    loop, which keeps a single transaction so the RLS ``SET LOCAL`` survives) —
    the row is then flushed, and the caller commits at its own boundary.
    """
    analysis = analyze_streams(streams.power, hr_series=_hr_for_analysis(streams), ftp=ftp)

    row = await db.get(ActivityStream, activity_id)
    payload = {
        "user_id": user_id,
        "streams": {
            "power": streams.power,
            "heart_rate": streams.heart_rate,
            "cadence": streams.cadence,
            "altitude": streams.altitude,
        },
        "mmp_curve": {str(k): v for k, v in analysis.mmp_curve.items()},
        "normalized_power": analysis.np_watts,
        "decoupling_pct": analysis.decoupling_pct,
        "total_kj": analysis.total_kj,
        "cp_watts": analysis.cp.cp_watts if analysis.cp else None,
        "w_prime_j": analysis.cp.w_prime_j if analysis.cp else None,
        "eftp_watts": analysis.cp.eftp_watts if analysis.cp else None,
    }
    if row is None:
        db.add(ActivityStream(activity_id=activity_id, **payload))
    else:
        for k, v in payload.items():
            setattr(row, k, v)

    # Backfill the activity's NP from the true stream-derived value when absent.
    await db.execute(
        update(Activity)
        .where(Activity.id == activity_id, Activity.normalized_power.is_(None))
        .values(normalized_power=analysis.np_watts)
    )
    if commit:
        await db.commit()
    else:
        await db.flush()
    logger.info(
        "Ingested streams for activity %s: NP=%.0f, CP=%s, kJ=%.0f",
        activity_id, analysis.np_watts,
        analysis.cp.cp_watts if analysis.cp else "n/a", analysis.total_kj,
    )
    return analysis


async def latest_critical_power(db: AsyncSession, user_id: int) -> dict | None:
    """Most recent stored CP/W′/eFTP for the athlete, or None if no ride has a fit.

    Used to supplement the stored FTP and to seed W′-balance prescription.
    """
    stmt = (
        select(ActivityStream.cp_watts, ActivityStream.w_prime_j, ActivityStream.eftp_watts)
        .where(ActivityStream.user_id == user_id, ActivityStream.cp_watts.isnot(None))
        .order_by(ActivityStream.created_at.desc())
        .limit(1)
    )
    res = await db.execute(stmt)
    row = res.first()
    if row is None:
        return None
    return {"cp_watts": row[0], "w_prime_j": row[1], "eftp_watts": row[2]}
