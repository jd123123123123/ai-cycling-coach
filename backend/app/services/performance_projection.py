"""Performance PROJECTION with confidence bands — "where we can land".

A Bayesian-flavoured Fitness–Fatigue (Banister) projection. Plain least-squares
on the full FF model is ill-conditioned (τ1, τ2, k1, k2 trade off against each
other), so we DON'T fit the impulse-response constants. Instead we:

  1. Fix POPULATION PRIORS  τ1 = 42 d (fitness), τ2 = 10 d (fatigue),
     k2/k1 = 2  (fatigue penalised twice as hard as fitness helps).
  2. Build the two convolutions of daily TSS  w(i):
         g1(t) = Σ w(i)·e^(-(t-i)/τ1)      (fitness)
         g2(t) = Σ w(i)·e^(-(t-i)/τ2)      (fatigue)
     computed as the decay-form EWMA  g_t = g_{t-1}·e^(-1/τ) + w_t  over the
     whole past+future daily-TSS timeline.
  3. Reduce the model to a SINGLE per-athlete linear map on the model signal
         x(t) = g1(t) - 2·g2(t)
     namely   p̂(t) = p0 + scale·x(t).
     Only (p0, scale) are fit — by MAP / ridge (Bayesian linear regression with
     a Gaussian prior). Cold-start (too few performance samples) falls back to
     the population prior, i.e. an FTP-anchored central path with wide bands.

Target series y(t): a real performance marker when the athlete has one —
per-day eFTP samples derived from sustained hard efforts (normalized power on
rides ≥ 20 min at ≥ 83% FTP is a defensible threshold-power sample). When no
such series exists we project the fitness signal itself and widen the bands.

Uncertainty: the Bayesian-linear-regression posterior over (p0, scale) gives a
predictive variance at every future day — wide when few samples constrain the
map, narrowing as data accrues, and fanning out with horizon. We emit a central
path plus 50% and 80% confidence bands. This is DECISION-SUPPORT, not a
guarantee; the caveat string says so and precision is capped.

Pure + deterministic. No DB, no LLM, no API key. numpy only for the 2×2 solve.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Literal

# ── Population priors (fixed — NOT fit) ──────────────────────────────────────
TAU1 = 42.0          # fitness time-constant (days)
TAU2 = 10.0          # fatigue time-constant (days)
K2_OVER_K1 = 2.0     # fatigue weighted twice fitness

# eFTP-sample gate: a sustained effort we'll trust as a threshold-power sample.
_EFTP_MIN_DURATION_S = 20 * 60
_EFTP_MIN_IF = 0.83

_MIN_PERF_SAMPLES = 3   # below this → fall back to fitness projection + wide bands

# Prior widths (weakly-informative). σ_obs is watts of per-sample noise.
_SIGMA_OBS_W = 8.0
_P0_PRIOR_SD_W = 30.0

# z-multipliers for a Normal predictive interval.
_Z50 = 0.6745
_Z80 = 1.2816

Mode = Literal["performance", "fitness"]

# Sane watts envelope — clamp any eFTP sample / projected value into human range
# so a corrupt reading can never drag the fit to nonsense (or NaN).
_MIN_WATTS = 40.0
_MAX_WATTS = 700.0


def _finite(v, fallback: float) -> float:
    """Coerce to a finite float, else `fallback`. NaN/inf/None → fallback."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return fallback
    return f if math.isfinite(f) else fallback


def _decay_convolutions(tss: list[float]) -> tuple[list[float], list[float]]:
    """Fitness g1 (τ1) and fatigue g2 (τ2) decay-form EWMA over daily TSS."""
    d1 = math.exp(-1.0 / TAU1)
    d2 = math.exp(-1.0 / TAU2)
    g1: list[float] = []
    g2: list[float] = []
    a = b = 0.0
    for w in tss:
        a = a * d1 + w
        b = b * d2 + w
        g1.append(a)
        g2.append(b)
    return g1, g2


