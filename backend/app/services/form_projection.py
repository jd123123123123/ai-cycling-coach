"""Individualized Fitness / Fatigue / Form — with the athlete's OWN time constants.

WHY THIS EXISTS
---------------
Every mainstream PMC (TrainingPeaks, intervals.icu, Strava Fitness & Freshness)
uses the SAME two time constants for every human being on earth: CTL τ = 42 d,
ATL τ = 7 d. Those numbers are Coggan's population defaults, not a fact about
the rider looking at the chart. A rider who absorbs work slowly and a rider who
supercompensates in four days get the identical curve.

This service fits the Banister impulse-response constants to THIS athlete's own
(training load → measured performance) history via
:func:`app.services.impulse_response.fit_fitness_fatigue`, and falls back to
42/7 whenever the athlete's data cannot support a better answer. The payload
always says which of the two happened, and ships the standard numbers alongside
the individual ones so the difference is visible rather than asserted.

THE THREE HONESTY RULES (these are the feature, not decoration)
---------------------------------------------------------------
1. **Never a point estimate without its uncertainty.** ``app/schemas/weeks.py``
   (the ``Projection.confidence_pct`` field) documents the app rule: below 30 %
   model confidence the UI must show a RANGE, never a point. Every projected
   day here carries an 80 % band, and the payload carries ``confidence_pct``
   (same 0–100 convention as ``Projection``), ``confidence_threshold_pct`` and
   the resolved boolean ``range_required`` so a client can obey the rule
   without re-deriving it. TODAY carries no band: today is measured, not
   projected.

2. **Real data or null.** No TSS history → ``available: False``. No plan → the
   forward load is labelled ``recent-average`` per day (the same vocabulary
   ``pmc_service.project_pmc_forward`` uses) and the assumption is spelled out
   in words in ``load.assumption``.

3. **If the individual fit is not better than the standard constants, use the
   standard constants.** See the in-sample trap below.

THE IN-SAMPLE TRAP (and why the comparison is AICc, not R²)
------------------------------------------------------------
``impulse_response._TAU1_GRID`` contains 42 and ``_TAU2_GRID`` contains 7, so
the grid search CONTAINS the standard model as one of its candidates. The
fitted model can therefore never have a worse in-sample R² than 42/7 —
comparing raw R² would always pick "individual" and would be a lie dressed as a
measurement.

So the comparison is complexity-penalised. The standard model spends 3
parameters (p0, k1, k2); the individual model spends 5 (p0, k1, k2, τ1, τ2).
Both are scored on the SAME observations with the small-sample corrected Akaike
criterion

    AIC  = n·ln(RSS/n) + 2p
    AICc = AIC + 2p(p+1)/(n−p−1)

and the individual constants are kept only when ``AICc_individual <
AICc_standard`` — only when the two extra parameters paid for themselves. AICc
needs ``n > p+1 = 6`` observations to be defined at all, which is why this
module requires ``MIN_OBSERVATIONS_FOR_INDIVIDUAL = 8``, stricter than
``impulse_response.MIN_PERFORMANCE_POINTS = 4`` (4 points identify the three
linear gains; they do not identify two time constants on top of them).

THE PERFORMANCE SERIES, AND WHY
-------------------------------
Banister's ``perf(t) = p0 + k1·Fitness(t) − k2·Fatigue(t)`` needs a series of
MAXIMAL performances. This app stores exactly one thing that is both maximal
and dense: the per-ride mean-maximal-power curve,
``ActivityStream.mmp_curve["1200"]`` — best 20-minute power of that ride. It is
already this app's canonical "best 20-min power" series (``season_trends``
reads the same field and key), so this feature and the Progress screen cannot
disagree about the same day.

The catch: a 20-min MMP from an easy endurance ride is not a maximal effort —
it is just "how hard that ride was". Feeding submaximal days to the model
biases τ badly. So a day is admitted as a performance observation only when its
20-min power is within ``NEAR_MAXIMAL_FRACTION`` (90 %) of the athlete's best
20-min power in the fit window — the standard "only use test-like efforts"
practice. The gate, the counts and every admitted point are returned in
``performance_series`` so the choice is inspectable rather than asserted.

Rejected alternatives, briefly: eFTP from normalized power (what
``services/performance_projection.py`` uses) is a *sustained*-effort proxy
rather than a maximal one and is noisier; ``AthleteProfile.ftp_history`` is
event-based and far too sparse (a handful of entries per year) to identify two
time constants; ``ActivityStream.eftp_watts`` inherits the CP fit's own
uncertainty and is only populated where a CP fit succeeded.

SCALE
-----
``fit_fitness_fatigue`` works on the RAW convolutions Σ TSS·e^(−Δ/τ), whose
units are ~τ × TSS and mean nothing to a rider. The fitness / fatigue / form
numbers emitted here are instead built with the app's own EWMA recursion
(``training_load.update_ctl_atl`` generalised to an arbitrary τ):

    x_t = x_{t−1} + (TSS_t − x_{t−1})/τ

At τ = 42/7 that IS ``update_ctl_atl``, so the "standard" output here is the
very same number the PMC screen shows, and the individual output is directly
comparable to it. ``form = fitness − fatigue``, same-day convention, matching
``training_load.calculate_tsb``.

Reads activities (via ``pmc_service``), activity_streams and planned_workouts.
No LLM.
"""
from __future__ import annotations

