"""ACWR is descriptive, never a gate — and nothing protective was lost.

These tests used to pin ACWR > 2.0 → rest, > 1.8 → easy, > 1.5 → moderate.
They now pin the opposite, because the codebase held three incompatible
positions on one metric (audit §6.1): `adaptive_readiness` called it
"discredited, warning only", the readiness composite gave it 15% of a score,
and this module let it force a rest day.

The position is now single: the coupled ratio does not gate anything. The tests
that matter are the second class below — the ones proving an athlete in genuine
acute overload still gets a conservative ceiling, from the better-founded
expression of the same (CTL, ATL) information.
"""
from app.services.safety_rails import RailContext, intensity_ceiling


def _ctx(**overrides) -> RailContext:
    base = dict(
        ctl=50.0, atl=50.0, tsb=0.0, hrv_delta_pct=0.0,
        injury_flag=False, days_since_rest=0,
    )
    base.update(overrides)
    return RailContext(**base)


class TestAcwrNoLongerGates:
    """The ratio alone — with every other signal neutral — decides nothing."""

    def test_acwr_above_2_does_not_force_rest_on_its_own(self):
        assert intensity_ceiling(_ctx(acwr=2.1)) == "push"

    def test_acwr_1_8_does_not_force_easy_on_its_own(self):
        assert intensity_ceiling(_ctx(acwr=1.85)) == "push"

    def test_acwr_1_5_does_not_cap_at_moderate_on_its_own(self):
        assert intensity_ceiling(_ctx(acwr=1.55)) == "push"

    def test_sweet_spot_still_allows_push(self):
        assert intensity_ceiling(_ctx(acwr=1.0)) == "push"

    def test_low_ctl_ratios_remain_harmless(self):
        # The Lolli instability case that once prescribed rest for CTL 10.9.
        assert intensity_ceiling(_ctx(ctl=10.0, atl=24.0, acwr=2.4)) == "push"


class TestProtectionSurvivesWithoutTheRail:
    """The reason removing those rails is safe, stated as tests rather than as
    a claim: a real acute spike is not invisible, it is just read off signals
    that can be defended."""

    def test_a_genuine_acute_spike_still_caps_intensity(self):
        # ACWR 2.0 means ATL is twice CTL, which IS TSB = -CTL. At any CTL worth
        # the name that is far past the -30 rail.
        spike = _ctx(ctl=50.0, atl=100.0, tsb=-50.0, acwr=2.0)
        assert intensity_ceiling(spike) == "easy"

    def test_the_spike_is_caught_while_it_is_happening(self):
        # tsb_velocity_2d is the load derivative — it fires during the ramp,
        # before TSB has finished falling.
        ramping = _ctx(ctl=50.0, atl=70.0, tsb=-20.0, acwr=1.4, tsb_velocity_2d=-6.0)
        assert intensity_ceiling(ramping) == "easy"

    def test_deep_fatigue_still_caps_at_moderate(self):
        assert intensity_ceiling(_ctx(tsb=-27.0)) == "moderate"

    def test_injury_still_outranks_everything(self):
        assert intensity_ceiling(_ctx(injury_flag=True, acwr=1.0)) == "rest"

    def test_hrv_suppression_still_caps(self):
        assert intensity_ceiling(_ctx(hrv_delta_pct=-12.0)) == "easy"

    def test_composite_floor_still_applies(self):
        assert intensity_ceiling(_ctx(readiness_score=30.0)) == "easy"