def eftp_samples_from_activities(activities: list[dict], ftp_watts: float) -> list[dict]:
    """Derive per-day eFTP (watts) samples from activity rows.

    A ride qualifies as a threshold-power sample when it is ≥ 20 min with a
    normalized power ≥ 83% of FTP; we take its NP as a (conservative) eFTP
    reading. Multiple qualifying rides on a day collapse to the max.

    Args:
        activities: ``{"date": date|iso, "normalized_power": float|None,
            "duration_seconds": int|None}`` rows.
        ftp_watts: current FTP anchor (for the IF gate).

    Returns: ascending ``[{"date": iso, "value": watts}]``.
    """
    if not ftp_watts or ftp_watts <= 0:
        return []
    by_day: dict[str, float] = {}
    for a in activities:
        np_ = a.get("normalized_power")
        dur = a.get("duration_seconds")
        if np_ is None or dur is None:
            continue
        try:
            np_ = float(np_)
            dur = float(dur)
        except (TypeError, ValueError):
            continue
        # Reject non-finite BEFORE the gates — NaN passes every comparison
        # (`nan <= 0`, `nan < x` are all False) and would poison the fit.
        if not (math.isfinite(np_) and math.isfinite(dur)):
            continue
        if dur < _EFTP_MIN_DURATION_S or np_ <= 0:
            continue
        if (np_ / ftp_watts) < _EFTP_MIN_IF:
            continue
        # Clamp into a sane watts range so a spurious reading can't skew the map.
        np_ = min(max(np_, _MIN_WATTS), _MAX_WATTS)
        iso = a["date"].isoformat() if isinstance(a.get("date"), date) else str(a.get("date"))
        by_day[iso] = max(by_day.get(iso, np_), np_)
    return [{"date": k, "value": v} for k, v in sorted(by_day.items())]


def _fit_bayesian_linear(
    xs: list[float], ys: list[float], *, scale_prior: float, p0_prior: float
) -> tuple[float, float, list[list[float]]]:
    """MAP fit of  y = p0 + scale·x  with a Gaussian prior on (p0, scale).

    Returns (p0_map, scale_map, posterior_cov_2x2). Uses a ridge/Bayesian
    linear-regression closed form:
        Sn⁻¹ = S0⁻¹ + β·XᵀX ;  mn = Sn·(S0⁻¹·m0 + β·Xᵀy)
    """
    import numpy as np

    beta = 1.0 / (_SIGMA_OBS_W ** 2)
    # Prior on scale: sd chosen so the prior lets the data move it, but anchors
    # a cold-ish start. Widen the scale prior with |scale_prior| so the relative
    # uncertainty is stable across athletes.
    scale_sd = max(abs(scale_prior) * 0.75, 1e-6)
    s0_inv = np.array([[1.0 / (_P0_PRIOR_SD_W ** 2), 0.0],
                       [0.0, 1.0 / (scale_sd ** 2)]])
    m0 = np.array([p0_prior, scale_prior])

    prior_cov = [[_P0_PRIOR_SD_W ** 2, 0.0], [0.0, scale_sd ** 2]]
    try:
        X = np.array([[1.0, x] for x in xs], dtype=float)
        y = np.array(ys, dtype=float)
        if not (np.all(np.isfinite(X)) and np.all(np.isfinite(y))):
            return p0_prior, scale_prior, prior_cov
        sn_inv = s0_inv + beta * (X.T @ X)
        # Pseudo-inverse is stable even if sn_inv is (near-)singular.
        sn = np.linalg.pinv(sn_inv)
        mn = sn @ (s0_inv @ m0 + beta * (X.T @ y))
        if not (np.all(np.isfinite(mn)) and np.all(np.isfinite(sn))):
            return p0_prior, scale_prior, prior_cov
        return float(mn[0]), float(mn[1]), sn.tolist()
    except (np.linalg.LinAlgError, ValueError, FloatingPointError):
        return p0_prior, scale_prior, prior_cov


