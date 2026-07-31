"""Prediction next to outcome — the one place this page can be checked.

The refusals matter more than the arithmetic. Comparing a full simulation
against a truncated ride would report a huge "model error" for a model that
was never wrong, and that number would then poison the band calibration.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.verdict_vs_actual import (
    DISTANCE_TOLERANCE_PCT,
    compare_to_actual,
)


class TestComparison:
    def test_a_prediction_that_was_slow_reports_positive_error(self):
        c = compare_to_actual(
            predicted_time_s=18000.0,   # 5:00 predicted
            actual_time_s=17100.0,      # 4:45 ridden
            rehearsed_distance_m=100_000.0,
            actual_distance_m=100_000.0,
        )
        assert c is not None
        assert c.error_s == pytest.approx(900.0)
        assert c.error_pct > 0

    def test_a_prediction_that_was_optimistic_reports_negative_error(self):
        c = compare_to_actual(
            predicted_time_s=17100.0,
            actual_time_s=18000.0,
            rehearsed_distance_m=100_000.0,
            actual_distance_m=100_000.0,
        )
        assert c.error_s < 0
        assert c.error_pct < 0


class TestBandCoverage:
    def test_reports_when_the_outcome_landed_inside_the_band(self):
        c = compare_to_actual(
            predicted_time_s=18000.0,
            actual_time_s=17500.0,
            rehearsed_distance_m=100_000.0,
            actual_distance_m=100_000.0,
            band_p10_s=17000.0,
            band_p90_s=19000.0,
        )
        assert c.inside_band is True

    def test_reports_when_it_did_not(self):
        """The real test of a band: one that never contains the outcome is too
        narrow however good its centre."""
        c = compare_to_actual(
            predicted_time_s=18000.0,
            actual_time_s=15000.0,
            rehearsed_distance_m=100_000.0,
            actual_distance_m=100_000.0,
            band_p10_s=17000.0,
            band_p90_s=19000.0,
        )
        assert c.inside_band is False

    def test_says_nothing_about_a_band_it_was_not_given(self):
        c = compare_to_actual(
            predicted_time_s=18000.0,
            actual_time_s=17500.0,
            rehearsed_distance_m=100_000.0,
            actual_distance_m=100_000.0,
        )
        assert c.inside_band is None


class TestRefusals:
    def test_no_recorded_time_means_no_comparison_not_a_zero(self):
        assert (
            compare_to_actual(
                predicted_time_s=18000.0,
                actual_time_s=None,
                rehearsed_distance_m=100_000.0,
                actual_distance_m=100_000.0,
            )
            is None
        )

    def test_no_prediction_means_no_comparison(self):
        assert (
            compare_to_actual(
                predicted_time_s=None,
                actual_time_s=17100.0,
                rehearsed_distance_m=100_000.0,
                actual_distance_m=100_000.0,
            )
            is None
        )

    def test_refuses_a_ride_that_was_cut_short(self):
        """A truncated stream is not a slow rider. Comparing 100 km of
        simulation against 60 km of ride would invent a 40% model error."""
        assert (
            compare_to_actual(
                predicted_time_s=18000.0,
                actual_time_s=10000.0,
                rehearsed_distance_m=100_000.0,
                actual_distance_m=60_000.0,
            )
            is None
        )

    def test_tolerates_ordinary_gps_drift(self):
        drift = 100_000.0 * (1 + (DISTANCE_TOLERANCE_PCT - 1) / 100.0)
        c = compare_to_actual(
            predicted_time_s=18000.0,
            actual_time_s=17100.0,
            rehearsed_distance_m=100_000.0,
            actual_distance_m=drift,
        )
        assert c is not None

    def test_compares_when_the_recorded_distance_is_unknown(self):
        # Absence of a distance is not evidence of a mismatch.
        c = compare_to_actual(
            predicted_time_s=18000.0,
            actual_time_s=17100.0,
            rehearsed_distance_m=100_000.0,
            actual_distance_m=None,
        )
        assert c is not None
