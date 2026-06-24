"""Tests for menstrual-cycle-phase training adjustment."""
from __future__ import annotations

from app.services.menstrual_adjustment import (
    cycle_phase_from_day,
    menstrual_adjustment,
)


class TestCyclePhase:
    def test_phase_mapping_default_28_day(self):
        assert cycle_phase_from_day(3) == "menstrual"
        assert cycle_phase_from_day(9) == "follicular"
        assert cycle_phase_from_day(14) == "ovulatory"
        assert cycle_phase_from_day(18) == "early_luteal"
        assert cycle_phase_from_day(26) == "late_luteal"

    def test_invalid_day_returns_none(self):
        assert cycle_phase_from_day(0) is None
        assert cycle_phase_from_day(None) is None


class TestMenstrualAdjustment:
    def test_follicular_supports_intensity(self):
        adj = menstrual_adjustment(cycle_day=9)
        assert adj.phase == "follicular"
        assert adj.readiness_delta >= 0

    def test_late_luteal_with_symptoms_reduces_readiness(self):
        adj = menstrual_adjustment(cycle_day=26, symptom_severity=3)
        assert adj.phase == "late_luteal"
        assert adj.readiness_delta < 0
        assert adj.intensity_note  # non-empty guidance

    def test_no_cycle_data_is_neutral(self):
        adj = menstrual_adjustment(cycle_day=None)
        assert adj.readiness_delta == 0
        assert adj.phase is None

    def test_delta_is_bounded(self):
        # Even worst-case symptoms can't swing readiness by more than 10 points.
        adj = menstrual_adjustment(cycle_day=27, symptom_severity=10)
        assert -10 <= adj.readiness_delta <= 0