def project_performance(
    past_daily_tss: list[dict],
    future_daily_tss: list[dict],
    *,
    ftp_watts: float,
    observations: list[dict] | None = None,
    today: date | None = None,
    goal_date: date | None = None,
    de: bool = False,
) -> dict:
    """Project performance/fitness forward with 50% & 80% confidence bands.

    Args:
        past_daily_tss:   ascending ``[{"date": date|iso, "tss": float}]`` history.
        future_daily_tss: ascending ``[{"date": date|iso, "tss": float}]`` — the
                          PLAN's prescribed forward load (out to the horizon).
        ftp_watts:        current FTP (watts) — the performance anchor.
        observations:     optional ``[{"date": iso, "value": watts}]`` eFTP
                          samples (from :func:`eftp_samples_from_activities`).
        today:            "today" anchor (defaults to ``date.today()``).
        goal_date:        target event date, if any (caps/labels the horizon).
        de:               German copy when True.

    Returns a JSON-able dict (see ``__all__`` doc). Never raises on empty data —
    degrades to an honest "not enough history" projection.
    """
    today = today or date.today()

    past = _clean_series(past_daily_tss)
    future = _clean_series(future_daily_tss)
    if not past:
        return _empty(de)

    # Full timeline: past then future (future strictly after past).
    timeline = past + [f for f in future if f[0] > past[-1][0]]
    dates = [d for d, _ in timeline]
    tss = [t for _, t in timeline]
    g1, g2 = _decay_convolutions(tss)
    x = [a - K2_OVER_K1 * b for a, b in zip(g1, g2)]
    x_by_date = {d.isoformat(): xi for d, xi in zip(dates, x)}

    # Index of "today" (last past day at or before today).
    past_dates = [d for d, _ in past]
    now_idx = max(i for i, d in enumerate(dates) if d <= today) if any(
        d <= today for d in dates
    ) else len(past) - 1
    ftp = _finite(ftp_watts, 0.0)
    if ftp <= 0:
        ftp = 250.0
    ftp = min(max(ftp, _MIN_WATTS), _MAX_WATTS)
    x_now = _finite(x[now_idx], 0.0)

    # Anchor the prior so the central path passes ≈ current FTP at "now": a
    # modest build (a +50% swing in the fitness signal → ~+5% FTP).
    denom = abs(x_now) if abs(x_now) > 1e-6 else 1.0
    scale_prior = _finite((0.05 * ftp) / (0.5 * denom), 0.0)
    p0_prior = _finite(ftp - scale_prior * x_now, ftp)

    obs = _align_observations(observations, x_by_date)
    n_samples = len(obs)
    mode: Mode = "performance" if n_samples >= _MIN_PERF_SAMPLES else "fitness"

    import numpy as np

    if mode == "performance":
        xs = [o[0] for o in obs]
        ys = [o[1] for o in obs]
        p0, scale, cov = _fit_bayesian_linear(
            xs, ys, scale_prior=scale_prior, p0_prior=p0_prior
        )
        unit = "watts"
        label_metric = "FTP" if not de else "FTP"
    else:
        # Fallback: project the fitness signal (normalized to CTL-like watts via
        # the prior anchor). Use the prior map directly; inflate uncertainty so
        # the bands are honestly wide with little/no performance data.
        p0, scale = p0_prior, scale_prior
        # Synthetic posterior covariance: large, shrinking with history length.
        hist_n = len(past)
        infl = max(1.0, 60.0 / max(hist_n, 1))
        cov = [[(_P0_PRIOR_SD_W ** 2) * infl, 0.0],
               [0.0, (max(abs(scale_prior) * 0.75, 1e-6) ** 2) * infl]]
        unit = "watts"
        label_metric = "fitness-equivalent FTP"

    # Sanitize the fitted map — a degenerate fit must never leak NaN downstream.
    p0 = _finite(p0, p0_prior)
    scale = _finite(scale, scale_prior)
    cov_np = np.array(cov, dtype=float)
    if not np.all(np.isfinite(cov_np)):
        cov_np = np.array(
            [[_P0_PRIOR_SD_W ** 2, 0.0], [0.0, max(abs(scale_prior) * 0.75, 1e-6) ** 2]]
        )

    def _predict(xi: float) -> tuple[float, float]:
        """Central watts + SD at model signal xi — guaranteed finite.

        Falls back to the population-prior map, then the FTP anchor, if the
        fitted map produces anything non-finite. Central is clamped to a sane
        watts envelope so the chart never plots absurd values.
        """
        xi = _finite(xi, x_now)
        mean = _finite(p0 + scale * xi, _finite(p0_prior + scale_prior * xi, ftp))
        mean = min(max(mean, _MIN_WATTS), _MAX_WATTS)
        var = (_SIGMA_OBS_W ** 2) + _finite(float(np.array([1.0, xi]) @ cov_np @ np.array([1.0, xi])), 0.0)
        sd = math.sqrt(max(var, 0.0))
        sd = _finite(sd, _SIGMA_OBS_W)
        return mean, sd

    # Sample the forward path weekly from today to the horizon.
    horizon_end = dates[-1]
    if goal_date is not None and today <= goal_date <= horizon_end:
        horizon_end = goal_date
    path: list[dict] = []
    cursor = today
    step = timedelta(days=7)
    # Always include the terminal (goal/horizon) point.
    sample_dates: list[date] = []
    while cursor < horizon_end:
        sample_dates.append(cursor)
        cursor += step
    sample_dates.append(horizon_end)

    for d in sample_dates:
        xi = _nearest_x(d, dates, x)
        mean, sd = _predict(xi)
        # Bands are offsets from a finite central → all five values are finite.
        path.append({
            "date": d.isoformat(),
            "central": round(mean, 1),
            "p10": round(mean - _Z80 * sd, 1),   # 80% band lower
            "p90": round(mean + _Z80 * sd, 1),   # 80% band upper
            "p25": round(mean - _Z50 * sd, 1),   # 50% band lower
            "p75": round(mean + _Z50 * sd, 1),   # 50% band upper
        })

    end_point = path[-1]
    now_mean, _ = _predict(x_now)
    now_mean = _finite(now_mean, ftp)
    days_out = max(0, (horizon_end - today).days)

    projected_outcome, caveat = _narrate(
        mode=mode,
        de=de,
        now_ftp=ftp,
        end_point=end_point,
        days_out=days_out,
        goal_date=goal_date,
        n_samples=n_samples,
    )

    return {
        "mode": mode,
        "unit": unit,
        "metric_label": label_metric,
        "samples_used": n_samples,
        "horizon_date": horizon_end.isoformat(),
        "days_out": days_out,
        "current_estimate": round(now_mean, 1),
        "projected_central": end_point["central"],
        "band_50": [end_point["p25"], end_point["p75"]],
        "band_80": [end_point["p10"], end_point["p90"]],
        "path": path,
        "projected_outcome": projected_outcome,
        "caveat": caveat,
    }


