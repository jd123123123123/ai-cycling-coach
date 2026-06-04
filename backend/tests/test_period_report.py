"""Unit tests for the period_report pure scoring core."""
from __future__ import annotations

from app.services.period_report import (
    WindowMetrics,
    _clamp,
    _inv_score,
    _lerp_score,
    build_deltas,
    build_milestones,
    build_radar,
    composite_grade,
    letter_for_score,
)


class TestHelpers:
    def test_clamp_bounds(self):
        assert _clamp(-5) == 0.0
        assert _clamp(150) == 100.0
        assert _clamp(42) == 42.0

    def test_lerp_score_maps_range_to_0_100(self):
        assert _lerp_score(0, 0, 10) == 0.0
        assert _lerp_score(10, 0, 10) == 100.0
        assert _lerp_score(5, 0, 10) == 50.0
        assert _lerp_score(-3, 0, 10) == 0.0
        assert _lerp_score(99, 0, 10) == 100.0

    def test_inv_score_is_higher_when_value_lower(self):
        assert _inv_score(0, 0, 10) == 100.0
        assert _inv_score(10, 0, 10) == 0.0
        assert _inv_score(2.5, 0, 10) == 75.0


class TestLetterBanding:
    def test_bands(self):
        assert letter_for_score(95) == "A+"
        assert letter_for_score(91) == "A"
        assert letter_for_score(88) == "A-"
        assert letter_for_score(84) == "B+"
        assert letter_for_score(81) == "B"
        assert letter_for_score(78) == "B-"
        assert letter_for_score(74) == "C+"
        assert letter_for_score(70) == "C"
        assert letter_for_score(66) == "C-"
        assert letter_for_score(50) == "D"

    def test_monotonic_non_increasing_grade(self):
        for s in range(100, -1, -5):
            letter_for_score(s)
