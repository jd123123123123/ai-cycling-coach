"""Athlete-level Critical Power from a cross-ride power-duration profile.

A single ride rarely contains maximal efforts at every duration, so per-ride CP
fits are noisy and usually understate true CP. The athlete's *power profile* is
the envelope of their best efforts: the highest power held for each duration
across all rides in a rolling window. Fitting CP to that aggregate envelope is
the standard way to estimate true CP / W′ / eFTP (the approach behind WKO5's
mFTP and intervals.icu's eFTP).

SANITIZATION (usability audit P0-1): a raw max-envelope means one corrupt ride
wins forever (a 359 W "20-min best" against an all-time PR of 242 W poisoned CP
by +120 W). `build_sanitized_envelope` therefore rejects, per duration, any
per-ride best exceeding the rest-of-data PR by more than 5% unless at least two
rides corroborate it (within 5%), applies a MAD outlier filter when the sample
is rich enough, and enforces a physically non-increasing envelope. Every CP fit
in the app must run on the sanitized envelope, never the raw one.

This module also owns the CANONICAL THRESHOLD reconciliation: exactly one
display number (`threshold_watts`) app-wide — the manual FTP when set, else the
sanitized model eFTP — plus `model_valid` (CP/W′ display is suppressed when the
model disagrees with a manual FTP by more than 10%).
"""
from __future__ import annotations

from collections import defaultdict
from statistics import median
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_stream import ActivityStream
from app.services.critical_power import CriticalPowerFit, fit_critical_power

# A per-ride best may exceed the PR set by the rest of the data by at most this
# fraction, unless a second ride corroborates it (within the same fraction).
PEAK_OVER_PR_TOLERANCE = 0.05
# Robust outlier gate: drop points > median + 4·MAD when the sample is rich.
MAD_MULTIPLIER = 4.0
MAD_MIN_N = 6
# Manual FTP vs model eFTP: beyond this relative disagreement the model display
# (CP / W′) is suppressed (`model_valid = False`).
FTP_MODEL_AGREEMENT_TOLERANCE = 0.10
# Rides needed before the model confidence saturates.
_CONFIDENCE_FULL_N_RIDES = 12


def aggregate_mmp_curves(
    curves: list[dict[int | str, float]],
) -> dict[int, float]:
    """RAW envelope of best power at each duration across rides (no outlier
    rejection — prefer :func:`build_sanitized_envelope` for anything that feeds
    a CP fit or a displayed curve).

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


def reject_uncorroborated_peaks(
    values: list[float], tolerance: float = PEAK_OVER_PR_TOLERANCE
) -> list[float]:
    """Drop top values that exceed the rest-of-data PR by more than `tolerance`
    without a second value corroborating them (within `tolerance` of the top).

    Returns the surviving values, descending. A single value is always kept
    (there is no PR to judge it against). Genuine breakthroughs confirmed by a
    second effort survive; a lone corrupt spike does not.
    """
    vals = sorted((float(v) for v in values if v is not None), reverse=True)
    while len(vals) >= 2:
        top = vals[0]
        corroborated = sum(1 for v in vals if v >= (1.0 - tolerance) * top) >= 2
        if corroborated or top <= (1.0 + tolerance) * vals[1]:
            break
        vals.pop(0)
    return vals


def _mad_filter(vals: list[float]) -> list[float]:
    """Drop values > median + 4·MAD (only when n ≥ MAD_MIN_N). The cutoff has a
    5%-of-median floor so identical values (MAD = 0) don't over-reject."""
    if len(vals) < MAD_MIN_N:
        return vals
    med = median(vals)
    mad = median([abs(v - med) for v in vals])
    cutoff = med + max(MAD_MULTIPLIER * mad, PEAK_OVER_PR_TOLERANCE * med)
    return [v for v in vals if v <= cutoff]


def build_sanitized_envelope(
    curves: list[dict[int | str, float]],
) -> dict[int, float]:
    """Outlier-rejected best-effort envelope across per-ride MMP curves.

    Per duration: MAD filter (when n ≥ 6), then the 5%-over-PR + 2-ride
    corroboration rule; finally the envelope is clamped non-increasing across
    durations (a longer effort can never exceed a shorter one).

    Callers must pass CYCLING curves only — the stored ``mmp_curve`` column is
    the ingest-time cycling marker (runs and guarded corrupt rides store None).
    """
    by_duration: dict[int, list[float]] = defaultdict(list)
    for curve in curves:
        if not curve:
            continue
        for dur, watts in curve.items():
            if watts is None:
                continue
            by_duration[int(dur)].append(float(watts))

    envelope: dict[int, float] = {}
    for d, vals in by_duration.items():
        vals = _mad_filter(vals)
        vals = reject_uncorroborated_peaks(vals)
        if vals:
            envelope[d] = max(vals)

    # Non-increasing across durations: after per-duration filtering the curve
    # can locally invert; clamp conservatively (never inflate a longer point).
    out: dict[int, float] = {}
    prev: float | None = None
    for d in sorted(envelope):
        v = envelope[d]
        if prev is not None and v > prev:
            v = prev
        out[d] = v
        prev = v
    return out


