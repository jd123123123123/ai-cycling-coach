"""Unit tests for the RideCoin earn rules (pure functions in services/rewards).

These lock the spec's guardrails
(docs/superpowers/specs/2026-08-12-ridecoin-point-system-design.md):
- 1 RC per TSS, capped at 150/ride;
- streak multiplier tiered and hard-capped at ×1.5;
- challenge bonus computed on base and capped;
- shop-tier progress and the equal onboarding grant.
"""
import pytest

from app.models.rewards import (
    ONBOARDING_REASONS,
    REASON_ONBOARDING_BIKE,
    REASON_ONBOARDING_DEVICE,
    REASON_ONBOARDING_PHOTO,
)
from app.services import rewards


class TestBaseRideRc:
    def test_one_rc_per_tss(self):
        assert rewards.base_ride_rc(65) == 65

    def test_rounds_to_nearest(self):
        assert rewards.base_ride_rc(64.4) == 64
        assert rewards.base_ride_rc(64.6) == 65

    def test_soft_cap_at_150(self):
        # A 5-hour epic (TSS 300) still earns only the cap.
        assert rewards.base_ride_rc(300) == rewards.PER_RIDE_SOFT_CAP == 150

    def test_no_tss_earns_nothing(self):
        assert rewards.base_ride_rc(None) == 0
        assert rewards.base_ride_rc(0) == 0
        assert rewards.base_ride_rc(-5) == 0


class TestStreakMultiplier:
    @pytest.mark.parametrize(
        "days,expected",
        [(0, 1.0), (1, 1.0), (2, 1.0), (3, 1.1), (6, 1.1),
         (7, 1.25), (13, 1.25), (14, 1.4), (29, 1.4), (30, 1.5), (365, 1.5)],
    )
    def test_tiers(self, days, expected):
        assert rewards.streak_multiplier(days) == expected

    def test_hard_ceiling(self):
        # No streak, however long, ever exceeds ×1.5.
        assert rewards.streak_multiplier(10_000) == 1.5


class TestRideAward:
    def test_no_streak_is_base_only(self):
        a = rewards.ride_award(65, streak_days=1)
        assert a == {"base": 65, "multiplier": 1.0, "streak_bonus": 0, "total": 65}

    def test_streak_lifts_total_and_records_bonus(self):
        a = rewards.ride_award(80, streak_days=14)  # ×1.4
        assert a["base"] == 80
        assert a["multiplier"] == 1.4
        assert a["total"] == 112
        assert a["streak_bonus"] == 32

    def test_cap_applies_before_multiplier(self):
        # TSS 200 -> base capped at 150, then ×1.5 = 225.
        a = rewards.ride_award(200, streak_days=30)
        assert a["base"] == 150
        assert a["total"] == 225


class TestChallengeBonus:
    def test_computed_on_base_additively(self):
        # Silver ×1.5 on 400 base RC -> +200 bonus.
        assert rewards.challenge_bonus(400, "silver") == 200

    def test_gold_capped(self):
        # Gold ×2.0 would be +2000 on 2500 base, but the cap trims to 1000.
        assert rewards.challenge_bonus(2500, "gold") == rewards.CHALLENGE_BONUS_CAP

    def test_unknown_tier_is_zero(self):
        assert rewards.challenge_bonus(400, "platinum") == 0
        assert rewards.challenge_bonus(0, "gold") == 0


