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

# Always-persisted core channels; optional channels are stored only when they
# carry at least one real reading (keeps blobs small for rides without them).
_CORE_CHANNELS = ("power", "heart_rate", "cadence", "altitude")
# Must stay in sync with `_CARRY_CHANNELS` in stream_extraction.py: this is
# exactly that set minus the core carried channels (heart_rate/cadence/altitude).
_OPTIONAL_CHANNELS = (
    "latitude", "longitude", "speed", "grade_adjusted_speed", "vertical_speed",
    "distance", "temperature",
    # Cycling dynamics
    "right_balance", "torque_effectiveness", "pedal_smoothness",
    "pco_left", "pco_right",
    "power_phase_left_start", "power_phase_left_end",
    "power_phase_right_start", "power_phase_right_end",
    "stamina", "stamina_potential", "performance_condition",
    # Running dynamics
    "vertical_oscillation", "ground_contact_time", "ground_contact_balance",
    "vertical_ratio", "stride_length",
)


def build_streams_blob(streams: ActivityStreams) -> dict:
    """Serialize an ActivityStreams to the stored JSON blob (drop empty channels)."""
    blob: dict = {c: getattr(streams, c) for c in _CORE_CHANNELS}
    for c in _OPTIONAL_CHANNELS:
        series = getattr(streams, c)
        if any(v is not None for v in series):
            blob[c] = series
    return blob


def has_gps(streams: ActivityStreams) -> bool:
    return any(v is not None for v in streams.latitude) and any(
        v is not None for v in streams.longitude
    )


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
    weather: dict | None = None,
    commit: bool = True,
    store_power_model: bool = True,
) -> RideAnalysis:
    """Analyze + persist streams for one activity. Returns the analysis bundle.

    Pass ``commit=False`` from inside a larger transaction (e.g. the Garmin sync
    loop, which keeps a single transaction so the RLS ``SET LOCAL`` survives) —
    the row is then flushed, and the caller commits at its own boundary.

    ``store_power_model=False`` (runs) still persists the full stream blob (GPS,
    pace, HR, running dynamics) + decoupling, but nulls the cycling-only power
    model (CP / W′ / eFTP / MMP curve) and skips the NP backfill so a run's
    running-power never pollutes the cycling power-duration / FTP model.
    """
    analysis = analyze_streams(streams.power, hr_series=_hr_for_analysis(streams), ftp=ftp)

    row = await db.get(ActivityStream, activity_id)
    payload = {
        "user_id": user_id,
        "streams": build_streams_blob(streams),
        "weather": weather,
        "has_gps": has_gps(streams),
        "mmp_curve": {str(k): v for k, v in analysis.mmp_curve.items()} if store_power_model else None,
        "normalized_power": analysis.np_watts if store_power_model else None,
        "decoupling_pct": analysis.decoupling_pct,
        "total_kj": analysis.total_kj,
        "cp_watts": (analysis.cp.cp_watts if analysis.cp else None) if store_power_model else None,
        "w_prime_j": (analysis.cp.w_prime_j if analysis.cp else None) if store_power_model else None,
        "eftp_watts": (analysis.cp.eftp_watts if analysis.cp else None) if store_power_model else None,
    }
    if row is None:
        db.add(ActivityStream(activity_id=activity_id, **payload))
    else:
        for k, v in payload.items():
            setattr(row, k, v)

    # Backfill the activity's NP from the true stream-derived value when absent
    # (cycling only — a run's power model must not seed the cycling NP field).
    if store_power_model:
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
