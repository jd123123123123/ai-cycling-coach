"""Tests for Skiba differential W′-balance."""
from __future__ import annotations

import pytest

from app.services.w_balance import (
    w_balance_summary,
    w_prime_balance,
    w_prime_balance_step,
)

CP = 250.0
W_PRIME = 20000.0


class TestWPrimeBalance:
    def test_below_cp_stays_full(self):
        series = w_prime_balance([200.0] * 300, CP, W_PRIME)
        assert series[-1] == pytest.approx(W_PRIME, abs=1.0)

    def test_above_cp_depletes_linearly(self):
        # 100 s at 350 W = 100 W over CP → drains 100*100 = 10 000 J.
        series = w_prime_balance([350.0] * 100, CP, W_PRIME)
        assert series[-1] == pytest.approx(W_PRIME - 10000.0, abs=1.0)

    def test_recovers_below_cp_after_depletion(self):
        # Deplete hard, then soft-pedal far below CP → W′bal climbs back up.
        effort = [350.0] * 100 + [120.0] * 200
        series = w_prime_balance(effort, CP, W_PRIME)
        depleted = series[99]
        recovered = series[-1]
        assert recovered > depleted
        assert recovered <= W_PRIME + 1e-6  # never over-fills


class TestWPrimeBalanceStep:
    """The simulator needs to carry W' forward from an arbitrary balance.

    w_prime_balance always starts from a full tank, which is right for a ridden
    file and wrong for a march that must react to depletion as it happens. One
    recurrence, two callers -- never two copies of the same physiology.
    """

    def test_above_cp_depletes_by_the_excess(self):
        assert w_prime_balance_step(20000.0, 300.0, 250.0, 20000.0) == 19950.0

    def test_below_cp_recharges_toward_full(self):
        out = w_prime_balance_step(10000.0, 200.0, 250.0, 20000.0)
        assert 10000.0 < out < 20000.0

    def test_never_exceeds_w_prime(self):
        assert w_prime_balance_step(19999.0, 100.0, 250.0, 20000.0) <= 20000.0

    def test_series_matches_the_step_applied_repeatedly(self):
        powers = [300.0, 300.0, 200.0, 400.0]
        series = w_prime_balance(powers, 250.0, 20000.0)
        bal = 20000.0
        manual = []
        for p in powers:
            bal = w_prime_balance_step(bal, p, 250.0, 20000.0)
            manual.append(bal)
        assert series == manual


class TestWBalanceSummary:
    def test_flags_exhaustion_when_w_prime_goes_negative(self):
        # Sustained 450 W (200 over CP) for 120 s = 24 000 J > W′ (20 000) → bonk.
        res = w_balance_summary([450.0] * 120, CP, W_PRIME)
        assert res.depleted is True
        assert res.min_w_prime_bal_j < 0

    def test_steady_endurance_is_not_depleted(self):
        res = w_balance_summary([200.0] * 600, CP, W_PRIME)
        assert res.depleted is False
        assert res.min_w_prime_bal_j > 0

    def test_empty_series_returns_full_and_not_depleted(self):
        res = w_balance_summary([], CP, W_PRIME)
        assert res.depleted is False
        assert res.min_w_prime_bal_j == pytest.approx(W_PRIME)
