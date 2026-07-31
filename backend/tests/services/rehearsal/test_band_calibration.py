"""The band's width, measured instead of assumed.

The design doc asked for exactly this and it was the biggest thing missing:
the sigmas in uncertainty.py are reasoned estimates, and until now nothing
checked whether the band they produce is the right width.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.band_calibration import (
    MIN_SAMPLES,
    calibrate_from_samples,
)


def _sample(actual: float, p50: float = 18000.0, halfwidth: float = 900.0) -> dict:
    return {
        "actual_time_s": actual,
        "p10_s": p50 - halfwidth,
        "p50_s": p50,
        "p90_s": p50 + halfwidth,
    }


class TestEvidenceThreshold:
    def test_refuses_to_calibrate_on_too_little(self):
        # Three rides is not a calibration; pretending otherwise trades a
        # stated assumption for an unstated overfit.
        assert calibrate_from_samples([_sample(18000.0)] * (MIN_SAMPLES - 1)) is None

    def test_calibrates_once_there_is_enough(self):
        assert calibrate_from_samples([_sample(18000.0)] * MIN_SAMPLES) is not None

    def test_a_run_of_dead_on_predictions_clamps_rather_than_vanishing(self):
        """z is 0 for every sample here. Unclamped that is a zero-width band,
        which would claim certainty no model has."""
        cal = calibrate_from_samples([_sample(18000.0)] * (MIN_SAMPLES + 2))
        assert cal is not None
        assert cal.spread_scale > 0

    def test_ignores_samples_with_no_band_width(self):
        """A zero-width band carries no information about width."""
        flat = {"actual_time_s": 18000.0, "p10_s": 100.0, "p50_s": 100.0, "p90_s": 100.0}
        assert calibrate_from_samples([flat] * (MIN_SAMPLES + 3)) is None

    def test_ignores_samples_with_no_recorded_time(self):
        empty = {"actual_time_s": None, "p10_s": 1.0, "p50_s": 2.0, "p90_s": 3.0}
        assert calibrate_from_samples([empty] * (MIN_SAMPLES + 3)) is None


class TestDirection:
    def test_a_band_that_was_too_narrow_is_widened(self):
        # Every outcome landed two halfwidths out: the band was half the width
        # it needed to be.
        samples = [_sample(18000.0 + 1800.0) for _ in range(MIN_SAMPLES + 3)]
        cal = calibrate_from_samples(samples)
        assert cal.spread_scale > 1.0
        assert cal.coverage == 0.0

    def test_a_band_that_was_too_wide_is_narrowed(self):
        # Every outcome landed almost exactly on the median.
        samples = [_sample(18000.0 + 20.0) for _ in range(MIN_SAMPLES + 3)]
        cal = calibrate_from_samples(samples)
        assert cal.spread_scale < 1.0
        assert cal.coverage == 1.0

    def test_a_well_calibrated_band_is_left_roughly_alone(self):
        """Outcomes spread evenly out to the band's edge — the 80th percentile
        sitting near one halfwidth is precisely what "honest width" means."""
        halfwidth = 900.0
        samples = [
            _sample(18000.0 + z / 10.0 * halfwidth, halfwidth=halfwidth)
            for z in range(1, 11)
        ]
        cal = calibrate_from_samples(samples)
        assert cal.spread_scale == pytest.approx(1.0, abs=0.25)


class TestCoverage:
    def test_counts_how_often_the_band_actually_contained_the_outcome(self):
        # Six of eight inside — the number worth showing a human.
        samples = [_sample(18000.0) for _ in range(6)]
        samples += [_sample(18000.0 + 5000.0), _sample(18000.0 - 5000.0)]
        cal = calibrate_from_samples(samples)
        assert cal.samples == 8
        assert cal.coverage == pytest.approx(6 / 8)


class TestRobustness:
    def test_calibrates_on_the_bad_days_not_the_average_one(self):
        """The band's job is to contain the bad days. A mean absolute error
        would be dominated by the ordinary ones, producing a band that is
        right on average and wrong exactly when it matters."""
        # Seven rides land on the nose, two land far out.
        samples = [_sample(18000.0) for _ in range(7)]
        samples += [_sample(18000.0 + 2700.0), _sample(18000.0 - 2700.0)]
        cal = calibrate_from_samples(samples)
        # A mean-based fit would sit near 0.67; the high quantile does not
        # shrug the outliers off.
        assert cal.spread_scale > 1.0
