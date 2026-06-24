"""Tests for the training-intensity-distribution (TID) optimizer."""
from __future__ import annotations

from app.services.tid_optimizer import assess_tid, classify_tid


class TestClassifyTID:
    def test_polarized(self):
        assert classify_tid(0.80, 0.05, 0.15) == "polarized"

    def test_pyramidal(self):
        assert classify_tid(0.70, 0.20, 0.10) == "pyramidal"

    def test_threshold(self):
        assert classify_tid(0.50, 0.40, 0.10) == "threshold"

    def test_high_intensity(self):
        assert classify_tid(0.40, 0.20, 0.40) == "high_intensity"

    def test_accepts_percentages_and_normalizes(self):
        # Percentages (sum 100) classify the same as fractions (sum 1).
        assert classify_tid(80, 5, 15) == "polarized"


class TestAssessTID:
    def test_polarized_in_peak_is_aligned(self):
        a = assess_tid(0.80, 0.05, 0.15, phase="peak")
        assert a.model == "polarized"
        assert a.target == "polarized"
        assert a.aligned is True

    def test_pyramidal_in_peak_is_misaligned_and_recommends_polarizing(self):
        a = assess_tid(0.70, 0.22, 0.08, phase="peak")
        assert a.model == "pyramidal"
        assert a.target == "polarized"
        assert a.aligned is False
        assert "polari" in a.recommendation.lower()

    def test_pyramidal_in_base_is_aligned(self):
        a = assess_tid(0.78, 0.15, 0.07, phase="base2")
        assert a.target == "pyramidal"
        assert a.aligned is True
