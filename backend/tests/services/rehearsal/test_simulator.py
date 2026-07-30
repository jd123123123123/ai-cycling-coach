"""The march: gradient → watts → speed, with durability and W' feeding back.

The blow-up is the product's headline moment, so it is tested as behaviour:
a route that exhausts W' must report where, and must take longer than the same
route ridden within the rider's means.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.rider_model import build_rider_model
from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.simulator import Assumptions, simulate


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


class TestSimulate:
    def test_produces_one_result_per_segment(self):
        res = simulate(_segments(10, 0.0), _rider())
        assert len(res.segments) == 10
        assert res.total_time_s > 0

    def test_elapsed_time_only_increases(self):
        res = simulate(_segments(20, 4.0), _rider())
        times = [s.elapsed_s for s in res.segments]
        assert times == sorted(times)

    def test_a_climb_takes_longer_than_the_same_distance_flat(self):
        flat = simulate(_segments(20, 0.0), _rider()).total_time_s
        up = simulate(_segments(20, 8.0), _rider()).total_time_s
        assert up > flat

    def test_accumulates_work(self):
        res = simulate(_segments(20, 4.0), _rider())
        assert res.total_kj > 0

    def test_durability_makes_a_late_climb_slower_than_the_same_climb_early(self):
        # 60 identical climbing segments. With fade on, the last must be slower
        # than the first; with fade off, they must match. This is the effect no
        # HR-based competitor can model.
        faded = simulate(_segments(60, 6.0), _rider(durability_drop_pct=8.0))
        assert faded.segments[-1].speed_ms < faded.segments[0].speed_ms

        flat_model = simulate(_segments(60, 6.0), _rider(durability_drop_pct=0.0))
        assert flat_model.segments[-1].speed_ms == pytest.approx(
            flat_model.segments[0].speed_ms, rel=1e-6
        )

    def test_blow_up_is_reported_when_w_prime_is_exhausted(self):
        # A tiny W' against a long, steep (>=12%, pace_factor's top bucket)
        # climb: attempted power for a climb this steep genuinely outruns what
        # duration_scale says is sustainable for a climb this long, so the
        # rider cannot hold the target and the simulator must say where it
        # broke.
        res = simulate(_segments(80, 13.0), _rider(w_prime_j=3000.0))
        assert res.blow_ups
        assert res.blow_ups[0].distance_m > 0

    def test_no_blow_up_on_an_easy_route(self):
        assert simulate(_segments(20, 0.0), _rider()).blow_ups == []

    def test_w_bal_never_goes_negative(self):
        res = simulate(_segments(80, 13.0), _rider(w_prime_j=3000.0))
        assert all(s.w_bal_j >= -1e-6 for s in res.segments)

    def test_drafting_in_a_bunch_is_faster_on_the_flat(self):
        solo = simulate(_segments(30, 0.0), _rider(), Assumptions(draft="solo"))
        bunch = simulate(_segments(30, 0.0), _rider(), Assumptions(draft="bunch"))
        assert bunch.total_time_s < solo.total_time_s

    def test_drafting_barely_matters_on_a_steep_climb(self):
        solo = simulate(_segments(30, 10.0), _rider(), Assumptions(draft="solo"))
        bunch = simulate(_segments(30, 10.0), _rider(), Assumptions(draft="bunch"))
        assert bunch.total_time_s == pytest.approx(solo.total_time_s, rel=0.03)

    def test_headwind_costs_time(self):
        segs = _segments(30, 0.0)
        still = simulate(segs, _rider()).total_time_s
        windy = simulate(segs, _rider(), headwind_ms=[6.0] * 30).total_time_s
        assert windy > still
