"""The band IS the answer — a bare predicted time is never displayed.

Every assumption the athlete adds widens it, which is the honest lesson and
the opposite of what a single confident number teaches.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from app.services.rehearsal.rider_model import build_rider_model
from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.simulator import Assumptions, simulate
from app.services.rehearsal.uncertainty import _march_total_times, simulate_band


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


def _sharp(n=900, up=13.0, down=-9.0, climb_from=None, climb_to=None, period=2):
    """A profile whose gradient swings hard segment to segment.

    This is the shape that broke the coarsened band: `_climb_push` is a step
    function and `speed_for_power` is convex in gradient, so the average of a
    ramp and a descent is far faster than the two ridden separately.
    """
    segs = []
    for i in range(n):
        if climb_from is not None and climb_from <= i < climb_to:
            grad, cid = 7.4, 1
        else:
            grad, cid = (up if i % period else down), None
        segs.append(Segment(start_m=i * 150.0, length_m=150.0, gradient_pct=grad,
                            bearing_deg=0.0, elevation_m=1000.0, climb_id=cid))
    return segs


class TestTheMarchIsTheSamePhysicsAsSimulate:
    """The band runs its OWN vectorised march, so it can silently drift from
    `simulate()`. These are the only things stopping that."""

    def test_vectorised_march_matches_simulate_exactly(self):
        """One draw, zero variance, must reproduce simulate() to 0.01%.

        If this fails the two implementations have diverged and the band is
        lying about the same route simulate() describes. Fix the march — do
        NOT loosen this tolerance.
        """
        model = _rider()
        segs = _sharp(400, climb_from=150, climb_to=280)
        wind = [1.5 * math.sin(i / 7.0) for i in range(len(segs))]
        rho = [1.10 + 0.0005 * i for i in range(len(segs))]

        for draft in ("solo", "small_group", "bunch"):
            for effort in ("steady", "fondo", "race"):
                assumptions = Assumptions(draft=draft, effort=effort)
                expected = simulate(segs, model, assumptions, wind, rho).total_time_s
                got = float(
                    _march_total_times(
                        segs, model, assumptions,
                        np.array([model.cp_watts]),
                        np.array([model.cda_m2]),
                        np.array([model.crr]),
                        np.asarray(wind, dtype=float)[:, None],
                        np.asarray(rho, dtype=float)[:, None],
                    )[0]
                )
                assert got == pytest.approx(expected, rel=1e-4), (draft, effort)

    def test_march_matches_simulate_without_w_prime_or_durability(self):
        segs = _sharp(300)
        for model in (_rider(w_prime_j=None), _rider(durability_drop_pct=0.0)):
            expected = simulate(segs, model).total_time_s
            got = float(
                _march_total_times(
                    segs, model, Assumptions(),
                    np.array([model.cp_watts]), np.array([model.cda_m2]),
                    np.array([model.crr]), None, None,
                )[0]
            )
            assert got == pytest.approx(expected, rel=1e-4)


class TestSharpTerrainIsNotSmoothedAway:
    """An earlier band coarsened long routes ~8x before drawing. On sharp
    rolling terrain that came out 27% FAST and did not even overlap the honest
    band — the athlete was told 5h49 worst case when 6h10 was the best case.
    Any reintroduced coarsening fails these."""

    def test_a_sharp_900_segment_band_agrees_with_full_resolution(self):
        model = _rider()
        segs = _sharp(900)
        honest = simulate(segs, model).total_time_s

        band = simulate_band(segs, model, draws=60, seed=5)

        assert band.p50_s == pytest.approx(honest, rel=0.03)
        assert band.p10_s <= honest <= band.p90_s

    def test_a_punchy_route_still_blows_the_rider_up_in_the_band(self):
        """Averaging +14%/-8% into +3% drops attempted power below CP, so W′
        never drains and a route that would destroy the athlete rehearses as a
        comfortable ride. The band must stay as slow as the honest march."""
        model = _rider()
        # Two 14% ramps per -8% descent: too little descent to recharge W′.
        segs = _sharp(600, up=14.0, down=-8.0, period=3)
        race = Assumptions(effort="race")

        honest = simulate(segs, model, race)
        assert len(honest.blow_ups) > 50, "fixture no longer produces blow-ups"

        band = simulate_band(segs, model, race, draws=60, seed=5)

        assert band.p50_s == pytest.approx(honest.total_time_s, rel=0.03)
        assert band.p10_s <= honest.total_time_s <= band.p90_s

    def test_a_long_route_is_not_silently_cheaper_than_its_own_halves(self):
        """Merging adjacent segments across a sign change is the specific error.
        A band over 600 sharp segments must cost what the 600 segments cost, not
        what 300 merged ones would."""
        model = _rider()
        segs = _sharp(600)
        merged = [
            Segment(start_m=segs[i].start_m, length_m=300.0,
                    gradient_pct=(segs[i].gradient_pct + segs[i + 1].gradient_pct) / 2.0,
                    bearing_deg=0.0, elevation_m=1000.0, climb_id=None)
            for i in range(0, 600, 2)
        ]
        sharp_band = simulate_band(segs, model, draws=40, seed=9)
        merged_band = simulate_band(merged, model, draws=40, seed=9)

        # Sanity: merging really does distort this profile badly.
        assert merged_band.p50_s < sharp_band.p50_s * 0.85
        # And the real band tracks the real profile, not the merged one.
        assert sharp_band.p50_s == pytest.approx(
            simulate(segs, model).total_time_s, rel=0.03
        )


class TestShortSeries:
    def test_a_truncated_headwind_field_does_not_crash(self):
        """A forecast field shorter than the route is padded, not fatal."""
        band = simulate_band(_segments(120), _rider(), headwind_ms=[1.0, 2.0], draws=10)
        assert band.p50_s > 0
