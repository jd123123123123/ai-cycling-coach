"""Tests for mountain_event_template — routes quality days to climbing /
low-cadence variants for fondo / race athletes in the event-specificity window.

A mountain gran fondo (e.g. Maratona dles Dolomites) is bottlenecked by
sustained low-cadence climbing endurance, not generic Z2 hours. During the
specificity (Issurin transmutation) window every quality day should carry a
climbing-specific stimulus, not just the Saturday long ride.
"""
from __future__ import annotations

from app.services.training_periodization import mountain_event_template
from app.services.workout_templates import TEMPLATES


class TestMountainEventTemplate:
    def test_saturday_endurance_is_climbing_long(self):
        tid = mountain_event_template(
            session_type="endurance",
            event_type="fondo",
            days_to_event=20,
            day_of_week=5,  # Saturday
        )
        assert tid == "z2_climbing_long"

    def test_weekday_endurance_has_no_climbing_pin(self):
        """Easy mid-week aerobic days stay generic — climbing long ride is the
        weekend keystone, not every easy day."""
        tid = mountain_event_template(
            session_type="endurance",
            event_type="fondo",
            days_to_event=20,
            day_of_week=2,  # Wednesday
        )
        assert tid is None

    def test_tempo_routes_to_low_cadence_force(self):
        tid = mountain_event_template(
            session_type="tempo", event_type="fondo", days_to_event=20, day_of_week=2
        )
        assert tid == "cadence_low_lcf_4x6"

    def test_threshold_routes_to_hill_reps(self):
        tid = mountain_event_template(
            session_type="threshold", event_type="fondo", days_to_event=20, day_of_week=3
        )
        assert tid == "threshold_hill_4x10"

    def test_vo2_routes_to_hill_intervals(self):
        tid = mountain_event_template(
            session_type="vo2", event_type="fondo", days_to_event=20, day_of_week=1
        )
        assert tid == "vo2_hill_6x3"

    def test_race_event_also_gets_climbing(self):
        tid = mountain_event_template(
            session_type="threshold", event_type="race", days_to_event=30, day_of_week=2
        )
        assert tid == "threshold_hill_4x10"

    def test_outside_specificity_window_returns_none(self):
        """Too far out (>56d) — save climbing specificity for the transmutation
        block; build generic capacity first."""
        assert (
            mountain_event_template(
                session_type="threshold", event_type="fondo", days_to_event=120, day_of_week=2
            )
            is None
        )

    def test_inside_taper_proximity_returns_none(self):
        """<14 days — final freshening, no heavy climbing blocks."""
        assert (
            mountain_event_template(
                session_type="threshold", event_type="fondo", days_to_event=10, day_of_week=2
            )
            is None
        )

    def test_non_mountain_event_returns_none(self):
        assert (
            mountain_event_template(
                session_type="threshold", event_type="maintenance", days_to_event=30, day_of_week=2
            )
            is None
        )

    def test_no_event_type_returns_none(self):
        assert (
            mountain_event_template(
                session_type="threshold", event_type=None, days_to_event=30, day_of_week=2
            )
            is None
        )

    def test_recovery_day_returns_none(self):
        """Easy/recovery days are never overridden to climbing."""
        assert (
            mountain_event_template(
                session_type="recovery", event_type="fondo", days_to_event=20, day_of_week=0
            )
            is None
        )

    def test_all_returned_ids_are_real_templates(self):
        for st, dow in [("endurance", 5), ("tempo", 2), ("threshold", 3), ("vo2", 1)]:
            tid = mountain_event_template(
                session_type=st, event_type="fondo", days_to_event=20, day_of_week=dow
            )
            assert tid in TEMPLATES, f"{st} -> {tid}"
