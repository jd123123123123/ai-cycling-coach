"""Tests for the new ACWR + TSB-velocity + readiness-score guards in
safety_rails.intensity_ceiling. Pins the Bourdon 2017 thresholds and
verifies hard rules outrank the soft composite."""
from app.services.safety_rails import RailContext, intensity_ceiling


def _ctx(**overrides) -> RailContext:
    # CTL 50 = comfortably above the ACWR-eligibility floor (20).
    base = dict(
        ctl=50.0, atl=50.0, tsb=0.0, hrv_delta_pct=0.0,
        injury_flag=False, days_since_rest=0,
    )
    base.update(overrides)
    return RailContext(**base)


class TestAcwrGuard:
    def test_acwr_above_2_forces_rest(self):
        # Bourdon 2017 — ACWR > 2.0 is the strongest published red flag
        assert intensity_ceiling(_ctx(acwr=2.1)) == "rest"

    def test_acwr_1_8_forces_easy(self):
        assert intensity_ceiling(_ctx(acwr=1.85)) == "easy"

    def test_acwr_1_5_caps_at_moderate(self):
        assert intensity_ceiling(_ctx(acwr=1.55)) == "moderate"

    def test_acwr_in_sweet_spot_allows_push(self):
        assert intensity_ceiling(_ctx(acwr=1.0)) == "push"


class TestAcwrLowCtlFloor:
    """ACWR ratios are mathematically unreliable at low chronic load —
    Lolli 2019 BJSM. Below CTL 20 the guard must NOT fire even when the
    nominal ratio is in the danger band, because the absolute load is
    small. This is the bug that prescribed 'rest' for an athlete with
    CTL 10.9 / ATL 26 (nominal ACWR 2.4 — meaningless at that CTL)."""

    def test_low_ctl_acwr_2_4_does_not_force_rest(self):
        # CTL 10, ATL 24 → nominal ACWR 2.4. Pre-fix: returned 'rest'.
        # Post-fix: ACWR rules suppressed; falls through to defaults.
        result = intensity_ceiling(_ctx(ctl=10.0, atl=24.0, acwr=2.4))
        assert result != "rest"
        assert result != "easy"  # nothing else fires for this athlete

    def test_low_ctl_acwr_1_6_does_not_force_moderate(self):
        # CTL 15, ATL 24 → nominal ACWR 1.6. Suppressed below CTL 20.
        result = intensity_ceiling(_ctx(ctl=15.0, atl=24.0, acwr=1.6))
        assert result == "push"

    def test_ctl_20_is_eligible_boundary(self):
        # CTL exactly at the floor — ACWR rules become active.
        result = intensity_ceiling(_ctx(ctl=20.0, atl=44.0, acwr=2.2))
        assert result == "rest"


class TestTsbVelocityGuard:
    def test_fast_descent_forces_easy(self):
        # Two consecutive days of -6 TSB/day = -6 average → triggers
        assert intensity_ceiling(_ctx(tsb_velocity_2d=-6.0)) == "easy"

    def test_slow_descent_does_not_trigger(self):
        assert intensity_ceiling(_ctx(tsb_velocity_2d=-2.0)) == "push"


class TestReadinessScoreSoftFloor:
    def test_low_readiness_caps_to_easy(self):
        # No hard rule firing — composite alone drives the ceiling down
        assert intensity_ceiling(_ctx(readiness_score=30)) == "easy"

    def test_mid_readiness_caps_to_moderate(self):
        assert intensity_ceiling(_ctx(readiness_score=50)) == "moderate"

    def test_high_readiness_allows_push(self):
        assert intensity_ceiling(_ctx(readiness_score=80)) == "push"


class TestHardRulesOutrankComposite:
    """A green readiness_score must NOT override a deterministic red flag
    like ACWR>2.0 — order matters. This is the safety-critical contract."""

    def test_acwr_2_beats_high_readiness(self):
        assert intensity_ceiling(_ctx(acwr=2.1, readiness_score=85)) == "rest"

    def test_injury_beats_everything(self):
        assert intensity_ceiling(_ctx(
            injury_flag=True, readiness_score=95, acwr=1.0, tsb=20.0,
        )) == "rest"


class TestBackwardCompat:
    """Existing call sites that pass no optional fields must still work
    and produce the same results as before this change."""

    def test_legacy_signature_still_works(self):
        # Old signature — no acwr / tsb_velocity / readiness fields.
        ctx = RailContext(
            ctl=40.0, atl=42.0, tsb=-2.0, hrv_delta_pct=-3.0,
            injury_flag=False, days_since_rest=3,
        )
        assert intensity_ceiling(ctx) == "push"
