"""Unit tests for safety_rails — every branch of every rule must be covered.

Rules under test:
    - max_tss_for_day: CTL × 1.3, clamped to 0 for non-positive CTL
    - intensity_ceiling: 6 distinct branches (injury / hrv / tsb<-30 / tsb<-10 /
      days_since_rest≥10 / default)
    - filter_recommendation: never drops options; marks blocked with a reason
    - scan_nutrition_advice: catches ED phrases, allows legitimate sports-nutrition terms
    - validate_chat_response: returns (False, canned-redirect) on ED hit
"""
from __future__ import annotations

import pytest

from app.services.safety_rails import (
    ED_KEYWORDS,
    SAFE_NUTRITION_REDIRECT,
    RailContext,
    filter_recommendation,
    intensity_ceiling,
    max_tss_for_day,
    scan_nutrition_advice,
    validate_chat_response,
)


def _ctx(
    *,
    ctl: float = 50.0,
    atl: float = 50.0,
    tsb: float = 0.0,
    hrv_delta_pct: float = 0.0,
    injury_flag: bool = False,
    days_since_rest: int = 3,
) -> RailContext:
    return RailContext(
        ctl=ctl,
        atl=atl,
        tsb=tsb,
        hrv_delta_pct=hrv_delta_pct,
        injury_flag=injury_flag,
        days_since_rest=days_since_rest,
    )


# ---------------------------------------------------------------------------
# max_tss_for_day
# ---------------------------------------------------------------------------

class TestMaxTssForDay:
    def test_ctl_50_caps_at_65(self):
        """CTL 50 × 1.3 = 65."""
        assert max_tss_for_day(50.0) == 65.0

    def test_ctl_100_caps_at_130(self):
        """CTL 100 → ceiling 130."""
        assert max_tss_for_day(100.0) == 130.0

    def test_zero_ctl_returns_zero(self):
        """CTL 0 (new athlete) — safe default is 0 rather than extrapolation."""
        assert max_tss_for_day(0.0) == 0.0

    def test_negative_ctl_returns_zero(self):
        """Negative CTL is meaningless but shouldn't raise — return 0."""
        assert max_tss_for_day(-5.0) == 0.0


# ---------------------------------------------------------------------------
# intensity_ceiling — one test per rule branch
# ---------------------------------------------------------------------------

class TestIntensityCeiling:
    def test_injury_always_rest(self):
        """Rule 1: injury_flag wins over everything, even great HRV/TSB."""
        ctx = _ctx(injury_flag=True, tsb=30, hrv_delta_pct=5)
        assert intensity_ceiling(ctx) == "rest"

    def test_hrv_suppressed_gives_easy(self):
        """Rule 2: HRV < -10% → easy."""
        ctx = _ctx(hrv_delta_pct=-12.0)
        assert intensity_ceiling(ctx) == "easy"

    def test_tsb_deep_negative_gives_easy(self):
        """Rule 3: TSB < -30 → easy."""
        ctx = _ctx(tsb=-35.0)
        assert intensity_ceiling(ctx) == "easy"

    def test_tsb_grey_zone_still_allows_push(self):
        """TSB -10..-25 is productive fatigue — build blocks live here, so the
        ceiling stays 'push' and intensity is governed by the acute markers,
        not the calendar TSB number."""
        ctx = _ctx(tsb=-15.0, hrv_delta_pct=2.0, days_since_rest=3)
        assert intensity_ceiling(ctx) == "push"

    def test_tsb_deep_grey_zone_gives_moderate(self):
        """Rule 8: TSB < -25 (deep grey zone, not yet the -30 'easy' line) → moderate."""
        ctx = _ctx(tsb=-27.0)
        assert intensity_ceiling(ctx) == "moderate"

    def test_forced_rest_after_10_days(self):
        """Rule 5: days_since_rest >= 10 → moderate."""
        ctx = _ctx(days_since_rest=10, tsb=5.0)
        assert intensity_ceiling(ctx) == "moderate"

    def test_default_is_push(self):
        """Rule 6: healthy signals → push allowed."""
        ctx = _ctx(tsb=5.0, hrv_delta_pct=2.0, days_since_rest=3)
        assert intensity_ceiling(ctx) == "push"

    def test_rule_priority_injury_beats_good_tsb(self):
        """Rule 1 > Rule 3 — injury flag trumps a fresh TSB."""
        ctx = _ctx(injury_flag=True, tsb=25.0)
        assert intensity_ceiling(ctx) == "rest"

    def test_rule_priority_hrv_beats_forced_rest(self):
        """Rule 2 > Rule 5 — HRV suppression is more severe than forced-rest day count."""
        ctx = _ctx(hrv_delta_pct=-15.0, days_since_rest=12)
        assert intensity_ceiling(ctx) == "easy"

    def test_exact_minus_10_hrv_is_not_yet_suppressed(self):
        """Boundary: exactly -10% HRV does NOT trigger (rule is strictly < -10)."""
        ctx = _ctx(hrv_delta_pct=-10.0, tsb=5.0, days_since_rest=1)
        assert intensity_ceiling(ctx) == "push"


# ---------------------------------------------------------------------------
# filter_recommendation
# ---------------------------------------------------------------------------

