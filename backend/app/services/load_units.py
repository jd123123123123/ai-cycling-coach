"""The unit TSS is measured in — and how to put a season on one scale.

THE PROBLEM (audit §7.2). TSS is defined relative to a threshold:

    TSS = duration_s × NP² / (FTP² × 3600) × 100

so a TSS figure means nothing without knowing which FTP produced it. This app
computed TSS at ingestion using whatever FTP was set that day, stored the
number, and never recorded the threshold. `recompute_missing_tss` only ever
touched NULL rows, so past load kept the units it was scored in.

CTL is a 42-day exponential average of those numbers. Across a season in which
an athlete improved 10%, "CTL 85" in March and "CTL 85" in August are not the
same training — the second is roughly 20% more work, because the same watts
score lower against a higher threshold. Every longitudinal claim the product
makes — progression charts, season trends, fitness comparisons — rested on an
unstated change of units.

WHAT THIS MODULE DOES. It makes the unit explicit and correctable:

  * `derive_scoring_ftp` RECOVERS the threshold a stored TSS was computed
    against. This is not an estimate — inverting the formula returns the exact
    value used, so the history is not lost, merely unlabelled.
  * `rebase_tss` converts a TSS from one threshold to another.
  * `threshold_drift` reports how far the unit moved across a window, so a
    longitudinal statement can be qualified instead of quietly wrong.

WHAT IT DELIBERATELY DOES NOT DO: silently re-base everybody's CTL. As-scored
is the physiologically correct dose — a ride at 250 W when the athlete's
threshold was 250 W *was* threshold work, and rescoring it later against a
higher FTP would misrepresent the stress that ride imposed. Re-basing is what
you want for COMPARING across time, which is an analysis, not the load model.
So the default stays as-scored, the unit is now recorded, and any comparison
can put the series on one scale on purpose.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

#: A recovered threshold outside this band is not a threshold — it is a sign
#: the TSS came from somewhere other than the power formula (an hrTSS fallback,
#: a manual entry, a corrupt file). Recovery returns None rather than writing a
#: number that would silently corrupt every re-basing that followed.
FTP_PLAUSIBLE_MIN_W = 50.0
FTP_PLAUSIBLE_MAX_W = 600.0


def derive_scoring_ftp(
    tss: float | None,
    normalized_power: float | None,
    duration_seconds: float | None,
) -> float | None:
    """Recover the FTP a stored power-based TSS was computed against.

    From `TSS = dur × NP² / (FTP² × 3600) × 100`:

        FTP = NP × sqrt(dur / (36 × TSS))

    EXACT, not estimated: this inverts the very arithmetic that produced the
    stored number, so for any ride scored through the power path it returns the
    threshold that was actually used, up to float rounding.

    Returns None when the inputs cannot have produced a power-based TSS, or when
    the result is outside the plausible band — an hrTSS ride has no FTP behind
    its number, and inventing one would corrupt every later re-basing.
    """
    if not tss or not normalized_power or not duration_seconds:
        return None
    if tss <= 0 or normalized_power <= 0 or duration_seconds <= 0:
        return None
    ftp = normalized_power * math.sqrt(duration_seconds / (36.0 * tss))
    if not math.isfinite(ftp):
        return None
    if ftp < FTP_PLAUSIBLE_MIN_W or ftp > FTP_PLAUSIBLE_MAX_W:
        return None
    return round(ftp, 1)


def rebase_tss(
    tss: float | None,
    ftp_at_scoring: float | None,
    ftp_target: float | None,
) -> float | None:
    """Express a TSS in the units of a different threshold.

    TSS scales with 1/FTP², so re-basing needs only the ratio — the ride's power
    stream is not required:

        TSS_target = TSS_scored × (FTP_scored / FTP_target)²

    Returns the TSS unchanged when either threshold is unknown: an unlabelled
    number left alone is honest, and one converted using a guessed unit is not.
    """
    if tss is None:
        return None
    if not ftp_at_scoring or not ftp_target or ftp_at_scoring <= 0 or ftp_target <= 0:
        return tss
    return tss * (ftp_at_scoring / ftp_target) ** 2


@dataclass(frozen=True)
class ThresholdDrift:
    """How much the unit moved across a window."""

    min_ftp: float | None
    max_ftp: float | None
    #: (max − min) / min, as a percentage. None when fewer than two thresholds
    #: are known.
    spread_pct: float | None
    #: How many of the window's activities carry a known scoring threshold.
    labelled: int
    #: How many do not — their units are unrecoverable (hrTSS and friends).
    unlabelled: int

    @property
    def comparable(self) -> bool:
        """True when a longitudinal claim over this window is safe to make
        without re-basing. 2% is a deliberately tight bar: below it the unit
        drift is smaller than the noise in TSS itself."""
        return self.spread_pct is not None and self.spread_pct <= 2.0


def threshold_drift(scoring_ftps: list[float | None]) -> ThresholdDrift:
    """Summarise the units a window of activities was scored in.

    The point is not the number; it is that a season chart drawn across a 12%
    drift is comparing two different measurements, and until now nothing could
    say so.
    """
    known = [f for f in scoring_ftps if f is not None and f > 0]
    unlabelled = len(scoring_ftps) - len(known)
    if not known:
        return ThresholdDrift(None, None, None, 0, unlabelled)
    lo, hi = min(known), max(known)
    spread = None if len(known) < 2 or lo <= 0 else round((hi - lo) / lo * 100.0, 2)
    return ThresholdDrift(lo, hi, spread, len(known), unlabelled)
