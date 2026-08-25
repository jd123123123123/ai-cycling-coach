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


class TestMenstrualDelta:
    """The optional menstrual-phase delta nudges the final score within bounds
    and is a no-op when absent (so existing behaviour is unchanged)."""

    def _green(self, **extra):
        return ReadinessInputs(
            hrv_7d_mean=70.0, hrv_28d_baseline=68.0, hrv_cv_pct=4.5,
            rhr_7d_mean=49.0, rhr_28d_baseline=50.0,
            sleep_score_last_night=90, avg_nightly_debt_h=0.2,
            tsb=8.0, ctl=60.0, atl=52.0, body_battery_wake=70,
            **extra,
        )

    def test_absent_delta_is_no_op(self):
        base = compute_readiness(self._green())
        same = compute_readiness(self._green(menstrual_readiness_delta=None))
        assert base.overall == same.overall

    def test_negative_delta_lowers_score(self):
        base = compute_readiness(self._green())
        lowered = compute_readiness(self._green(menstrual_readiness_delta=-8))
        assert lowered.overall == base.overall - 8

    def test_score_stays_clamped_0_100(self):
        r = compute_readiness(self._green(menstrual_readiness_delta=50))
        assert r.overall <= 100


class TestAcwrIsAFlagNotAWeight:
    """TSB = CTL − ATL and ACWR = ATL / CTL are two transforms of one state.
    Weighting both spent 35% of the composite on one signal seen twice while
    the module claimed six independent inputs. ACWR now informs without
    scoring."""

    def _component_names(self) -> set[str]:
        r = compute_readiness(ReadinessInputs(ctl=50.0, atl=50.0))
        return {c.name for c in r.components}

    def test_acwr_is_no_longer_a_scored_component(self):
        assert "acwr" not in self._component_names()

    def test_load_is_represented_once(self):
        # TSB survives as the single load channel.
        assert "tsb" in self._component_names()

    def test_a_high_ratio_still_reaches_the_athlete_as_a_flag(self):
        r = compute_readiness(ReadinessInputs(ctl=50.0, atl=90.0, tsb=-40.0))
        assert any("acwr" in f.lower() for f in r.flags)

    def test_the_flag_is_suppressed_at_low_chronic_load(self):
        # Lolli 2019: the ratio is unstable when the denominator is small.
        r = compute_readiness(ReadinessInputs(ctl=10.0, atl=24.0, tsb=-14.0))
        assert not any("acwr" in f.lower() for f in r.flags)

    def test_the_ratio_no_longer_moves_the_score(self):
        # Same TSB, wildly different ratio: the score must not care.
        a = compute_readiness(ReadinessInputs(tsb=-5.0, ctl=50.0, atl=55.0)).overall
        b = compute_readiness(ReadinessInputs(tsb=-5.0, ctl=25.0, atl=30.0)).overall
        assert a == b


class TestCoverageIsReported:
    """The score renormalises over whatever signals are present, so a single
    vendor number and a full sensor set produced identical-looking output.
    Coverage is the field that stops that being invisible."""

    def test_full_coverage_when_everything_is_present(self):
        r = compute_readiness(ReadinessInputs(
            hrv_7d_mean=60.0, hrv_28d_baseline=60.0,
            rhr_7d_mean=50.0, rhr_28d_baseline=50.0,
            sleep_score_last_night=80, avg_nightly_debt_h=0.0,
            tsb=-5.0, ctl=50.0, atl=55.0, body_battery_wake=70,
        ))
        assert r.coverage == 1.0
        assert r.confidence == "high"
        assert r.signals_present == 5

    def test_a_lone_vendor_signal_is_marked_low_confidence(self):
        r = compute_readiness(ReadinessInputs(body_battery_wake=70))
        assert r.signals_present == 1
        assert r.coverage < 0.2
        assert r.confidence == "low"

    def test_no_signals_at_all_is_not_dressed_up(self):
        r = compute_readiness(ReadinessInputs())
        assert r.confidence == "none"
        assert r.coverage == 0.0


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
