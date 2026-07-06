"""WKO-style power-duration model: the hero-bar quantities on top of the CP fit.

Builds on critical_power.fit_critical_power (2-parameter CP/W′ model) and the
raw MMP curve. Reports:
  - mFTP  — modeled FTP (the CP model's eFTP = CP + W′/3600).
  - CP / W′ / FRC — asymptotic power, anaerobic work capacity (FRC ≡ W′).
  - Pmax  — best power at ≤5 s (neuromuscular ceiling).
  - TTE   — empirical time-to-exhaustion near FTP: the longest MMP duration the
            athlete actually held at or above mFTP.
  - VO₂max estimate — from 5-min power and body mass, an ACSM-style
            approximation (labeled estimate, NOT a lab measurement).

Pure module. All quantities beyond CP/W′ are modeled estimates.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.critical_power import fit_critical_power

_PMAX_MAX_DURATION_S = 5
_VO2_5MIN_DURATION_S = 300


@dataclass(frozen=True)
class WkoPowerModel:
    mftp_watts: float
    cp_watts: float
    w_prime_j: float
    frc_j: float
    pmax_watts: float
    tte_s: int | None
    vo2max_estimate: float | None
    r_squared: float


def _pmax(mmp: dict[int, float]) -> float:
    short = [p for t, p in mmp.items() if t <= _PMAX_MAX_DURATION_S and p is not None]
    if short:
        return round(max(short), 1)
    # No sub-5s point → fall back to the highest power at the shortest duration.
    shortest_t = min(mmp)
    return round(mmp[shortest_t], 1)


def _tte(mmp: dict[int, float], mftp: float) -> int | None:
    at_or_above = [t for t, p in mmp.items() if p is not None and p >= mftp]
    return max(at_or_above) if at_or_above else None


def _vo2max(mmp: dict[int, float], mass_kg: float | None) -> float | None:
    # ACSM-style: VO2 (ml/kg/min) ≈ 10.8 · W / kg + 7, applied to 5-min max power
    # as a VO2max proxy. Requires a ~5-min effort and body mass.
    if not mass_kg or mass_kg <= 0:
        return None
    p5 = mmp.get(_VO2_5MIN_DURATION_S)
    if p5 is None:
        # nearest duration within 60 s of 5 min, if present
        near = [(abs(t - _VO2_5MIN_DURATION_S), p) for t, p in mmp.items()
                if p is not None and abs(t - _VO2_5MIN_DURATION_S) <= 60]
        if not near:
            return None
        p5 = min(near, key=lambda x: x[0])[1]
    return round(10.8 * p5 / mass_kg + 7.0, 1)


def fit_wko_model(mmp: dict[int, float], mass_kg: float | None = None) -> WkoPowerModel | None:
    """Fit the WKO-style hero-bar quantities. None when CP is under-determined."""
    cp_fit = fit_critical_power(mmp)
    if cp_fit is None:
        return None
    mftp = cp_fit.eftp_watts
    return WkoPowerModel(
        mftp_watts=mftp,
        cp_watts=cp_fit.cp_watts,
        w_prime_j=cp_fit.w_prime_j,
        frc_j=cp_fit.w_prime_j,
        pmax_watts=_pmax(mmp),
        tte_s=_tte(mmp, mftp),
        vo2max_estimate=_vo2max(mmp, mass_kg),
        r_squared=cp_fit.r_squared,
    )
