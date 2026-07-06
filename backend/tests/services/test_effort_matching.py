"""Tests for matching a ride's peak efforts against the athlete's best."""
from __future__ import annotations

from app.services.effort_matching import EffortMatch, match_efforts


class TestMatchEfforts:
    def test_pct_of_best_computed(self):
        ride = {60: 400.0, 300: 320.0}
        best = {60: 500.0, 300: 320.0}
        out = {m.duration_s: m for m in match_efforts(ride, best)}
        assert out[60].pct_of_best == 80.0
        assert out[300].pct_of_best == 100.0

    def test_new_pr_flagged(self):
        ride = {300: 340.0}
        best = {300: 320.0}
        assert match_efforts(ride, best)[0].is_pr is True

    def test_not_a_pr_when_below_best(self):
        ride = {300: 300.0}
        best = {300: 320.0}
        assert match_efforts(ride, best)[0].is_pr is False

    def test_missing_best_yields_none_pct_and_pr_true(self):
        # No prior best at this duration → it's a PR by definition, pct None.
        ride = {1200: 290.0}
        out = match_efforts(ride, {})
        assert out[0].best_watts is None
        assert out[0].pct_of_best is None
        assert out[0].is_pr is True

    def test_sorted_by_duration_and_handles_str_keys(self):
        ride = {"300": 320.0, "5": 900.0, "60": 400.0}
        best = {"300": 340.0, "5": 950.0, "60": 380.0}
        durations = [m.duration_s for m in match_efforts(ride, best)]
        assert durations == [5, 60, 300]

    def test_empty_ride_returns_empty(self):
        assert match_efforts({}, {60: 500.0}) == []