import logging
import math
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.planned_workout import PlannedWorkout
from app.services.athlete_time import athlete_tz, today_local
from app.services.impulse_response import fit_fitness_fatigue
from app.services.mesocycle_generator import template_tss_estimate
from app.services.pmc_service import compute_user_pmc
from app.services.training_load import ATL_TIME_CONSTANT, CTL_TIME_CONSTANT

logger = logging.getLogger(__name__)

# ── Windows ──────────────────────────────────────────────────────────────────
HISTORY_DAYS = 180          # ~3× the longest τ in the grid (60 d): long enough
                            # to identify a slow fitness constant, short enough
                            # that last season's athlete doesn't drive the fit.
DEFAULT_HORIZON_DAYS = 42   # six weeks forward
MAX_HORIZON_DAYS = 180
MIN_HISTORY_DAYS = 28       # below this there is no meaningful EWMA at all

# ── Model selection ──────────────────────────────────────────────────────────
# Stricter than impulse_response.MIN_PERFORMANCE_POINTS (4): 4 points identify
# the 3 linear gains, not 2 extra time constants — and AICc for p=5 is
# undefined until n > 6.
MIN_OBSERVATIONS_FOR_INDIVIDUAL = 8
_N_PARAMS_INDIVIDUAL = 5    # p0, k1, k2, τ1, τ2
_N_PARAMS_STANDARD = 3      # p0, k1, k2

# A day counts as a performance observation only if its best 20-min power is
# within this fraction of the window's best — i.e. it was a near-maximal effort.
#
# Why 0.90 and not lower: an endurance ride's 20-min power lands near 0.65–0.70
# of the athlete's best and a tempo ride near 0.85–0.90, so anything looser
# starts admitting tempo rides as if they were tests, which biases τ badly.
#
# What 0.90 costs, stated rather than hidden: a genuinely maximal effort made
# on a deeply fatigued day can land at 0.88 of season best and is censored —
# and those are precisely the days that carry the most information about τ2.
# The gate therefore trades some fatigue signal for freedom from submaximal
# contamination. Every admitted point and both counts ship in
# ``performance_series`` so the tradeoff is auditable per athlete rather than
# taken on faith.
NEAR_MAXIMAL_FRACTION = 0.90
MMP_20MIN_KEY = 1200        # seconds — the same key season_trends reads

# Confidence reaches its ceiling at this many admitted observations.
_FULL_CONFIDENCE_OBSERVATIONS = 12

# The app rule, documented on app/schemas/weeks.py Projection.confidence_pct:
# below 30 the UI must render a range, never a point. Same 0–100 convention.
CONFIDENCE_THRESHOLD_PCT = 30

# The standard model was never validated against THIS athlete, so it is capped
# BELOW the threshold on purpose: a population constant is not an individual
# measurement, and a client is therefore required to render it as a range. We
# would rather be honestly uncertain on the fallback path than quietly present
# Coggan's defaults as a fact about you.
STANDARD_MODEL_CONFIDENCE_PCT = 25

# 80 % predictive interval (two-sided Normal).
_Z80 = 1.2816
_COMPLIANCE_LOOKBACK_DAYS = 56
_MIN_COMPLIANCE_PAIRS = 5
_LOAD_SIGMA_WINDOW_DAYS = 28


