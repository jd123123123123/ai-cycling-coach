"""How wide should the band actually be? Ask the athlete's own past rides.

`uncertainty.py` builds its band from reasoned estimates: CP is uncertain by
about 4%, a default CdA by about 18%, a wind forecast by about 30%. Those are
defensible numbers, but they are still assumptions about assumptions, and the
design doc was explicit that the band width should be "calibrated from measured
backtest error, not guessed".

This is the measurement. Every rehearsal of a ride the athlete actually did
carries an `actual` comparison, so each one is a completed experiment: the band
made a claim, and the recorded time either fell inside it or did not.

Method. For each sample compute

    z = |actual - p50| / halfwidth        where halfwidth = (p90 - p10) / 2

z is the outcome expressed in band-halfwidths. A p10-p90 band claims to cover
80% of outcomes, so if the band were perfectly calibrated the 80th percentile
of z would be exactly 1.0. Whatever that percentile actually is IS the
correction factor: above 1 the band is too narrow, below 1 too wide.

Using a high quantile rather than the mean is deliberate. The band's job is to
contain the bad days, and a mean absolute error is dominated by the ordinary
ones — calibrating on it would produce a band that is right on average and
wrong exactly when it matters.

Refusals:

  * fewer than MIN_SAMPLES completed comparisons -> None. Three rides is not
    a calibration, and pretending otherwise trades a stated assumption for an
    unstated overfit.
  * samples whose band has no width -> skipped; they carry no information
    about width.

None means "keep the reasoned default and say so", which is the same contract
every other honest-gap in this package follows.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.route_rehearsal import RouteRehearsal
from app.services.rehearsal.uncertainty import _MAX_SPREAD_SCALE, _MIN_SPREAD_SCALE

logger = logging.getLogger(__name__)

#: Below this the correction is noise dressed as evidence.
MIN_SAMPLES = 5
#: The coverage a p10-p90 band claims, and therefore the quantile of z that
#: should sit at 1.0 when the band is honest.
_TARGET_QUANTILE = 0.80
#: Newest first, bounded: fitness and equipment drift, and a five-year-old
#: comparison says little about this season's band.
MAX_SAMPLES = 40


@dataclass(frozen=True)
class Calibration:
    """The measured correction, and what it was measured on."""

    spread_scale: float
    samples: int
    #: Fraction of past rides whose recorded time fell inside the band as it
    #: was. This is the number worth showing a human: "our range contained the
    #: outcome 6 times out of 8" needs no explanation of quantiles.
    coverage: float


def _quantile(sorted_values: list[float], q: float) -> float:
    """Linear-interpolated quantile. NumPy is overkill for a list of eight."""
    if not sorted_values:
        return 1.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    pos = q * (len(sorted_values) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(sorted_values) - 1)
    frac = pos - lo
    return sorted_values[lo] * (1 - frac) + sorted_values[hi] * frac


def calibrate_from_samples(samples: list[dict]) -> Calibration | None:
    """Pure core: `[{actual_time_s, p10_s, p50_s, p90_s}, …]` -> correction."""
    zs: list[float] = []
    inside = 0
    counted = 0
    for s in samples:
        actual = s.get("actual_time_s")
        p10, p50, p90 = s.get("p10_s"), s.get("p50_s"), s.get("p90_s")
        if not actual or p10 is None or p50 is None or p90 is None:
            continue
        halfwidth = (p90 - p10) / 2.0
        if halfwidth <= 0:
            # No width, no information about width.
            continue
        counted += 1
        if p10 <= actual <= p90:
            inside += 1
        zs.append(abs(actual - p50) / halfwidth)

    if counted < MIN_SAMPLES:
        return None

    zs.sort()
    # Clamped HERE rather than only at the point of use, so the number stored
    # and shown is the one that will actually be applied. An unclamped 0.0 --
    # which a handful of dead-on predictions genuinely produces -- would
    # otherwise read as "our band has zero width".
    scale = max(
        _MIN_SPREAD_SCALE,
        min(_MAX_SPREAD_SCALE, _quantile(zs, _TARGET_QUANTILE)),
    )
    return Calibration(
        spread_scale=scale,
        samples=counted,
        coverage=inside / counted,
    )


async def calibrate_spread(db: AsyncSession, user_id: int) -> Calibration | None:
    """The athlete's measured band correction, or None if not enough evidence.

    Never raises: a calibration failure must leave the band at its reasoned
    default, not fail the rehearsal that asked for it.
    """
    try:
        res = await db.execute(
            select(RouteRehearsal)
            .where(
                RouteRehearsal.user_id == user_id,
                RouteRehearsal.source_kind == "activity",
            )
            .order_by(RouteRehearsal.created_at.desc())
            .limit(MAX_SAMPLES)
        )
        samples: list[dict] = []
        for row in res.scalars().all():
            result = row.result or {}
            actual = result.get("actual") or {}
            band = result.get("band") or {}
            if not actual or not band:
                continue
            samples.append(
                {
                    "actual_time_s": actual.get("actual_time_s"),
                    "p10_s": band.get("p10_s"),
                    "p50_s": band.get("p50_s"),
                    "p90_s": band.get("p90_s"),
                }
            )
    except Exception:  # pragma: no cover — a rehearsal must survive this
        logger.exception("band calibration failed for user_id=%s", user_id)
        return None

    return calibrate_from_samples(samples)
