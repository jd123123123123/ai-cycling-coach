"""Unit tests for the challenge subsystem's pure logic (services/challenges)."""
from datetime import date

import pytest

from app.services import challenges as ch


class TestPeriod:
    def test_current_period_format(self):
        assert ch.current_period(date(2026, 8, 12)) == "2026-08"
        assert ch.current_period(date(2026, 1, 3)) == "2026-01"

    def test_period_bounds_full_month(self):
        assert ch.period_bounds("2026-08") == (date(2026, 8, 1), date(2026, 8, 31))

    def test_period_bounds_february_leap(self):
        assert ch.period_bounds("2028-02") == (date(2028, 2, 1), date(2028, 2, 29))

    def test_period_bounds_february_common(self):
        assert ch.period_bounds("2026-02") == (date(2026, 2, 1), date(2026, 2, 28))


class TestCompletion:
    def test_complete_at_or_above_target(self):
        assert ch.is_complete(20, 20) is True
        assert ch.is_complete(21, 20) is True

    def test_incomplete_below_target(self):
        assert ch.is_complete(19.9, 20) is False

    def test_zero_target_never_completes(self):
        assert ch.is_complete(5, 0) is False


class TestPct:
    def test_partway(self):
        assert ch.pct(300, 600) == 50

    def test_clamped_to_100(self):
        assert ch.pct(900, 600) == 100

    def test_zero_target(self):
        assert ch.pct(5, 0) == 0


class TestCatalog:
    def test_every_metric_is_scoreable(self):
        from app.services.crew_score import CHALLENGE_METRICS
        assert all(t.metric in CHALLENGE_METRICS for t in ch.CATALOG)

    def test_tier_rewards_ordered_within_shop_scale(self):
        # bronze < silver < gold, and all at or under a mid shop item (900).
        assert ch.TIER_REWARD["bronze"] < ch.TIER_REWARD["silver"] < ch.TIER_REWARD["gold"]
        assert ch.TIER_REWARD["gold"] <= 900

    def test_reward_rc_matches_tier(self):
        for t in ch.CATALOG:
            assert t.reward_rc == ch.TIER_REWARD[t.tier]

    def test_keys_unique(self):
        keys = [t.key for t in ch.CATALOG]
        assert len(keys) == len(set(keys))

    def test_unknown_key_is_not_in_catalog(self):
        # join() guards on _BY_KEY.get(key) is None → ValueError before any I/O.
        assert ch._BY_KEY.get("does_not_exist") is None
        assert ch._BY_KEY.get(ch.CATALOG[0].key) is ch.CATALOG[0]
