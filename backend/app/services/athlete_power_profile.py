"""Athlete-level Critical Power from a cross-ride power-duration profile.

A single ride rarely contains maximal efforts at every duration, so per-ride CP
fits are noisy and usually understate true CP. The athlete's *power profile* is
the envelope of their best efforts: the highest power held for each duration
across all rides in a rolling window. Fitting CP to that aggregate envelope is
the standard way to estimate true CP / W′ / eFTP (the approach behind WKO5's
mFTP and intervals.icu's eFTP).

This module provides the pure aggregation + fit; `compute_athlete_power_profile`
(below) loads the per-ride MMP curves from `activity_streams` and applies them.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_stream import ActivityStream
from app.services.critical_power import CriticalPowerFit, fit_critical_power


def aggregate_mmp_curves(
    curves: list[dict[int | str, float]],
) -> dict[int, float]:
    """Envelope of best power at each duration across rides.

    Tolerates string duration keys (the stored JSON uses them).
    """
    best: dict[int, float] = {}
    for curve in curves:
        if not curve:
            continue
        for dur, watts in curve.items():
            if watts is None:
                continue
            d = int(dur)
            w = float(watts)
            if d not in best or w > best[d]:
                best[d] = w
    return best


def fit_athlete_cp(curves: list[dict[int | str, float]]) -> CriticalPowerFit | None:
    """Aggregate per-ride MMP curves into an envelope, then fit CP / W′ / eFTP."""
    return fit_critical_power(aggregate_mmp_curves(curves))


async def compute_athlete_power_profile(
    db: AsyncSession, user_id: int
) -> dict | None:
    """Athlete CP from all stored ride MMP curves. None when too sparse to fit.

    Returns {"cp_watts", "w_prime_j", "eftp_watts", "n_rides", "r_squared"}.
    """
    res = await db.execute(
        select(ActivityStream.mmp_curve).where(
            ActivityStream.user_id == user_id,
            ActivityStream.mmp_curve.isnot(None),
        )
    )
    curves = [row[0] for row in res.all() if row[0]]
    if not curves:
        return None
    envelope = aggregate_mmp_curves(curves)
    fit = fit_critical_power(envelope)
    if fit is None:
        return None
    return {
        "cp_watts": fit.cp_watts,
        "w_prime_j": fit.w_prime_j,
        "eftp_watts": fit.eftp_watts,
        "n_rides": len(curves),
        "r_squared": fit.r_squared,
        # Power-duration envelope (best W at each duration across rides), sorted
        # by duration — the data for a power-duration curve in the UI.
        "mmp_curve": {d: envelope[d] for d in sorted(envelope)},
    }