class TestOnboardingGrant:
    def test_equal_start_totals_400(self):
        # Requirement #1: everyone starts at exactly the same number —
        # 125 photo + 125 device + 150 bike. The onboarding rewards screen and
        # frontend/src/api/rewards.ts quote this total.
        assert rewards.ONBOARDING_TOTAL_RC == 400
        assert rewards.ONBOARDING_PHOTO_RC == rewards.ONBOARDING_DEVICE_RC == 125
        assert rewards.ONBOARDING_BIKE_RC == 150

    def test_every_reason_has_an_explicit_price(self):
        # The amount must never be inferred from the reason string again: the
        # map and the closed reason vocabulary cover each other exactly.
        assert set(rewards.ONBOARDING_GRANT_RC) == ONBOARDING_REASONS
        assert sum(rewards.ONBOARDING_GRANT_RC.values()) == rewards.ONBOARDING_TOTAL_RC

    def test_bike_is_priced_as_a_bike_not_as_a_device(self):
        # Regression: the old `reason.endswith("photo") else DEVICE` guess paid
        # the device amount for anything that wasn't the photo grant.
        assert rewards.ONBOARDING_GRANT_RC[REASON_ONBOARDING_BIKE] == 150
        assert rewards.ONBOARDING_GRANT_RC[REASON_ONBOARDING_BIKE] != rewards.ONBOARDING_DEVICE_RC
        assert rewards.ONBOARDING_GRANT_RC[REASON_ONBOARDING_PHOTO] == 125
        assert rewards.ONBOARDING_GRANT_RC[REASON_ONBOARDING_DEVICE] == 125

    def test_price_map_and_reason_vocabulary_cannot_drift(self):
        # The import-time guard is the thing that makes adding a fourth grant
        # loud instead of silent.
        original = dict(rewards.ONBOARDING_GRANT_RC)
        try:
            rewards.ONBOARDING_GRANT_RC.pop(REASON_ONBOARDING_BIKE)
            with pytest.raises(RuntimeError):
                rewards._check_onboarding_prices()
        finally:
            rewards.ONBOARDING_GRANT_RC.clear()
            rewards.ONBOARDING_GRANT_RC.update(original)
        rewards._check_onboarding_prices()  # restored -> quiet again

    @pytest.mark.asyncio
    async def test_unknown_reason_is_rejected(self):
        # A non-onboarding reason never reaches the ledger (raises before any
        # DB work, so no session is needed).
        with pytest.raises(ValueError):
            await rewards.grant_onboarding(None, 1, "ride_earn")  # type: ignore[arg-type]


class TestTierProgress:
    # The ladder is anchored to the REAL catalogue: 600 common gear, 1800 rare
    # gear, 4500 legendary gear, 15000 top bike. A gauge against prices nothing
    # sells at measured progress toward fiction.
    def test_head_start_is_partway_to_entry(self):
        # The 400 RC head start sits inside the 600 entry tier (common gear).
        p = rewards.tier_progress(rewards.ONBOARDING_TOTAL_RC)
        assert p["next_tier"] == "entry"
        assert p["next_price"] == 600
        assert p["to_go"] == 200

    def test_partway_to_entry(self):
        # 450 against the 600 entry tier -> 75% of the way.
        p = rewards.tier_progress(450)
        assert p["next_tier"] == "entry"
        assert p["next_price"] == 600
        assert p["to_go"] == 150
        assert p["pct"] == 75

    def test_progress_spans_between_tiers(self):
        # 1800 unlocks mid exactly; next target is prestige (4500), span 1800->4500.
        p = rewards.tier_progress(1800)
        assert p["next_tier"] == "prestige"
        assert p["pct"] == 0

    def test_above_top_tier_is_maxed(self):
        p = rewards.tier_progress(20_000)
        assert p["next_tier"] is None
        assert p["pct"] == 100
        assert p["to_go"] == 0

    def test_tiers_match_the_catalogue(self):
        # entry/mid/prestige mirror earn_modifiers.PRICE_BY_RARITY so the two
        # ladders cannot drift apart silently.
        from app.services.earn_modifiers import PRICE_BY_RARITY

        prices = dict(rewards.SHOP_TIERS)
        assert prices["entry"] == PRICE_BY_RARITY["common"]
        assert prices["mid"] == PRICE_BY_RARITY["rare"]
        assert prices["prestige"] == PRICE_BY_RARITY["legendary"]
