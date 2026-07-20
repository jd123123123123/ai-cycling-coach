"""Detailed athlete power profile — dense power-duration curve + W/kg + peaks.

Recomputes a rich power profile from the *stored* per-ride power streams (no
Garmin refetch): a dense mean-maximal-power envelope across all rides, the CP/W′
fit, peak powers at canonical durations, and watts-per-kilogram when body weight
is known. This is the data behind the richer Critical Power UI.

The pure `build_power_profile` takes a list of power arrays; the async
`compute_detailed_power_profile` (below) loads the stored streams and athlete
weight, then layers in durability + decoupling from the stored ride metrics.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.athlete_profile import AthleteProfile
from app.services.athlete_power_profile import (
    build_sanitized_envelope,
    model_confidence,
    reconcile_threshold,
)
from app.services.critical_power import fit_critical_power
from app.services.durability import aerobic_decoupling, durability_drop
from app.services.w_balance import w_balance_summary
from app.services.power_curve import DEFAULT_DURATIONS_S, mmp_curve
from app.services.power_phenotype import power_phenotype

# Durations highlighted as headline "peak power" numbers in the UI.
PEAK_DURATIONS = (5, 15, 30, 60, 300, 600, 1200, 3600)


def build_power_profile(
    power_arrays: list[list[float]],
    weight_kg: float | None,
    ftp_watts: float | None = None,
    lang: str = "en",
) -> dict | None:
    """Dense power profile from a set of ride power streams. None if no data.

    Callers must pass CYCLING power arrays only. The envelope, chart curve and
    peaks are all sanitized (5%-over-PR + corroboration, MAD, monotonic) so a
    single corrupt ride cannot render an impossible point or poison the CP fit.
    `ftp_watts` (the manual FTP, when set) enables the canonical threshold
    reconciliation fields. `lang` ('de'|'en') localizes the athlete-facing
    phenotype prose (P1-6: no English sentence in a German UI).
    """
    arrays = [p for p in power_arrays if p]
    if not arrays:
        return None

    # Dense per-ride MMP curves → SANITIZED best-effort envelope across rides.
    per_ride = [mmp_curve(p, DEFAULT_DURATIONS_S) for p in arrays]
    envelope = build_sanitized_envelope(per_ride)
    if not envelope:
        return None

    fit = fit_critical_power(envelope)
    curve = {d: round(envelope[d], 1) for d in sorted(envelope)}
    peaks = {str(d): round(envelope[d], 1) for d in PEAK_DURATIONS if d in envelope}

    wkg_curve = None
    cp_wkg = None
    peaks_wkg = None
    if weight_kg and weight_kg > 0:
        wkg_curve = {str(d): round(w / weight_kg, 2) for d, w in curve.items()}
        peaks_wkg = {k: round(v / weight_kg, 2) for k, v in peaks.items()}
        if fit is not None:
            cp_wkg = round(fit.cp_watts / weight_kg, 2)

    reconciled = reconcile_threshold(ftp_watts, fit.eftp_watts if fit else None)
    return {
        "cp_watts": fit.cp_watts if fit else None,
        "w_prime_j": fit.w_prime_j if fit else None,
        "eftp_watts": fit.eftp_watts if fit else None,
        "r_squared": fit.r_squared if fit else None,
        "cp_wkg": cp_wkg,
        "n_rides": len(arrays),
        "confidence": model_confidence(len(arrays), fit.r_squared if fit else None),
        **reconciled,
        "mmp_curve": curve,
        "wkg_curve": wkg_curve,
        "peaks": peaks,
        "peaks_wkg": peaks_wkg,
        "phenotype": power_phenotype(fit.cp_watts, peaks, lang=lang) if fit else None,
    }


async def compute_detailed_power_profile(
    db: AsyncSession, user_id: int, lang: str = "en"
) -> dict | None:
    """Full power profile from stored streams + durability/decoupling metrics.

    CYCLING only: `mmp_curve IS NOT NULL` is the ingest-time cycling marker
    (runs — and corrupt rides caught by the ingest guard — store None), so raw
    run power streams never leak into the cycling power-duration model.
    """
    res = await db.execute(
        select(
            ActivityStream.activity_id,
            ActivityStream.streams,
            ActivityStream.decoupling_pct,
            ActivityStream.total_kj,
            ActivityStream.normalized_power,
            ActivityStream.cp_watts,
            ActivityStream.w_prime_j,
        ).where(
            ActivityStream.user_id == user_id,
            ActivityStream.mmp_curve.isnot(None),
        )
    )
    rows = res.all()
    if not rows:
        return None

    power_arrays = [(r.streams or {}).get("power") or [] for r in rows]

    prof_res = await db.execute(
        select(AthleteProfile.weight_kg, AthleteProfile.ftp_watts).where(
            AthleteProfile.user_id == user_id
        )
    )
    prof_row = prof_res.first()
    weight = prof_row.weight_kg if prof_row else None
    ftp = prof_row.ftp_watts if prof_row else None

    profile = build_power_profile(
        power_arrays,
        float(weight) if weight else None,
        ftp_watts=float(ftp) if ftp else None,
        lang=lang,
    )
    if profile is None:
        return None

    # Durability: best (smallest) and average power drop after 1500 kJ across the
    # rides long enough to probe it. Decoupling: average of stored per-ride values.
    drops: list[float] = []
    per_ride_durability: dict[int, float] = {}
    for r in rows:
        power = (r.streams or {}).get("power") or []
        d = durability_drop(power, window_s=300, threshold_kj=1500)
        if d is not None:
            drops.append(d.drop_pct)
            per_ride_durability[r.activity_id] = d.drop_pct
    decouples = [r.decoupling_pct for r in rows if r.decoupling_pct is not None]
    total_kj = sum(r.total_kj for r in rows if r.total_kj is not None)

    profile["durability_best_pct"] = round(min(drops), 1) if drops else None
    profile["durability_avg_pct"] = round(sum(drops) / len(drops), 1) if drops else None
    profile["avg_decoupling_pct"] = round(sum(decouples) / len(decouples), 1) if decouples else None
    profile["total_kj"] = round(total_kj, 0)

    # Per-ride science breakdown — date/title from the activities table, NP/kJ/
    # decoupling/durability from the stream metrics. The most granular data view.
    act_ids = [r.activity_id for r in rows]
    act_res = await db.execute(
        select(Activity.id, Activity.started_at, Activity.title).where(Activity.id.in_(act_ids))
    )
    meta = {a.id: (a.started_at, a.title) for a in act_res.all()}
    stream_by_id = {r.activity_id: (r.streams or {}).get("power") or [] for r in rows}
    rides = []
    for r in rows:
        started, title = meta.get(r.activity_id, (None, None))
        # Per-ride W′-balance: how deep into the anaerobic reserve this ride dug.
        wbal_min = None
        depleted = None
        if r.cp_watts and r.w_prime_j and r.w_prime_j > 0:
            wb = w_balance_summary(stream_by_id[r.activity_id], r.cp_watts, r.w_prime_j)
            wbal_min = round(wb.min_w_prime_bal_j / 1000.0, 1)  # kJ
            depleted = wb.depleted
        rides.append({
            "activity_id": r.activity_id,
            "date": started.date().isoformat() if started else None,
            "title": title,
            "np_watts": r.normalized_power,
            "total_kj": round(r.total_kj, 0) if r.total_kj is not None else None,
            "decoupling_pct": r.decoupling_pct,
            "durability_pct": per_ride_durability.get(r.activity_id),
            "cp_watts": r.cp_watts,
            "wbal_min_kj": wbal_min,
            "depleted": depleted,
        })
    rides.sort(key=lambda x: x["date"] or "", reverse=True)
    profile["rides"] = rides
    profile["available"] = True
    return profile
