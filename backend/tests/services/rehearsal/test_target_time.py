"""The backward solve: a finish time in, the intensity it demands out.

The behaviour worth pinning is not the arithmetic — it is the refusal. A solver
that clamps at its ceiling and reports the ceiling's time hands a rider who
cannot ride 5:10 a confident "4:30", which is the single most damaging thing
this page could do.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.rider_model import build_rider_model
from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.simulator import Assumptions, simulate
from app.services.rehearsal.target_time import (
    MAX_SCALE,
    MIN_SCALE,
    TOLERANCE_S,
    solve_for_target_time,
)


def _rider(**over):
    kwargs = dict(
        cp_watts=250.0, w_prime_j=20000.0, weight_kg=72.0,
        cda_m2=0.30, durability_drop_pct=0.0,
    )
    kwargs.update(over)
    return build_rider_model(**kwargs)


def _segments(n: int, gradient: float, length_m: float = 150.0) -> list[Segment]:
    return [
        Segment(start_m=i * length_m, length_m=length_m, gradient_pct=gradient,
                bearing_deg=0.0, elevation_m=1000.0, climb_id=1 if gradient > 3 else None)
        for i in range(n)
    ]


def _baseline_time(segs, rider, assumptions=None) -> float:
    return simulate(segs, rider, assumptions or Assumptions(), None, None).total_time_s


class TestReachableTarget:
    def test_hits_a_time_between_soft_pedal_and_flat_out(self):
        segs = _segments(200, 0.0)
        rider = _rider()
        # Ask for 5% faster than the rider's natural fondo pace.
        target = _baseline_time(segs, rider) * 0.95

        sol = solve_for_target_time(segs, rider, Assumptions(), None, None, target)

        assert sol.reachable is True
        assert sol.result.total_time_s == pytest.approx(target, abs=TOLERANCE_S)
        assert sol.fastest_possible_s is None

    def test_going_faster_demands_a_higher_intensity(self):
        segs = _segments(200, 0.0)
        rider = _rider()
        base = _baseline_time(segs, rider)

        easy = solve_for_target_time(segs, rider, Assumptions(), None, None, base * 1.05)
        hard = solve_for_target_time(segs, rider, Assumptions(), None, None, base * 0.95)

        assert hard.intensity_scale > easy.intensity_scale

    def test_the_returned_plan_is_the_plan_for_that_intensity(self):
        """The surface draws `result` — it must be the solved ride, not the
        rehearsal's original pacing, or the watts on screen would not add up
        to the time above them."""
        segs = _segments(200, 0.0)
        rider = _rider()
        target = _baseline_time(segs, rider) * 0.95

        sol = solve_for_target_time(segs, rider, Assumptions(), None, None, target)

        assert sol.result.total_time_s == pytest.approx(target, abs=TOLERANCE_S)
        assert sol.result.segments[0].power_w > 0


class TestUnreachableTarget:
    def test_refuses_a_time_the_rider_cannot_ride(self):
        segs = _segments(200, 0.0)
        rider = _rider()
        # Half the flat-out time is not available at any sane intensity.
        flat_out = simulate(
            segs, rider, Assumptions(intensity_scale=MAX_SCALE), None, None
        ).total_time_s
        impossible = flat_out * 0.5

        sol = solve_for_target_time(segs, rider, Assumptions(), None, None, impossible)

        assert sol.reachable is False
        # And it says what IS possible, rather than reporting the ceiling's
        # time as if the request had been met.
        assert sol.fastest_possible_s == pytest.approx(flat_out, rel=1e-6)
        assert sol.fastest_possible_s > impossible
        assert sol.intensity_scale == MAX_SCALE

    def test_an_unreachable_target_still_returns_a_ride_to_show(self):
        segs = _segments(200, 0.0)
        sol = solve_for_target_time(segs, _rider(), Assumptions(), None, None, 60.0 * 5)
        assert sol.result.segments
        assert sol.result.total_time_s > 0


class TestTargetSlowerThanSoftPedal:
    def test_hands_back_the_easiest_ride_rather_than_a_scale_below_the_bracket(self):
        segs = _segments(200, 0.0)
        rider = _rider()
        soft = simulate(
            segs, rider, Assumptions(intensity_scale=MIN_SCALE), None, None
        ).total_time_s

        sol = solve_for_target_time(segs, rider, Assumptions(), None, None, soft * 2)

        assert sol.reachable is True
        assert sol.intensity_scale == MIN_SCALE
        assert sol.fastest_possible_s is None


class TestBlowUpHonesty:
    def test_reports_when_the_target_can_only_be_reached_by_emptying_w_prime(self):
        """Reachable and survivable are different answers. A time the clock
        allows but the body does not is a warning, not a pacing plan."""
        segs = _segments(120, 9.0)          # a long, steep climb
        rider = _rider(w_prime_j=6000.0)    # and a small matchbook
        flat_out = simulate(
            segs, rider, Assumptions(intensity_scale=MAX_SCALE), None, None
        )
        assert flat_out.blow_ups, "fixture must actually blow up at full gas"

        sol = solve_for_target_time(
            segs, rider, Assumptions(), None, None, flat_out.total_time_s
        )

        assert sol.costs_a_blow_up is True

    def test_a_ride_within_the_rider_is_not_flagged(self):
        segs = _segments(200, 0.0)
        rider = _rider()
        sol = solve_for_target_time(
            segs, rider, Assumptions(), None, None, _baseline_time(segs, rider)
        )
        assert sol.costs_a_blow_up is False