def fit_athlete_cp(curves: list[dict[int | str, float]]) -> CriticalPowerFit | None:
    """Sanitize per-ride MMP curves into an envelope, then fit CP / W′ / eFTP."""
    return fit_critical_power(build_sanitized_envelope(curves))


#: What an exact-by-construction fit is allowed to claim. A two-point CP fit
#: has r² == 1.0 by arithmetic, so multiplying by r² used to award it FULL
#: marks — the least identifiable fit scoring highest. It still returns a
#: number; it may no longer call that number confident.
_UNIDENTIFIABLE_CONFIDENCE_CAP = 0.35


def model_confidence(
    n_rides: int, r_squared: float | None, identifiable: bool = True
) -> float:
    """0–1 confidence in the modeled threshold: fit quality × data richness.

    `identifiable` is False when the CP fit ran on two in-band points. r² is
    then 1.0 for reasons that have nothing to do with the data being good, so
    the score is capped rather than believed.
    """
    n_factor = min(1.0, max(0, n_rides) / float(_CONFIDENCE_FULL_N_RIDES))
    r2 = max(0.0, min(1.0, r_squared if r_squared is not None else 0.0))
    conf = n_factor * r2
    if not identifiable:
        conf = min(conf, _UNIDENTIFIABLE_CONFIDENCE_CAP)
    return round(conf, 2)


def reconcile_threshold(
    ftp_watts: float | int | None, eftp_watts: float | None
) -> dict[str, Any]:
    """THE canonical display threshold (audit P0-1: one number app-wide).

    Manual FTP wins when set (`threshold_source = "manual"`); otherwise the
    sanitized model eFTP (`"model"`). `model_valid` is False when a manual FTP
    exists and the model disagrees with it by more than 10% — the UI then hides
    CP/W′ ("Model details") entirely.
    """
    ftp = float(ftp_watts) if ftp_watts else None
    eftp = float(eftp_watts) if eftp_watts else None
    if ftp and ftp > 0:
        divergence = (eftp - ftp) / ftp if eftp is not None else None
        model_valid = (
            divergence is not None
            and abs(divergence) <= FTP_MODEL_AGREEMENT_TOLERANCE
        )
        return {
            "threshold_watts": round(ftp),
            "threshold_source": "manual",
            "model_valid": model_valid,
            # ── THE DISAGREEMENT IS A FINDING, NOT A NUISANCE ──────────────
            # `model_valid=False` was consumed as "hide CP/W′". Consider what
            # that meant: the model had been fitted to the athlete's OWN maximal
            # efforts and concluded their threshold was 20% away from a number
            # they typed months ago — while every TSS, every zone, every CTL
            # value and every prescribed interval is scaled by that typed
            # number. The system detected the error in its own input and
            # responded by hiding the evidence of it.
            #
            # A large, persistent CP-vs-FTP divergence is the single most
            # valuable diagnostic this system produces about itself. These
            # fields say so out loud; `model_valid` is kept only so existing
            # callers do not change behaviour underneath this release.
            "divergence_pct": round(divergence * 100.0, 1) if divergence is not None else None,
            "load_model_warning": bool(divergence is not None and abs(divergence) > FTP_MODEL_AGREEMENT_TOLERANCE),
            "suggested_threshold_watts": round(eftp) if eftp is not None else None,
        }
    if eftp and eftp > 0:
        return {
            "threshold_watts": round(eftp),
            "threshold_source": "model",
            "model_valid": True,
        }
    return {"threshold_watts": None, "threshold_source": None, "model_valid": False}


async def compute_athlete_power_profile(
    db: AsyncSession, user_id: int, profile: Any | None = None
) -> dict | None:
    """Athlete CP from all stored ride MMP curves (sanitized). None when too
    sparse to fit.

    `profile` (optional, an AthleteProfile or anything with `.ftp_watts`)
    enables the canonical-threshold fields: without it `threshold_watts` falls
    back to the model eFTP. Returns {"cp_watts", "w_prime_j", "eftp_watts",
    "n_rides", "r_squared", "mmp_curve", "threshold_watts", "threshold_source",
    "model_valid", "confidence"}.

    The ``mmp_curve IS NOT NULL`` filter is the ingest-time cycling marker —
    runs (and corrupt rides caught by the ingest guard) store None, so their
    power never enters the cycling model.
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
    envelope = build_sanitized_envelope(curves)
    fit = fit_critical_power(envelope)
    if fit is None:
        return None
    ftp = getattr(profile, "ftp_watts", None) if profile is not None else None
    reconciled = reconcile_threshold(ftp, fit.eftp_watts)
    return {
        "cp_watts": fit.cp_watts,
        "w_prime_j": fit.w_prime_j,
        "eftp_watts": fit.eftp_watts,
        "n_rides": len(curves),
        "r_squared": fit.r_squared,
        "confidence": model_confidence(len(curves), fit.r_squared),
        **reconciled,
        # Power-duration envelope (sanitized best W at each duration across
        # rides), sorted by duration — the data for a power-duration curve UI.
        "mmp_curve": {d: envelope[d] for d in sorted(envelope)},
    }
