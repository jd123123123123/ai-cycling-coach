"""Tests for cross-ride MMP aggregation → athlete-level Critical Power."""
from __future__ import annotations

import pytest

from app.services.athlete_power_profile import aggregate_mmp_curves, fit_athlete_cp


class TestAggregateMMP:
    def test_takes_best_power_at_each_duration(self):
        curves = [
            {60: 400.0, 300: 300.0, 1200: 250.0},
            {60: 450.0, 300: 290.0, 1200: 255.0},
        ]
        agg = aggregate_mmp_curves(curves)
        assert agg == {60: 450.0, 300: 300.0, 1200: 255.0}

    def test_handles_string_keys_from_json(self):
        # Stored mmp_curve JSON has string duration keys.
        curves = [{"300": 300.0, "1200": 250.0}, {"300": 310.0}]
        agg = aggregate_mmp_curves(curves)
        assert agg[300] == 310.0
        assert agg[1200] == 250.0

    def test_unions_durations_across_rides(self):
        curves = [{60: 500.0}, {1200: 240.0}]
        assert aggregate_mmp_curves(curves) == {60: 500.0, 1200: 240.0}

    def test_empty_returns_empty(self):
        assert aggregate_mmp_curves([]) == {}
        assert aggregate_mmp_curves([{}, {}]) == {}


class TestFitAthleteCP:
    def test_fits_cp_from_aggregate_of_distinct_efforts(self):
        # Best 3-min from a hard day, best 12-min from a long day → a real
        # athlete power-duration relationship the single rides couldn't give.
        curves = [
            {180: 340.0, 300: 315.0},   # short-effort day
            {720: 278.0, 1200: 267.0},  # long-effort day
        ]
        fit = fit_athlete_cp(curves)
        assert fit is not None
        assert 230.0 < fit.cp_watts < 290.0
        assert fit.w_prime_j > 0

    def test_insufficient_data_returns_none(self):
        assert fit_athlete_cp([{300: 300.0}]) is None
        assert fit_athlete_cp([]) is None
