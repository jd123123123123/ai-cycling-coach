"""Tests for the individualized Banister fitness-fatigue (impulse-response) fit."""
from __future__ import annotations

import math

import pytest

from app.services.impulse_response import fit_fitness_fatigue


def _banister(tss, day, tau1, tau2, k1, k2, p0):
    fit = sum(tss[i] * math.exp(-(day - i) / tau1) for i in range(day + 1))
    fat = sum(tss[i] * math.exp(-(day - i) / tau2) for i in range(day + 1))
    return p0 + k1 * fit - k2 * fat


# Deterministic 90-day load: a repeating build week (hard Tue/Thu/Sat, rest Sun).
_PATTERN = [60, 90, 40, 95, 30, 110, 0]
TSS = [float(_PATTERN[d % 7]) for d in range(90)]
TRUE = dict(tau1=42.0, tau2=7.0, k1=1.0, k2=2.0, p0=100.0)
PERF_DAYS = [30, 45, 60, 75, 89]
PERF = {d: _banister(TSS, d, **TRUE) for d in PERF_DAYS}


class TestFitFitnessFatigue:
    def test_recovers_a_well_fitting_model(self):
        model = fit_fitness_fatigue(TSS, PERF)
        assert model is not None
        # The fit must explain the synthetic performance almost perfectly.
        assert model.r_squared > 0.98
        # Fitness decays slower than fatigue — a hard physiological invariant.
        assert model.tau1 > model.tau2

    def test_prediction_matches_truth(self):
        model = fit_fitness_fatigue(TSS, PERF)
        predicted = model.predict(TSS, 60)
        assert predicted == pytest.approx(PERF[60], rel=0.02)

    def test_too_few_performance_points_returns_none(self):
        assert fit_fitness_fatigue(TSS, {30: 150.0, 60: 160.0}) is None

    def test_empty_inputs_return_none(self):
        assert fit_fitness_fatigue([], {}) is None