# ── helpers ──────────────────────────────────────────────────────────────────

def _clean_series(rows: list[dict] | None) -> list[tuple[date, float]]:
    out: list[tuple[date, float]] = []
    for r in rows or []:
        d = r.get("date")
        if isinstance(d, str):
            try:
                d = date.fromisoformat(d)
            except ValueError:
                continue
        if not isinstance(d, date):
            continue
        # NaN/inf TSS would poison the convolution for the whole tail — zero it.
        t = _finite(r.get("tss"), 0.0)
        out.append((d, t))
    out.sort(key=lambda p: p[0])
    return out


def _align_observations(
    observations: list[dict] | None, x_by_date: dict[str, float]
) -> list[tuple[float, float]]:
    """Pair each eFTP observation with the model signal x on that date."""
    pairs: list[tuple[float, float]] = []
    for o in observations or []:
        d = o.get("date")
        iso = d.isoformat() if isinstance(d, date) else str(d)
        xi = x_by_date.get(iso)
        val = o.get("value")
        if xi is None or val is None:
            continue
        xf, vf = float("nan"), float("nan")
        try:
            xf, vf = float(xi), float(val)
        except (TypeError, ValueError):
            continue
        # Drop any non-finite pair — one NaN y makes the whole regression NaN.
        if not (math.isfinite(xf) and math.isfinite(vf)) or vf <= 0:
            continue
        pairs.append((xf, vf))
    return pairs