# ─────────────────────────────────────────────────────────────────────────────
# Pure helpers
# ─────────────────────────────────────────────────────────────────────────────

def ewma_series(tss: list[float], tau: float) -> list[float]:
    """The app's CTL/ATL recursion at an arbitrary τ.

    ``x_t = x_{t−1} + (TSS_t − x_{t−1})/τ``. At τ = 42 / 7 this is exactly
    :func:`app.services.training_load.update_ctl_atl`, so the standard path
    reproduces the PMC screen's numbers rather than approximating them.
    """
    out: list[float] = []
    x = 0.0
    for w in tss:
        x = x + (w - x) / tau
        out.append(x)
    return out


def _convolve(tss: list[float], tau: float) -> list[float]:
    """Raw Banister convolution Σ_{i≤t} TSS_i·e^(−(t−i)/τ), decay form.

    Numerically identical to ``impulse_response._components`` but O(n) rather
    than O(n²), and written here so this module does not reach into another
    module's private helper. Used only for the FIT, whose gains live on this
    scale — never for anything a rider sees.
    """
    d = math.exp(-1.0 / tau)
    out: list[float] = []
    g = 0.0
    for w in tss:
        g = g * d + w
        out.append(g)
    return out


def score_at_fixed_tau(
    tss: list[float], performance: dict[int, float], tau1: float, tau2: float
) -> tuple[float, float] | None:
    """Least-squares (p0, k1, k2) at FIXED τ → ``(rss, r_squared)``.

    This scores the standard-constants model on exactly the same observations
    as the fitted one, which is what makes the AICc comparison legitimate.
    ``None`` when the observations cannot identify anything (no variance).
    """
    import numpy as np

    if not tss or not performance:
        return None
    days = sorted(performance)
    if any(d < 0 or d >= len(tss) for d in days):
        return None
    y = np.array([performance[d] for d in days], dtype=float)
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    if ss_tot <= 0:
        return None
    g1 = _convolve(tss, tau1)
    g2 = _convolve(tss, tau2)
    X = np.array([[1.0, g1[d], -g2[d]] for d in days], dtype=float)
    coeffs, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ coeffs
    rss = float(np.sum(resid ** 2))
    return rss, 1.0 - rss / ss_tot


def aicc(rss: float, n: int, p: int) -> float | None:
    """Small-sample corrected Akaike criterion. ``None`` when undefined."""
    if n <= p + 1 or rss <= 0 or n <= 0:
        return None
    aic = n * math.log(rss / n) + 2 * p
    return aic + (2 * p * (p + 1)) / (n - p - 1)


def _adjusted_r2(r2: float, n: int, p: int) -> float:
    if n - p <= 0:
        return r2
    return 1.0 - (1.0 - r2) * (n - 1) / (n - p)


def confidence_pct_for(r2: float, n_obs: int, p: int) -> int:
    """Adjusted R², discounted by how few observations constrain it, as 0–100.

    ``adj_R² × min(1, n/12)``: a spectacular fit on 8 points is not as
    trustworthy as the same fit on 30, and the payload should say so.
    """
    adj = _adjusted_r2(r2, n_obs, p)
    sufficiency = min(1.0, n_obs / _FULL_CONFIDENCE_OBSERVATIONS)
    return int(round(max(0.0, min(1.0, adj * sufficiency)) * 100))


def forward_band_sigma(
    horizon_index: int, tau1: float, tau2: float, sigma_w: float
) -> tuple[float, float, float]:
    """SD of projected (fitness, fatigue, form) ``horizon_index`` days out.

    Each future day's load ``w_i`` is uncertain with SD ``sigma_w`` (measured
    plan compliance, or recent day-to-day variability — see
    ``load.uncertainty`` in the payload). Propagating through the EWMA,

        fitness_H = fitness_0·a₁^H + (1/τ₁)·Σ_{i=1..H} w_i·a₁^(H−i),  a = 1−1/τ

    so Var(fitness_H) = σ_w²·Σ (a₁^(H−i)/τ₁)². Fitness and fatigue are driven
    by the SAME w_i, so form's variance uses the difference of the two weights,
    not the sum of the two variances — treating them as independent would make
    the form band far too wide.

    Known limitation, stated rather than hidden: this band covers uncertainty
    in the FUTURE LOAD only. It does not cover uncertainty in τ itself; that is
    what ``confidence_pct`` reports separately.
    """
    if horizon_index <= 0 or sigma_w <= 0:
        return 0.0, 0.0, 0.0
    a1 = 1.0 - 1.0 / tau1
    a2 = 1.0 - 1.0 / tau2
    v1 = v2 = vf = 0.0
    for i in range(1, horizon_index + 1):
        e = horizon_index - i
        c1 = (a1 ** e) / tau1
        c2 = (a2 ** e) / tau2
        v1 += c1 * c1
        v2 += c2 * c2
        vf += (c1 - c2) ** 2
    return sigma_w * math.sqrt(v1), sigma_w * math.sqrt(v2), sigma_w * math.sqrt(vf)


