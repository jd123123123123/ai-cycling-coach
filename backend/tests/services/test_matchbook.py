"""Tests for anaerobic matchbook detection from W′-balance."""
from __future__ import annotations

from app.services.matchbook import Match, Matchbook, analyze_matchbook


class TestAnalyzeMatchbook:
    def test_none_on_bad_capacity(self):
        assert analyze_matchbook([300.0] * 60, cp=0.0, w_prime=20000.0) is None
        assert analyze_matchbook([300.0] * 60, cp=250.0, w_prime=0.0) is None
        assert analyze_matchbook([], cp=250.0, w_prime=20000.0) is None

    def test_easy_ride_burns_no_matches(self):
        # All power below CP → W′ stays topped up → no matches, no time above CP.
        mb = analyze_matchbook([200.0] * 600, cp=250.0, w_prime=20000.0)
        assert mb.match_count == 0
        assert mb.time_above_cp_s == 0
        assert mb.fully_depleted is False

    def test_counts_time_above_cp(self):
        power = [200.0] * 300 + [400.0] * 60 + [200.0] * 300
        mb = analyze_matchbook(power, cp=250.0, w_prime=20000.0)
        assert mb.time_above_cp_s == 60

    def test_detects_a_hard_match(self):
        # A big surge that draws down a large chunk of W′, then easy recovery.
        power = [150.0] * 120 + [500.0] * 40 + [150.0] * 300
        mb = analyze_matchbook(power, cp=250.0, w_prime=20000.0, match_depth_frac=0.3)
        assert mb.match_count >= 1
        assert mb.matches[0].depth_j > 0.3 * 20000.0

    def test_full_depletion_flagged(self):
        # Sustained way over CP with small W′ → balance goes to/below 0.
        power = [600.0] * 120
        mb = analyze_matchbook(power, cp=250.0, w_prime=10000.0)
        assert mb.fully_depleted is True
        assert mb.min_bal_j <= 0