def _nearest_x(d: date, dates: list[date], x: list[float]) -> float:
    """x(t) at date d — exact if present, else the last day at/before d, else last."""
    best_i = None
    for i, dd in enumerate(dates):
        if dd <= d:
            best_i = i
        else:
            break
    if best_i is None:
        best_i = len(dates) - 1
    return x[best_i]


def _narrate(
    *, mode: Mode, de: bool, now_ftp: float, end_point: dict, days_out: int,
    goal_date: date | None, n_samples: int,
) -> tuple[str, str]:
    central = end_point["central"]
    lo80, hi80 = end_point["p10"], end_point["p90"]
    when = (
        (f"am Renntag" if de else "by race day")
        if goal_date is not None else
        (f"in {max(1, round(days_out / 7))} Wochen" if de else f"in ~{max(1, round(days_out / 7))} weeks")
    )
    if mode == "performance":
        if de:
            outcome = (
                f"Projizierte {end_point and 'FTP'} {when}: ~{central:.0f} W "
                f"(wahrscheinlicher Bereich {lo80:.0f}–{hi80:.0f} W, 80%). "
                f"Heute geschätzt {now_ftp:.0f} W."
            )
            caveat = (
                "Entscheidungshilfe, keine Garantie — die Bänder zeigen die "
                "Bandbreite plausibler Ergebnisse, wenn du dem Plan folgst; "
                "Krankheit, Schlaf und Leben verschieben sie."
            )
        else:
            outcome = (
                f"Projected FTP {when}: ~{central:.0f} W "
                f"(likely range {lo80:.0f}–{hi80:.0f} W, 80%). "
                f"Today's estimate ~{now_ftp:.0f} W."
            )
            caveat = (
                "Decision-support, not a guarantee — the bands show the range of "
                "plausible outcomes if you follow the plan; illness, sleep and life "
                "move them around."
            )
    else:
        if de:
            outcome = (
                f"Noch wenige Leistungsdaten ({n_samples}) — wir projizieren den "
                f"Fitness-Trend {when}: ~{central:.0f} W-äquivalent "
                f"(breites Band {lo80:.0f}–{hi80:.0f} W). "
                "Mit mehr harten Einheiten wird die Prognose schärfer."
            )
            caveat = (
                "Frühe Schätzung mit absichtlich breiten Bändern — noch nicht genug "
                "Leistungsproben für eine enge Prognose. Entscheidungshilfe, keine Garantie."
            )
        else:
            outcome = (
                f"Few performance samples yet ({n_samples}) — projecting the fitness "
                f"trend {when}: ~{central:.0f} W-equivalent "
                f"(wide band {lo80:.0f}–{hi80:.0f} W). "
                "The projection sharpens as you log more hard efforts."
            )
            caveat = (
                "Early estimate with deliberately wide bands — not enough performance "
                "samples yet for a tight projection. Decision-support, not a guarantee."
            )
    return outcome, caveat


def _empty(de: bool) -> dict:
    return {
        "mode": "fitness",
        "unit": "watts",
        "metric_label": "fitness-equivalent FTP",
        "samples_used": 0,
        "horizon_date": date.today().isoformat(),
        "days_out": 0,
        "current_estimate": None,
        "projected_central": None,
        "band_50": None,
        "band_80": None,
        "path": [],
        "projected_outcome": (
            "Noch nicht genug Trainingshistorie für eine Prognose."
            if de else
            "Not enough training history yet to project performance."
        ),
        "caveat": (
            "Log ein paar Wochen, dann zeigen wir dir mit Bändern, wohin es geht."
            if de else
            "Log a few weeks and we'll show where you're pointed, with honest bands."
        ),
    }


__all__ = [
    "project_performance",
    "eftp_samples_from_activities",
    "TAU1",
    "TAU2",
    "K2_OVER_K1",
]
