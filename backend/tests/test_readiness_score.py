"""Unit tests for the multi-factor readiness score.

The component cut-offs are taken from the literature cited in the module
docstring (Plews 2013, Bourdon 2017, Halson 2008, etc.). Tests pin those
thresholds so a future refactor that drifts a cut-off will fail loudly."""
from app.services.readiness_score import (
    ReadinessInputs,
    compute_readiness,
)


class TestReadinessOverall:
    def test_neutral_when_no_inputs(self):
        r = compute_readiness(ReadinessInputs())
        assert r.overall == 50
        assert r.ceiling in ("moderate", "easy")
        assert any("no signals" in f for f in r.flags)

    def test_green_state_pushes_to_high_score(self):
        """Stable HRV / RHR, +5 TSB, 90 sleep, normal ACWR → score ≥ 80."""
        r = compute_readiness(ReadinessInputs(
            hrv_7d_mean=70.0, hrv_28d_baseline=68.0, hrv_cv_pct=4.5,
            rhr_7d_mean=49.0, rhr_28d_baseline=50.0,
            sleep_score_last_night=90, avg_nightly_debt_h=0.2,
            tsb=8.0, ctl=60.0, atl=52.0,
            body_battery_wake=70,
        ))
        assert r.overall >= 80
        assert r.ceiling == "push"
        assert r.flags == []

    def test_overreach_state_caps_at_easy_or_rest(self):
        """ACWR 2.1, TSB -28, sleep score 50, HRV -12% → score < 35."""
        r = compute_readiness(ReadinessInputs(
            hrv_7d_mean=60.0, hrv_28d_baseline=68.0, hrv_cv_pct=11.0,
            rhr_7d_mean=55.0, rhr_28d_baseline=50.0,
            sleep_score_last_night=50, avg_nightly_debt_h=2.5,
            tsb=-28.0, ctl=40.0, atl=84.0,
            body_battery_wake=25,
        ))
        assert r.overall < 35
        assert r.ceiling == "rest"
        # Should fire ACWR + TSB + sleep flags
        flag_names = " ".join(r.flags).lower()
        assert "acwr" in flag_names
        assert "tsb" in flag_names
        assert "sleep" in flag_names


class TestAcwrComponent:
    """Bourdon 2017 thresholds: sweet-spot 0.8-1.3 = high score; >1.5 = penalty
    band; >2.0 = severe red flag."""

    def _score_with_acwr(self, atl: float, ctl: float = 50.0) -> float | None:
        r = compute_readiness(ReadinessInputs(ctl=ctl, atl=atl))
        for c in r.components:
            if c.name == "acwr":
                return c.score
        return None

    def test_sweet_spot_high_score(self):
        # ATL 50 / CTL 50 = 1.0 — middle of sweet spot
        assert (self._score_with_acwr(50.0) or 0) >= 90

    def test_above_1_5_drops_below_70(self):
        # 80/50 = 1.6 — caution
        assert (self._score_with_acwr(80.0) or 100) < 70

    def test_above_2_0_minimal_score(self):
        # 110/50 = 2.2 — severe
        assert (self._score_with_acwr(110.0) or 100) < 15


class TestTsbComponent:
    def _tsb_score(self, tsb: float) -> float | None:
        r = compute_readiness(ReadinessInputs(tsb=tsb))
        for c in r.components:
            if c.name == "tsb":
                return c.score
        return None

    def test_productive_zone_high(self):
        assert (self._tsb_score(10.0) or 0) >= 85

    def test_productive_fatigue_scores_good(self):
        # TSB -15 is ordinary build-block fatigue, not a caution state.
        s = self._tsb_score(-15.0) or 0
        assert 65 <= s <= 80

    def test_functional_overreach_mid(self):
        # -22..-30 is genuine functional overreach — trainable but flagged.
        s = self._tsb_score(-26.0) or 0
        assert 40 <= s <= 60

    def test_severe_negative_low(self):
        assert (self._tsb_score(-35.0) or 100) <= 25


class TestSleepComponent:
    def test_good_score_no_debt(self):
        r = compute_readiness(ReadinessInputs(
            sleep_score_last_night=85, avg_nightly_debt_h=0.0,
        ))
        sleep = next(c for c in r.components if c.name == "sleep")
        assert (sleep.score or 0) >= 80

    def test_chronic_debt_penalty(self):
        """Even with a 'good' single night, accumulating debt should drag the
        score down. Halson 2008 — chronic > single-night impact."""
        r = compute_readiness(ReadinessInputs(
            sleep_score_last_night=80, avg_nightly_debt_h=2.5,
        ))
        sleep = next(c for c in r.components if c.name == "sleep")
        assert (sleep.score or 100) <= 60


class TestMissingSignalsRebalance:
    def test_only_tsb_available_uses_tsb_alone(self):
        """When 5/6 components have no data, the 6th component should drive
        the score directly."""
        r = compute_readiness(ReadinessInputs(tsb=10.0))
        # Should land near the tsb component's score (≈ 90)
        assert r.overall >= 80