def _pstdev(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    return math.sqrt(sum((v - mean) ** 2 for v in values) / n)


# ─────────────────────────────────────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────────────────────────────────────

def _local_date(dt: datetime | None) -> date | None:
    """Athlete-local calendar day, matching ``pmc_service``'s bucketing."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        return dt.astimezone(athlete_tz()).date()
    except Exception:  # noqa: BLE001 — a bad tz must not break the projection
        return dt.date()


async def load_p20_by_day(
    db: AsyncSession, user_id: int, since: date
) -> dict[date, float]:
    """Best 20-min mean-maximal power per athlete-local day (cycling only).

    Reads ``ActivityStream.mmp_curve[1200]`` — the same field and key
    ``season_trends`` uses for its ``p20min_w`` series. Keys may be int or str
    depending on the JSON round-trip, so both are tried (house pattern).
    """
    rows = await db.execute(
        select(ActivityStream.activity_id, ActivityStream.mmp_curve).where(
            ActivityStream.user_id == user_id
        )
    )
    streams = [r for r in rows.all() if r.mmp_curve]
    if not streams:
        return {}
    act_res = await db.execute(
        select(Activity.id, Activity.started_at).where(
            Activity.id.in_([r.activity_id for r in streams]),
            Activity.sport == "cycling",
        )
    )
    started_by_id = {a.id: a.started_at for a in act_res.all()}

    out: dict[date, float] = {}
    for r in streams:
        day = _local_date(started_by_id.get(r.activity_id))
        if day is None or day < since:
            continue
        curve = r.mmp_curve or {}
        raw = curve.get(str(MMP_20MIN_KEY))
        if raw is None:
            raw = curve.get(MMP_20MIN_KEY)
        if raw is None:
            continue
        try:
            watts = float(raw)
        except (TypeError, ValueError):
            continue
        if watts <= 0 or not math.isfinite(watts):
            continue
        out[day] = max(out.get(day, watts), watts)
    return out


async def load_planned_tss(
    db: AsyncSession, user_id: int, start: date, end: date
) -> dict[date, float]:
    """Prescribed TSS per day in ``[start, end]``; days with no session absent.

    Uses ``mesocycle_generator.template_tss_estimate`` — the one canonical
    planned-TSS producer in this codebase (``pmc_service.project_pmc_forward``
    and ``weekly_recap.planned_week_total`` both go through it), so the
    projection cannot disagree with the Week screen about what a planned day
    weighs. A session whose template AND duration are both unknown yields
    ``None`` there and is skipped here: a duration with no intensity is not a
    load, and inventing one is exactly the dishonesty this feature exists to
    avoid.
    """
    res = await db.execute(
        select(
            PlannedWorkout.date,
            PlannedWorkout.template_id,
            PlannedWorkout.duration_seconds_target,
        ).where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date >= start,
            PlannedWorkout.date <= end,
        )
    )
    by_day: dict[date, float] = defaultdict(float)
    for d, template_id, duration_s in res.all():
        est = template_tss_estimate(template_id, duration_s)
        if est is None:
            continue
        # A date may hold several planned sessions (e.g. ride + strength).
        by_day[d] += float(est)
    return {d: round(v, 1) for d, v in by_day.items()}


async def _load_sigma(
    db: AsyncSession,
    user_id: int,
    tss_by_date: dict[date, float],
    today: date,
) -> tuple[float, str, int]:
    """Per-day load SD feeding the forward band.

    Preferred: MEASURED plan compliance — the SD of (actual − planned) TSS over
    recent past days that HAD a planned session. That is the real question
    ("will they actually do the plan?"), answered from the athlete's own
    record. Falls back to the population-standard-deviation of recent daily TSS
    — the same σ definition ``pmc_service.project_pmc_forward`` uses for its
    execution-variability band, so the two forward views widen for the same
    reason.
    """
    try:
        past_planned = await load_planned_tss(
            db, user_id, today - timedelta(days=_COMPLIANCE_LOOKBACK_DAYS), today
        )
    except Exception:  # noqa: BLE001 — degrade to variability, never fail
        logger.debug("plan-compliance sigma unavailable", exc_info=True)
        past_planned = {}

    deltas = [
        tss_by_date.get(d, 0.0) - p for d, p in past_planned.items() if d in tss_by_date
    ]
    if len(deltas) >= _MIN_COMPLIANCE_PAIRS:
        return _pstdev(deltas), "plan_compliance", len(deltas)

    recent = [
        t for d, t in tss_by_date.items() if 0 <= (today - d).days < _LOAD_SIGMA_WINDOW_DAYS
    ]
    return _pstdev(recent), "recent_variability", len(recent)


_FALLBACK_COPY = {
    "too_few_performance_observations": (
        "Standard constants (fitness 42 d / fatigue 7 d). You do not yet have "
        "enough near-maximal 20-minute efforts to fit your own."
    ),
    "fit_not_identifiable": (
        "Standard constants (fitness 42 d / fatigue 7 d). Your performance "
        "history is too flat to identify individual time constants."
    ),
    "standard_constants_fit_better": (
        "Standard constants (fitness 42 d / fatigue 7 d). An individual fit did "
        "not beat them once its two extra parameters were paid for."
    ),
    "fit_not_scorable": "Standard constants (fitness 42 d / fatigue 7 d).",
    "standard_model_not_scorable": "Standard constants (fitness 42 d / fatigue 7 d).",
}


# ─────────────────────────────────────────────────────────────────────────────
# The service
# ─────────────────────────────────────────────────────────────────────────────

async def build_form_projection(
    db: AsyncSession,
    user_id: int,
    *,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
) -> dict:
    """Fitness / fatigue / form today and projected forward, individually fitted.

    Returns ``{"available": False, "reason": ...}`` when there is genuinely no
    data behind the answer. Otherwise see ``app/schemas/form_projection.py``.
    """
    horizon_days = max(1, min(int(horizon_days), MAX_HORIZON_DAYS))

    # ── 1. Daily TSS, from the app's one PMC aggregation ────────────────────
    # compute_user_pmc buckets by athlete-local day and runs the EWMA from the
    # athlete's first activity, so the standard numbers below are the exact
    # numbers the PMC screen shows — two screens cannot disagree about a day.
    pmc = await compute_user_pmc(db, user_id, days=HISTORY_DAYS)
    total = pmc.get("total") or []
    if not total:
        return {"available": False, "reason": "no_history"}

    today = today_local()
    rows = [e for e in total if e["date"] <= today]
    if not rows:
        rows = total
        today = rows[-1]["date"]
    if len(rows) < MIN_HISTORY_DAYS:
        return {
            "available": False,
            "reason": "insufficient_history",
            "history_days": len(rows),
            "history_days_required": MIN_HISTORY_DAYS,
        }

    dates = [e["date"] for e in rows]
    tss = [float(e.get("tss") or 0.0) for e in rows]
    tss_by_date = dict(zip(dates, tss))
    index_by_date = {d: i for i, d in enumerate(dates)}

    standard_today = {
        "date": today,
        "fitness": round(float(rows[-1].get("ctl") or 0.0), 1),
        "fatigue": round(float(rows[-1].get("atl") or 0.0), 1),
        "form": round(float(rows[-1].get("tsb") or 0.0), 1),
    }

    # ── 2. Performance observations: near-maximal 20-min power ──────────────
    p20_by_day = await load_p20_by_day(db, user_id, dates[0])
    in_window = {d: w for d, w in p20_by_day.items() if d in index_by_date}
    best_p20 = max(in_window.values()) if in_window else 0.0
    gate_watts = round(best_p20 * NEAR_MAXIMAL_FRACTION, 1) if best_p20 else 0.0
    admitted = {d: w for d, w in in_window.items() if w >= gate_watts} if best_p20 else {}
    performance = {index_by_date[d]: w for d, w in admitted.items()}
    n_obs = len(performance)

    # ── 3. Individual fit vs standard constants, complexity-penalised ───────
    model = "standard"
    tau1, tau2 = float(CTL_TIME_CONSTANT), float(ATL_TIME_CONSTANT)
    r_squared: float | None = None
    standard_r2: float | None = None
    aicc_ind: float | None = None
    aicc_std: float | None = None
    fallback_reason: str | None = None
    k1 = k2 = p0 = None

    std_score = score_at_fixed_tau(tss, performance, tau1, tau2) if performance else None
    if std_score is not None:
        std_rss, standard_r2 = std_score
        aicc_std = aicc(std_rss, n_obs, _N_PARAMS_STANDARD)

    if n_obs < MIN_OBSERVATIONS_FOR_INDIVIDUAL:
        fallback_reason = "too_few_performance_observations"
    else:
        fitted = fit_fitness_fatigue(
            tss, performance, min_points=MIN_OBSERVATIONS_FOR_INDIVIDUAL
        )
        if fitted is None:
            fallback_reason = "fit_not_identifiable"
        elif aicc_std is None:
            fallback_reason = "standard_model_not_scorable"
        else:
            ind_score = score_at_fixed_tau(tss, performance, fitted.tau1, fitted.tau2)
            aicc_ind = aicc(ind_score[0], n_obs, _N_PARAMS_INDIVIDUAL) if ind_score else None
            if aicc_ind is None:
                fallback_reason = "fit_not_scorable"
            elif aicc_ind >= aicc_std:
                # The two extra parameters did NOT pay for themselves. The
                # in-sample R² is higher — it always is, the grid contains 42/7
                # — and shipping it anyway would be the exact dishonesty this
                # module exists to avoid.
                fallback_reason = "standard_constants_fit_better"
            else:
                model = "individual"
                tau1, tau2 = fitted.tau1, fitted.tau2
                k1, k2, p0 = fitted.k1, fitted.k2, fitted.p0
                r_squared = fitted.r_squared

    if model == "individual" and r_squared is not None:
        conf_pct = confidence_pct_for(r_squared, n_obs, _N_PARAMS_INDIVIDUAL)
    else:
        conf_pct = STANDARD_MODEL_CONFIDENCE_PCT

    # ── 4. Today, on the chosen constants ───────────────────────────────────
    fitness_now = ewma_series(tss, tau1)[-1]
    fatigue_now = ewma_series(tss, tau2)[-1]

    # ── 5. Forward load: the plan, or a labelled assumption ─────────────────
    horizon_end = today + timedelta(days=horizon_days)
    planned = await load_planned_tss(db, user_id, today + timedelta(days=1), horizon_end)
    plan_last_day = max(planned) if planned else None

    recent7 = [t for d, t in tss_by_date.items() if 0 <= (today - d).days < 7]
    rolling_7d = round(sum(recent7) / 7.0, 1) if recent7 else 0.0

    future: list[tuple[date, float, str]] = []
    for i in range(1, horizon_days + 1):
        d = today + timedelta(days=i)
        if plan_last_day is not None and d <= plan_last_day:
            # Inside the planned span a day with no session is a REST day, not
            # a missing datum — the plan says nothing happens.
            future.append((d, planned.get(d, 0.0), "plan"))
        else:
            future.append((d, rolling_7d, "recent-average"))

    plan_days = sum(1 for _, _, s in future if s == "plan")
    if plan_days == 0:
        load_source = "recent-average"
    elif plan_days == horizon_days:
        load_source = "plan"
    else:
        load_source = "mixed"

    assumption: str | None = None
    if load_source != "plan":
        scope = "No plan covers this horizon" if plan_days == 0 else (
            f"The plan covers the next {plan_days} day(s); beyond that"
        )
        assumption = (
            f"{scope}. Those days assume your current 7-day rolling average of "
            f"{rolling_7d} TSS/day simply continues. That is a continuation of "
            f"your recent load, not a prescription — nobody has planned it."
        )

    # ── 6. Load uncertainty ─────────────────────────────────────────────────
    sigma_w, sigma_source, sigma_n = await _load_sigma(db, user_id, tss_by_date, today)

    # ── 7. Project ──────────────────────────────────────────────────────────
    fitness = fitness_now
    fatigue = fatigue_now
    projection: list[dict] = []
    for i, (d, w, src) in enumerate(future, start=1):
        fitness = fitness + (w - fitness) / tau1
        fatigue = fatigue + (w - fatigue) / tau2
        form = fitness - fatigue
        s_fit, s_fat, s_form = forward_band_sigma(i, tau1, tau2, sigma_w)
        projection.append({
            "date": d,
            "days_out": i,
            "tss": round(w, 1),
            "load_source": src,
            "fitness": round(fitness, 1),
            "fatigue": round(fatigue, 1),
            "form": round(form, 1),
            "fitness_low": round(fitness - _Z80 * s_fit, 1),
            "fitness_high": round(fitness + _Z80 * s_fit, 1),
            "fatigue_low": round(fatigue - _Z80 * s_fat, 1),
            "fatigue_high": round(fatigue + _Z80 * s_fat, 1),
            "form_low": round(form - _Z80 * s_form, 1),
            "form_high": round(form + _Z80 * s_form, 1),
        })

    # ── 8. Payload ──────────────────────────────────────────────────────────
    return {
        "available": True,
        "model": model,
        "model_reason": (
            "Fitted to your own load-versus-performance history: your individual "
            "time constants beat the standard 42 / 7 on AICc."
            if model == "individual"
            else _FALLBACK_COPY.get(fallback_reason, "Standard constants.")
        ),
        "fallback_reason": fallback_reason,
        "confidence_pct": conf_pct,
        "confidence_threshold_pct": CONFIDENCE_THRESHOLD_PCT,
        # The resolved app rule (app/schemas/weeks.py Projection.confidence_pct):
        # a client MUST render a range rather than a point when this is true.
        "range_required": conf_pct < CONFIDENCE_THRESHOLD_PCT,
        "today": {
            "date": today,
            # Measured, not projected — no band. The uncertainty on today is
            # model choice, which confidence_pct already reports.
            "fitness": round(fitness_now, 1),
            "fatigue": round(fatigue_now, 1),
            "form": round(fitness_now - fatigue_now, 1),
        },
        # What every other tool would show you for the same day. Identical to
        # `today` on the standard path, by construction.
        "standard_today": standard_today,
        "constants": {
            "tau1_days": round(tau1, 1),
            "tau2_days": round(tau2, 1),
            "standard_tau1_days": float(CTL_TIME_CONSTANT),
            "standard_tau2_days": float(ATL_TIME_CONSTANT),
            "k1": k1,
            "k2": k2,
            "p0": p0,
            "r_squared": r_squared,
            "standard_r_squared": round(standard_r2, 4) if standard_r2 is not None else None,
            "aicc": round(aicc_ind, 2) if aicc_ind is not None else None,
            "standard_aicc": round(aicc_std, 2) if aicc_std is not None else None,
            "selection_criterion": "AICc (lower wins); the τ grid contains 42/7, so raw R² cannot decide",
            "n_observations": n_obs,
            "n_observations_required": MIN_OBSERVATIONS_FOR_INDIVIDUAL,
        },
        "performance_series": {
            "source": "activity_stream.mmp_curve[1200]",
            "metric": "best 20-minute mean-maximal power",
            "unit": "watts",
            "gate": (
                f"a day is admitted only when its best 20-min power is at least "
                f"{int(NEAR_MAXIMAL_FRACTION * 100)}% of the window best"
                + (f" ({gate_watts} W)" if gate_watts else "")
                + " — a submaximal ride is not a performance test"
            ),
            "gate_watts": gate_watts or None,
            "window_best_watts": round(best_p20, 1) if best_p20 else None,
            "n_candidate_days": len(in_window),
            "n_observations": n_obs,
            "points": [{"date": d, "watts": round(w, 1)} for d, w in sorted(admitted.items())],
        },
        "load": {
            "source": load_source,
            "assumption": assumption,
            "rolling_7d_tss": rolling_7d,
            "planned_days": plan_days,
            "horizon_days": horizon_days,
            "uncertainty": {
                "sigma_tss_per_day": round(sigma_w, 1),
                "source": sigma_source,
                "n": sigma_n,
                "band": "80%",
                "covers": "future load only — not uncertainty in the time constants",
            },
        },
        "history_days": len(rows),
        "projection": projection,
    }
