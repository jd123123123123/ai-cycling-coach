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

    def test_blow_up_fires_on_a_REAL_climb_when_racing_it(self):
        # The Passo Giau: ~10 km at ~9%. A rider racing it attempts ~1.13 x CP,
        # so a 20 kJ W' empties partway up and the simulator must say where.
        # This is the test whose absence let an inert blow-up ship green: the
        # earlier version only fired above 12% on 40-minute climbs, which no
        # European road climb satisfies.
        res = simulate(_segments(66, 9.0), _rider(), Assumptions(effort="race"))
        assert res.blow_ups, "racing a 9% alpine climb must be able to break the rider"
        assert 0 < res.blow_ups[0].distance_m < 66 * 150.0

    def test_the_same_climb_ridden_steadily_does_not_break_the_rider(self):
        # Ambition is the variable: the blow-up is a consequence of how hard you
        # try, not a property of the mountain.
        res = simulate(_segments(66, 9.0), _rider(), Assumptions(effort="steady"))
        assert res.blow_ups == []

    def test_racing_is_faster_than_riding_steadily(self):
        race = simulate(_segments(40, 6.0), _rider(), Assumptions(effort="race"))
        steady = simulate(_segments(40, 6.0), _rider(), Assumptions(effort="steady"))
        assert race.total_time_s < steady.total_time_s

    def test_a_long_climb_is_paced_more_conservatively_than_a_short_one(self):
        # duration_scale must still bite -- dropping it made long-climb
        # predictions ~6% optimistic, and that number is what the UI shows.
        short = simulate(_segments(20, 8.0), _rider())
        long_ = simulate(_segments(200, 8.0), _rider())
        assert long_.segments[-1].power_w < short.segments[-1].power_w

    def test_no_blow_up_on_an_easy_route(self):
        assert simulate(_segments(20, 0.0), _rider()).blow_ups == []

    def test_w_bal_never_goes_negative(self):
        res = simulate(_segments(80, 11.0), _rider(w_prime_j=3000.0))
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

    def test_blow_up_actually_caps_power_and_slows_the_rider(self):
        # The blow-up isn't just a marker in a list -- it must change the
        # physics. Racing a real ~9% climb (Passo Giau shape), power before
        # the break is ~279 W (above the 250 W CP); the instant W' is spent,
        # the simulator must hold the rider AT available CP (250 W here,
        # since durability_drop_pct=0.0 keeps available_cp == cp_watts), and
        # speed must drop with it. Deleting `target = cp_now` at the cap
        # site leaves power (and therefore speed) at the pre-blow-up,
        # above-CP value with every existing test still green.
        res = simulate(_segments(66, 9.0), _rider(), Assumptions(effort="race"))
        assert res.blow_ups, "racing a 9% alpine climb must be able to break the rider"
        blow_at = res.blow_ups[0].distance_m

        before = [s for s in res.segments if s.start_m < blow_at]
        after = [s for s in res.segments if s.start_m >= blow_at]
        assert before and after

        pre_power = before[-1].power_w
        post_power = after[0].power_w
        assert pre_power > 250.0 * 1.05, "pre-blow-up power should sit above CP"
        assert post_power == pytest.approx(250.0, abs=1e-6), (
            "once blown, power must be capped at available CP, not left at "
            "the attempted (above-CP) value"
        )
        assert post_power < pre_power * 0.95

        pre_speed_kmh = before[-1].speed_ms * 3.6
        post_speed_kmh = after[0].speed_ms * 3.6
        assert post_speed_kmh < pre_speed_kmh * 0.95, (
            "capping power must also cap speed -- a blow-up that doesn't "
            "slow the rider down isn't a blow-up"
        )

    def test_w_prime_drains_even_with_sub_second_segments(self):
        # Segments short enough (2 m at climbing speed) that int(seg_time)
        # is 0 for every single one. If the fractional W' step were
        # skipped -- as an earlier version did by truncating to whole
        # seconds -- W' would never move at this granularity and the
        # blow-up would be unreachable no matter how hard the effort.
        tiny_segments = [
            Segment(
                start_m=i * 2.0, length_m=2.0, gradient_pct=9.0,
                bearing_deg=0.0, elevation_m=1000.0, climb_id=1,
            )
            for i in range(2000)
        ]
        res = simulate(tiny_segments, _rider(), Assumptions(effort="race"))

        elapsed = [s.elapsed_s for s in res.segments]
        seg_times = [elapsed[0]] + [
            elapsed[i] - elapsed[i - 1] for i in range(1, len(elapsed))
        ]
        assert all(t < 1.0 for t in seg_times), (
            "test setup invariant: every segment must take under a second"
        )

        assert res.segments[-1].w_bal_j < res.segments[0].w_bal_j, (
            "W' must drain even when every segment is sub-second"
        )
        assert res.blow_ups, (
            "a sub-second-segment climb must still be able to blow the "
            "rider up -- the fractional W' step is what makes that possible"
        )

    def test_attempted_power_on_a_climb_does_not_depend_on_draft(self):
        # _climb_durations deliberately estimates using the rider's SOLO
        # CdA regardless of the chosen draft assumption, so that the
        # duration_scale bucket -- and therefore attempted power -- doesn't
        # discontinuously shift just because the rider picked "bunch".
        # Elapsed time legitimately differs (drafting is faster); attempted
        # power on each segment must not.
        #
        # n=53 segments of 160 m at 8% is chosen deliberately: the solo-CdA
        # duration estimate for this climb (~2424 s) sits just above the
        # 2400 s duration_scale bucket boundary; if the draft-adjusted
        # (bunch) CdA leaked into the estimate instead, the shorter bunch
        # estimate (~2397 s) would fall into the bucket below and change
        # attempted power. A smaller/arbitrary climb wouldn't straddle that
        # boundary and could pass even with the leak reintroduced.
        segs = _segments(53, 8.0, length_m=160.0)
        solo = simulate(segs, _rider(), Assumptions(draft="solo"))
        bunch = simulate(segs, _rider(), Assumptions(draft="bunch"))

        assert [s.power_w for s in solo.segments] == [
            s.power_w for s in bunch.segments
        ]
        assert bunch.total_time_s != pytest.approx(solo.total_time_s, rel=1e-9)
