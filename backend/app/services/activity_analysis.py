"""Ride-analysis orchestrator — turn a power/HR stream into the science bundle.

This is the single keystone that composes the pure Phase 0–2 services into one
result for a ride:

    calculate_np (training_load)  → Normalized Power, IF, VI
    mmp_curve   (power_curve)     → mean-maximal power curve
    fit_critical_power            → CP / W′ / eFTP
    w_balance_summary             → intra-ride W′ depletion (only when W′ > 0)
    durability_drop / decoupling  → fatigue resistance

Both the `.FIT`/TCX upload path and the Garmin ingestion path call this; it is
pure (no DB, no Garmin) so it is fully unit-testable, and every component
degrades to None when its inputs are missing or insufficient.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.services.critical_power import CriticalPowerFit, fit_critical_power
from app.services.durability import (
    DurabilityResult,
    aerobic_decoupling,
    durability_drop,
)
from app.services.power_curve import mmp_curve
from app.services.training_load import calculate_np
from app.services.w_balance import WBalanceResult, w_balance_summary

# Default durability probe: best 5-min power after 1500 kJ of work (a long-ride
# fatigue marker). Tunable by the caller.
DEFAULT_DURABILITY_KJ = 1500
DEFAULT_DURABILITY_WINDOW_S = 300

# ── Ingest guard (audit P0-1): stop corrupt power at the source ──────────────
# No human produces > 2500 W instantaneous; clamp spikes before analysis.
MAX_INSTANT_POWER_W = 2500.0
# A 20-min MMP beyond 5 W/kg (or 500 W when weight is unknown) is a corrupt
# file, not a performance — the ride's power MODEL is dropped (raw streams are
# still stored), exactly like runs, so it can never poison the athlete model.
SANITY_MMP_DURATION_S = 1200
SANITY_WKG_BOUND = 5.0
SANITY_ABS_BOUND_W = 500.0


@dataclass(frozen=True)
class RideAnalysis:
    duration_s: int
    avg_power: float
    np_watts: float
    if_: float | None                 # NP / FTP (None when FTP unknown)
    vi: float | None                  # NP / avg power (None when avg is 0)
    total_kj: float
    mmp_curve: dict[int, float] = field(default_factory=dict)
    cp: CriticalPowerFit | None = None
    w_bal: WBalanceResult | None = None
    durability: DurabilityResult | None = None
    decoupling_pct: float | None = None
    # False when the ingest guard judged the power data corrupt: the power
    # model (mmp/cp/eftp) must then be persisted as None, like runs.
    power_model_valid: bool = True


def analyze_streams(
    power_series: list[float],
    hr_series: list[float] | None = None,
    ftp: float | None = None,
    durability_threshold_kj: int = DEFAULT_DURABILITY_KJ,
    durability_window_s: int = DEFAULT_DURABILITY_WINDOW_S,
    weight_kg: float | None = None,
) -> RideAnalysis:
    """Compose every stream-derived metric for one ride.

    `weight_kg` (optional) tightens the corrupt-power guard to 5 W/kg for the
    20-min MMP; without it an absolute 500 W bound applies.
    """
    n = len(power_series)
    if n == 0:
        return RideAnalysis(
            duration_s=0, avg_power=0.0, np_watts=0.0, if_=None, vi=None, total_kj=0.0
        )

    # Clamp physically impossible instantaneous samples (sensor glitches).
    power_series = [min(max(float(p), 0.0), MAX_INSTANT_POWER_W) for p in power_series]

    avg_power = sum(power_series) / n
    np_watts = calculate_np(power_series)
    if_ = round(np_watts / ftp, 3) if ftp and ftp > 0 else None
    vi = round(np_watts / avg_power, 3) if avg_power > 0 else None
    total_kj = sum(power_series) / 1000.0
    curve = mmp_curve(power_series)

    # Sustained-power sanity: a 20-min MMP beyond the human envelope means the
    # file is corrupt → drop the power model entirely (streams stay stored).
    power_model_valid = True
    p20 = curve.get(SANITY_MMP_DURATION_S)
    bound = (
        SANITY_WKG_BOUND * weight_kg
        if weight_kg and weight_kg > 0
        else SANITY_ABS_BOUND_W
    )
    if p20 is not None and p20 > bound:
        power_model_valid = False
        curve = {}

    cp = fit_critical_power(curve) if power_model_valid else None
    # W′-balance only makes sense with a positive anaerobic capacity; a flat
    # ride fits W′ ≈ 0 and the reconstitution term would divide by zero.
    w_bal = (
        w_balance_summary(power_series, cp.cp_watts, cp.w_prime_j)
        if cp is not None and cp.w_prime_j > 0
        else None
    )

    durability = durability_drop(power_series, durability_window_s, durability_threshold_kj)
    decoupling = (
        aerobic_decoupling(power_series, hr_series)
        if hr_series is not None
        else None
    )

    return RideAnalysis(
        duration_s=n,
        avg_power=round(avg_power, 1),
        np_watts=round(np_watts, 1),
        if_=if_,
        vi=vi,
        total_kj=round(total_kj, 1),
        mmp_curve=curve,
        cp=cp,
        w_bal=w_bal,
        durability=durability,
        decoupling_pct=decoupling,
        power_model_valid=power_model_valid,
    )
