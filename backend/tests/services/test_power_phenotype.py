"""Tests for rider-type phenotyping from the power-duration curve shape."""
from __future__ import annotations

from app.services.power_phenotype import power_phenotype


def _peaks(cp, m5, m60, m300):
    """Peaks as multiples of CP."""
    return {"5": cp * m5, "60": cp * m60, "300": cp * m300, "1200": cp}


class TestPowerPhenotype:
    def test_sprinter_has_big_neuromuscular_reserve(self):
        p = power_phenotype(250.0, _peaks(250, 3.2, 2.2, 1.25))
        assert p["type"] == "Sprinter"

    def test_pursuiter_has_big_vo2_reserve(self):
        # 5-min power far above typical, sprint near typical.
        p = power_phenotype(250.0, _peaks(250, 2.3, 1.7, 1.45))
        assert p["type"] == "Pursuiter"

    def test_time_trialist_has_low_anaerobic_reserve(self):
        p = power_phenotype(300.0, _peaks(300, 1.8, 1.4, 1.08))
        assert p["type"] == "Time Trialist"

    def test_all_rounder_is_balanced(self):
        p = power_phenotype(260.0, _peaks(260, 2.4, 1.7, 1.18))
        assert p["type"] == "All-Rounder"

    def test_returns_note(self):
        p = power_phenotype(250.0, _peaks(250, 3.2, 2.2, 1.25))
        assert p["note"]

    def test_missing_data_returns_none(self):
        assert power_phenotype(None, {"5": 600}) is None
        assert power_phenotype(250.0, {"5": 600}) is None  # missing 60/300
        assert power_phenotype(0.0, {"5": 600, "60": 400, "300": 300}) is None
