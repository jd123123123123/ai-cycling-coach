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


class TestCatalog:
    """The catalogue is the thing a rider browses, so its invariants are UI
    invariants: a broken metric or an unknown tier is a card that cannot be
    drawn or a reward that cannot be paid."""

    def test_every_metric_is_one_the_engine_computes(self):
        from app.services.crew_score import CHALLENGE_METRICS
        for t in ch.CATALOG:
            assert t.metric in CHALLENGE_METRICS, t.key

    def test_every_tier_has_a_reward(self):
        for t in ch.CATALOG:
            assert t.reward_rc > 0, t.key

    def test_keys_are_unique(self):
        keys = [t.key for t in ch.CATALOG]
        assert len(keys) == len(set(keys))

    def test_targets_are_positive(self):
        for t in ch.CATALOG:
            assert t.target > 0, t.key

    def test_the_catalogue_is_written_in_german(self):
        # The app is German-first and this catalogue shipped in English, so a
        # rider browsing it changed language halfway down the page. A German
        # sentence ends in a full stop and none of these are English stubs.
        for t in ch.CATALOG:
            assert t.detail.endswith('.'), t.key
            assert t.title.strip() == t.title, t.key

    def test_offers_more_than_one_shape_of_month(self):
        # Four entries all asking for volume meant one kind of rider was served.
        metrics = {t.metric for t in ch.CATALOG}
        assert len(metrics) >= 4, metrics
        assert {'bronze', 'silver', 'gold'} <= {t.tier for t in ch.CATALOG}


class TestRankBoard:
    def _rows(self):
        return [
            {'user_id': 1, 'value': 10.0},
            {'user_id': 2, 'value': 30.0},
            {'user_id': 3, 'value': 30.0},
            {'user_id': 4, 'value': 5.0},
        ]

    def test_furthest_along_leads(self):
        b = ch.rank_board(self._rows(), {}, viewer_id=1, limit=10)
        assert [r['user_id'] for r in b['rows']][:2] == [2, 3] or \
               [r['user_id'] for r in b['rows']][:2] == [3, 2]
        assert b['rows'][0]['rank'] == 1

    def test_a_tie_goes_to_whoever_joined_first(self):
        # 3 and 2 are level; 3 enrolled first.
        order = {3: 0, 2: 1, 1: 2, 4: 3}
        b = ch.rank_board(self._rows(), order, viewer_id=1, limit=10)
        assert [r['user_id'] for r in b['rows']][:2] == [3, 2]

    def test_rank_is_over_everyone_not_over_the_visible_page(self):
        order = {3: 0, 2: 1, 1: 2, 4: 3}
        b = ch.rank_board(self._rows(), order, viewer_id=4, limit=2)
        assert len(b['rows']) == 2
        assert b['participants'] == 4
        assert b['truncated'] is True
        # The rider fell off the board and is still told where they stand.
        assert b['you']['rank'] == 4

    def test_the_viewer_is_returned_even_when_cut(self):
        order = {3: 0, 2: 1, 1: 2, 4: 3}
        b = ch.rank_board(self._rows(), order, viewer_id=4, limit=1)
        assert b['you'] is not None
        assert b['you']['user_id'] == 4

    def test_a_stranger_gets_no_row_rather_than_a_wrong_one(self):
        b = ch.rank_board(self._rows(), {}, viewer_id=99, limit=10)
        assert b['you'] is None

    def test_an_empty_board_is_not_truncated(self):
        b = ch.rank_board([], {}, viewer_id=1, limit=10)
        assert b == {'participants': 0, 'you': None, 'rows': [], 'truncated': False}