class TestFilterRecommendation:
    def _four_options(self) -> list[dict]:
        return [
            {"intensity": "rest",     "title": "Rest",       "why": "Recover", "tss_target": 0},
            {"intensity": "easy",     "title": "Easy spin",  "why": "Z1",      "tss_target": 40},
            {"intensity": "moderate", "title": "Tempo",      "why": "Sweet",   "tss_target": 80},
            {"intensity": "push",     "title": "VO2 max",    "why": "Hard",    "tss_target": 120},
        ]

    def test_never_drops_options(self):
        """All 4 options must survive the filter — count preserved."""
        ctx = _ctx(injury_flag=True, ctl=50)
        result = filter_recommendation(self._four_options(), ctx)
        assert len(result) == 4

    def test_injury_blocks_everything_but_rest(self):
        """Injury → only 'rest' allowed; others carry a block_reason."""
        ctx = _ctx(injury_flag=True, ctl=50)
        result = filter_recommendation(self._four_options(), ctx)
        assert result[0]["blocked"] is False  # rest survives
        assert result[0]["block_reason"] is None
        for opt in result[1:]:
            assert opt["blocked"] is True
            assert "injury" in opt["block_reason"].lower()

    def test_healthy_athlete_nothing_blocked_by_intensity(self):
        """Fresh athlete: all intensity options pass intensity check."""
        ctx = _ctx(ctl=200, tsb=5, hrv_delta_pct=0, days_since_rest=3)
        result = filter_recommendation(self._four_options(), ctx)
        # all 4 below the intensity ceiling, and TSS 120 < ceiling 260 (200*1.3)
        assert all(r["blocked"] is False for r in result)

    def test_tss_ceiling_blocks_overload_option(self):
        """TSS target > 1.3 × CTL gets flagged with the TSS-specific reason."""
        ctx = _ctx(ctl=50, tsb=5, hrv_delta_pct=0, days_since_rest=3)  # ceiling 65
        result = filter_recommendation(self._four_options(), ctx)
        push_opt = next(r for r in result if r["intensity"] == "push")
        assert push_opt["blocked"] is True
        assert "exceeds the daily ceiling" in push_opt["block_reason"]

    def test_blocked_reason_cites_hrv_when_hrv_trigger(self):
        """When HRV is the trigger, the reason string mentions HRV."""
        ctx = _ctx(hrv_delta_pct=-12.0, ctl=200)
        result = filter_recommendation(self._four_options(), ctx)
        push = next(r for r in result if r["intensity"] == "push")
        assert push["blocked"] is True
        assert "HRV" in push["block_reason"]

    def test_original_fields_preserved(self):
        """Title / why / tss_target round-trip unchanged through the filter."""
        ctx = _ctx()
        opts = self._four_options()
        result = filter_recommendation(opts, ctx)
        for original, after in zip(opts, result, strict=True):
            assert after["title"] == original["title"]
            assert after["why"] == original["why"]
            assert after["tss_target"] == original["tss_target"]
            assert after["intensity"] == original["intensity"]


# ---------------------------------------------------------------------------
# scan_nutrition_advice
# ---------------------------------------------------------------------------

class TestScanNutritionAdvice:
    def test_catches_intermittent_fasting_before_rides(self):
        """ED phrase hit — must return non-empty list."""
        text = "You should try intermittent fasting before rides to burn more fat."
        assert scan_nutrition_advice(text)

    def test_allows_legitimate_carb_timing(self):
        """Legitimate term — must NOT trigger."""
        text = "Focus on carb timing: 60g CHO 60 minutes before a threshold session."
        assert scan_nutrition_advice(text) == []

    def test_allows_fasted_z2(self):
        """Fasted Z2 is a legitimate metabolic-flexibility training modality."""
        text = "Short fasted Z2 rides under 90 min are fine for base building."
        assert scan_nutrition_advice(text) == []

    def test_catches_caloric_restriction(self):
        """Caloric restriction is always a red flag for endurance athletes."""
        text = "Try a caloric restriction of 500 kcal/day."
        assert "caloric restriction" in scan_nutrition_advice(text)

    def test_case_insensitive(self):
        """Uppercase still matches."""
        text = "SKIP MEALS on easy days."
        assert "skip meals" in scan_nutrition_advice(text)

    def test_empty_text_is_safe(self):
        """Empty string → empty list (not an error)."""
        assert scan_nutrition_advice("") == []
        assert scan_nutrition_advice(None) == []  # type: ignore[arg-type]

    def test_all_keywords_present(self):
        """Sanity: the canonical list is non-empty and each entry is lowercase."""
        assert len(ED_KEYWORDS) > 0
        assert all(kw == kw.lower() for kw in ED_KEYWORDS)


# ---------------------------------------------------------------------------
# validate_chat_response
# ---------------------------------------------------------------------------

class TestValidateChatResponse:
    def test_clean_response_passes_through(self):
        """Safe text passes through unchanged."""
        text = "Aim for 80g CHO/hr on rides over 3 hours."
        allowed, out = validate_chat_response(text)
        assert allowed is True
        assert out == text

    def test_ed_response_returns_canned_redirect(self):
        """ED-flagged text is replaced wholesale with the safe redirect."""
        text = "You should restrict calories to hit race weight goal."
        allowed, out = validate_chat_response(text)
        assert allowed is False
        assert out == SAFE_NUTRITION_REDIRECT

    def test_empty_response(self):
        """Empty response is trivially allowed."""
        allowed, out = validate_chat_response("")
        assert allowed is True
        assert out == ""
