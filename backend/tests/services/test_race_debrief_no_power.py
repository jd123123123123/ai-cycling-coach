"""The debrief for a ride recorded WITHOUT a power meter.

A single guard used to refuse the whole report for any ride whose power channel
was falsy. That was survivable while such rides had no stored recording at all;
once the sync started keeping them honestly — GPS, altitude and heart rate
stored, the power channel absent rather than zero-filled — the guard threw away
the map, the elevation profile, the climbs and every heart-rate fact along with
the watts that genuinely were not measured.

These tests pin both halves of the fix: the ride WITH power still assembles
exactly as before (the regression that matters most), and the ride without one
gets a report whose power fields are absent — null, never zero, because 0 W and
"no meter" are not the same ride and roughly fifteen readers downstream cannot
tell them apart once a zero is written.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.race_debrief import assemble_debrief

N = 1800


def _geo(n=N):
    """A ride that climbs for its first half and descends for its second.

    5 m/s over the ground and 0.3 m of ascent per second is a 6 % grade — above
    the segmenter's 3 % climb threshold, so this ride has a real climb in it
    with no power channel involved in finding one.
    """
    distance = [5.0 * i for i in range(n)]
    altitude = [100.0 + (0.3 * i if i < n // 2 else 0.3 * (n - i)) for i in range(n)]
    latitude = [47.10 + 0.0001 * i for i in range(n)]
    longitude = [11.20 + 0.0001 * i for i in range(n)]
    return distance, altitude, latitude, longitude


def _no_power_streams(n=N):
    distance, altitude, latitude, longitude = _geo(n)
    return {
        # The honest shape the sync now writes: the key is present and EMPTY.
        # A zero-filled array here would be the fabrication this whole change
        # exists to avoid.
        "power": [],
        "heart_rate": [130.0 + (i / n) * 20 for i in range(n)],
        "cadence": [],
        "altitude": altitude,
        "distance": distance,
        "speed": [5.0] * n,
        "latitude": latitude,
        "longitude": longitude,
    }


def _with_power_streams(n=N):
    streams = _no_power_streams(n)
    streams["power"] = [400.0 if (i % 300) < 40 else 180.0 for i in range(n)]
    streams["cadence"] = [90.0] * n
    return streams


def _activity(calories=1240):
    return SimpleNamespace(
        id=4711, title="Feierabendrunde", sport="cycling",
        started_at=datetime(2026, 8, 20, 15, 45, tzinfo=timezone.utc),
        distance_meters=9000.0, duration_seconds=N, tss=96.0,
        elevation_gain_m=270.0, calories=calories,
    )


def _stream_row(streams, *, powered: bool):
    """The ActivityStream stand-in.

    For a meterless bike the ingestion nulls the power model outright — no CP,
    no W′, no MMP curve — rather than fitting one to an array of zeroes, so the
    row this test hands the assembler is nulled the same way.
    """
    return SimpleNamespace(
        streams=streams,
        mmp_curve={5: 400.0, 60: 380.0, 300: 300.0, 600: 280.0, 1200: 260.0} if powered else None,
        total_kj=None, decoupling_pct=None,
        cp_watts=250.0 if powered else None,
        w_prime_j=20000.0 if powered else None,
        eftp_watts=256.0 if powered else None,
        durability_drop_pct=None,
    )


_PROFILE = SimpleNamespace(weight_kg=70.0, ftp_watts=250)
_ENVELOPE = {5: 500.0, 60: 400.0, 300: 320.0, 600: 300.0, 1200: 280.0}


def _powered_report(lang="en"):
    return assemble_debrief(_activity(), _stream_row(_with_power_streams(), powered=True),
                            _PROFILE, _ENVELOPE, lang)


def _powerless_report(lang="en", calories=1240):
    return assemble_debrief(_activity(calories), _stream_row(_no_power_streams(), powered=False),
                            _PROFILE, _ENVELOPE, lang)


class TestTheRideWithPowerIsUnchanged:
    """The regression that matters most: teaching the report to survive without
    watts must not cost the report that has them."""

    def test_every_power_block_is_still_built(self):
        rd = _powered_report()

        assert rd.pacing is not None
        assert rd.efficiency is not None and rd.efficiency.efficiency_factor is not None
        assert rd.matchbook is not None
        assert rd.quadrant is not None
        assert rd.fueling is not None
        assert rd.wko is not None and rd.wko.mftp_watts > 0
        assert rd.efforts
        assert rd.cda is not None

    def test_the_header_and_the_grade_still_carry_numbers(self):
        rd = _powered_report()

        assert rd.header.np_watts is not None and rd.header.np_watts > 0
        assert rd.header.total_kj is not None and rd.header.total_kj > 0
        assert rd.header.if_ is not None and rd.header.if_ > 0
        assert rd.verdict.grade_letter in {"A", "B", "C", "D", "F"}
        assert rd.verdict.grade_score is not None
        assert rd.plan

    def test_the_story_still_plots_watts_against_the_map(self):
        rd = _powered_report()

        assert rd.story is not None
        assert len(rd.story.power) > 0
        assert len(rd.story.t) == len(rd.story.power)
        # The map is coloured by effort when there is an effort to colour it by.
        assert any(p.power is not None for p in rd.story.route)


class TestTheRideWithoutPowerStillGetsAReport:

    def test_the_header_carries_what_the_ride_did_record(self):
        h = _powerless_report().header

        assert h.title == "Feierabendrunde"
        assert h.distance_km == 9.0
        assert h.elevation_m == 270.0
        assert h.moving_time_s == N
        assert h.avg_speed_kmh == 18.0
        assert h.tss == 96.0
        # The head unit's own energy figure — measured off heart rate, and the
        # only energy number a meterless ride has.
        assert h.calories == 1240

    def test_the_climbs_and_the_route_survive(self):
        rd = _powerless_report()

        assert rd.segments, "segmentation reads altitude + distance, not power"
        assert rd.climbs, "a 6 % half-hour is a climb whether or not it was measured in watts"
        assert rd.climbs[0].elev_gain_m > 0
        assert rd.story is not None and len(rd.story.route) > 0
        assert rd.story.route[0].lat > 0 and rd.story.route[0].lng > 0
        assert len(rd.story.altitude) > 0

    def test_the_heart_is_reported_even_though_the_legs_were_not(self):
        rd = _powerless_report()

        assert rd.efficiency is not None
        assert rd.efficiency.avg_hr is not None and 130 <= rd.efficiency.avg_hr <= 150
        # Both of these are power:HR ratios. There is no numerator.
        assert rd.efficiency.efficiency_factor is None
        assert rd.efficiency.decoupling_pct is None
        assert rd.efficiency.np_watts is None

    def test_the_climb_carries_no_invented_watts(self):
        rd = _powerless_report()

        assert all(c.avg_power is None for c in rd.climbs)
        assert all(c.w_per_kg is None for c in rd.climbs)
        assert all(s.avg_power is None for s in rd.segments)
        assert all(p.power is None for p in rd.story.route)

    def test_the_timeline_is_as_long_as_the_recording(self):
        """`n` was `len(power)`, i.e. nought for this ride — which emptied the
        time axis every other series is plotted against, and (with no speed
        stream) reported a moving time of nought seconds."""
        rd = _powerless_report()

        assert rd.story is not None
        assert len(rd.story.t) > 0
        assert len(rd.story.t) == len(rd.story.altitude) == len(rd.story.hr)
        assert rd.header.moving_time_s == N


class TestNothingIsFabricatedInPlaceOfAMeasurement:

    def test_every_power_measurement_is_null_and_not_zero(self):
        rd = _powerless_report()

        assert rd.header.np_watts is None
        assert rd.header.total_kj is None
        assert rd.header.if_ is None
        assert rd.pacing is None          # split, VI, surges, zones: all watts
        assert rd.quadrant is None        # force × cadence
        assert rd.matchbook is None       # W′ burned
        assert rd.wko is None             # the power-duration model
        assert rd.cda is None             # solved from power against speed
        assert rd.fueling is None         # kJ → grams of carbohydrate
        assert rd.efforts == []           # peak efforts and personal bests
        assert rd.story is not None and rd.story.power == []
        assert rd.story.wbal == []

    def test_the_ride_is_not_graded_on_evidence_that_does_not_exist(self):
        """Every input to the execution score is a power measurement, so scoring
        this ride returns the scorer's own 80-point starting prior wearing a B."""
        rd = _powerless_report()

        assert rd.verdict.grade_letter is None
        assert rd.verdict.grade_score is None
        assert rd.verdict.went_well == []
        assert rd.verdict.watch_out == []

    def test_the_verdict_states_the_facts_and_names_what_is_missing(self):
        v = _powerless_report().verdict.ai_verdict

        assert "9 km" in v
        assert "270 m of climbing" in v
        assert "bpm" in v
        assert "power meter" in v
        # Clients take the headline as everything before the first full stop, so
        # the fact list must not be broken by a decimal point.
        assert v.split(".")[0].endswith("kcal")

    def test_the_german_verdict_is_german(self):
        v = _powerless_report(lang="de").verdict.ai_verdict

        assert "Höhenmeter" in v
        assert "Leistungsmesser" in v

    def test_the_plan_is_the_recovery_beat_and_nothing_invented(self):
        """"Keep doing what works" praises a pacing and a fuelling that were both
        read off the power channel."""
        plan = _powerless_report().plan

        assert len(plan) == 1
        assert plan[0].headline.startswith("Recovery")
        # Carbohydrate replacement off the measured calories, not off kJ we
        # never had: 1240 kcal × 25 % ÷ 4 kcal/g ≈ 78 g.
        assert "78 g" in plan[0].race_tactic

    def test_no_carb_target_is_named_when_no_energy_was_measured(self):
        plan = _powerless_report(calories=None).plan

        assert len(plan) == 1
        assert " g of carbs" not in plan[0].race_tactic
        assert "carbohydrate-rich meal" in plan[0].race_tactic


class TestAStreamWithNothingInIt:

    def test_a_recording_of_only_cadence_still_assembles_without_raising(self):
        """The loader refuses such a ride (see the endpoint test), but the pure
        assembler must not explode if one ever reaches it."""
        streams = {"power": [], "heart_rate": [], "cadence": [80.0] * 600,
                   "altitude": [], "distance": [], "speed": []}
        rd = assemble_debrief(_activity(), _stream_row(streams, powered=False),
                              _PROFILE, _ENVELOPE)

        assert rd.header.np_watts is None
        assert rd.efficiency is None
        assert rd.climbs == []
        assert rd.verdict.grade_letter is None
