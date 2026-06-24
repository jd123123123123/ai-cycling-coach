"""Individualized dose-response — fitted Banister fitness-fatigue model.

The standard PMC uses fixed time constants (CTL τ = 42 d, ATL τ = 7 d) for every
athlete. The Banister impulse-response model (Banister 1975; Busso 2003) instead
treats performance as:

    perf(t) = p0 + k1·Fitness(t) − k2·Fatigue(t)

    Fitness(t) = Σ_{i≤t} TSS_i · e^{−(t−i)/τ1}     (slow positive component)
    Fatigue(t) = Σ_{i≤t} TSS_i · e^{−(t−i)/τ2}     (fast negative component)

Individual athletes have different τ1, τ2, k1, k2 — fitting them to the athlete's
own (TSS → performance) history yields personalized fitness/fatigue dynamics and
better load projections than one-size-fits-all constants.

Fit strategy: a coarse grid search over (τ1, τ2) with τ1 > τ2 (fitness must decay
slower than fatigue — a physiological invariant), solving the linear gains
(p0, k1, k2) by least squares at each grid point and keeping the best R². This is
robust with sparse, noisy data where a full nonlinear solver would overfit or
fail to converge. Falls back (returns None) below a minimum number of
performance observations so the caller keeps the Banister defaults.

Pure module: numpy only, no DB/Garmin.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MIN_PERFORMANCE_POINTS = 4

# Grid bounds (days). τ1 spans the plausible fitness range; τ2 the fatigue range.
_TAU1_GRID = range(20, 61, 2)
_TAU2_GRID = range(3, 22, 1)


def _components(tss: list[float], day: int, tau1: float, tau2: float) -> tuple[float, float]:
    fitness = 0.0
    fatigue = 0.0
    for i in range(day + 1):
        load = tss[i]
        if load:
            decay = day - i
            fitness += load * np.exp(-decay / tau1)
            fatigue += load * np.exp(-decay / tau2)
    return fitness, fatigue


@dataclass(frozen=True)
class FitnessFatigueModel:
    tau1: float
    tau2: float
    k1: float
    k2: float
    p0: float
    r_squared: float

    def predict(self, tss: list[float], day: int) -> float:
        fitness, fatigue = _components(tss, day, self.tau1, self.tau2)
        return self.p0 + self.k1 * fitness - self.k2 * fatigue


def fit_fitness_fatigue(
    tss: list[float],
    performance: dict[int, float],
    min_points: int = MIN_PERFORMANCE_POINTS,
) -> FitnessFatigueModel | None:
    """Fit per-athlete τ1/τ2/gains to observed (day → performance) points.

    Returns None when there are too few performance observations to identify the
    model (the caller should keep fixed Banister constants until enough data).
    """
    if not tss or len(performance) < min_points:
        return None

    days = sorted(performance.keys())
    y = np.array([performance[d] for d in days], dtype=float)
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    if ss_tot <= 0:  # all performance values identical — model not identifiable
        return None

    best: FitnessFatigueModel | None = None
    best_r2 = -np.inf

    for tau1 in _TAU1_GRID:
        for tau2 in _TAU2_GRID:
            if tau1 <= tau2:
                continue
            # Design matrix columns: [1, fitness, -fatigue] → coeffs [p0, k1, k2].
            rows = []
            for d in days:
                fit, fat = _components(tss, d, float(tau1), float(tau2))
                rows.append([1.0, fit, -fat])
            X = np.array(rows, dtype=float)
            coeffs, *_ = np.linalg.lstsq(X, y, rcond=None)
            predicted = X @ coeffs
            ss_res = float(np.sum((y - predicted) ** 2))
            r2 = 1.0 - ss_res / ss_tot
            if r2 > best_r2:
                best_r2 = r2
                p0, k1, k2 = coeffs
                best = FitnessFatigueModel(
                    tau1=float(tau1), tau2=float(tau2),
                    k1=round(float(k1), 4), k2=round(float(k2), 4),
                    p0=round(float(p0), 2), r_squared=round(r2, 4),
                )
    return best
