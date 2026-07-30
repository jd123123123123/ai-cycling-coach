"""The band IS the answer — a bare predicted time is never displayed.

Every assumption the athlete adds widens it, which is the honest lesson and
the opposite of what a single confident number teaches.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.rider_model import build_rider_model
from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.uncertainty import simulate_band


def _rider(**over):
    kwargs = dict(cp_watts=250.0, w_prime_j=20000.0, weight_kg=72.0,
                  cda_m2=0.30, durability_drop_pct=4.0)
    kwargs.update(over)
    return build_rider_model(**kwargs)


def _segments(n=40, gradient=4.0):
    return [Segment(start_m=i * 150.0, length_m=150.0, gradient_pct=gradient,
                    bearing_deg=0.0, elevation_m=1000.0, climb_id=None)
            for i in range(n)]


class TestSimulateBand:
    def test_percentiles_are_ordered(self):
        b = simulate_band(_segments(), _rider(), draws=40)
        assert b.p10_s < b.p50_s < b.p90_s

    def test_is_deterministic_for_a_given_seed(self):
        a = simulate_band(_segments(), _rider(), draws=40, seed=7)
        b = simulate_band(_segments(), _rider(), draws=40, seed=7)
        assert a.p50_s == pytest.approx(b.p50_s)
        assert a.p10_s == pytest.approx(b.p10_s)

    def test_a_guessed_cda_widens_the_band(self):
        known = simulate_band(_segments(60, 0.0), _rider(cda_m2=0.30), draws=60, seed=3)
        guessed = simulate_band(_segments(60, 0.0), _rider(cda_m2=None), draws=60, seed=3)
        assert (guessed.p90_s - guessed.p10_s) > (known.p90_s - known.p10_s)

    def test_the_median_is_close_to_the_deterministic_run(self):
        from app.services.rehearsal.simulator import simulate

        segs = _segments()
        point = simulate(segs, _rider()).total_time_s
        band = simulate_band(segs, _rider(), draws=80, seed=11)
        assert band.p50_s == pytest.approx(point, rel=0.12)

    def test_reports_how_many_draws_it_used(self):
        assert simulate_band(_segments(), _rider(), draws=25).draws == 25
