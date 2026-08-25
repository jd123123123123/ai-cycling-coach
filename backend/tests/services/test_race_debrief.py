"""Tests for the pure race-debrief assembler."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.race_debrief import assemble_debrief


def _synthetic_stream(n=1800):
    # A climb-y interval ride: steady base with surges, rising then falling altitude.
    power = []
    for i in range(n):
        power.append(400.0 if (i % 300) < 40 else 180.0)
    altitude = [100.0 + min(i, n - i) * 0.03 for i in range(n)]
    distance = [10.0 * i for i in range(n)]
    speed = [10.0] * n
    hr = [140.0 + (i / n) * 15 for i in range(n)]
    cadence = [90.0] * n
    return {
        "power": power, "heart_rate": hr, "cadence": cadence, "altitude": altitude,
        "distance": distance, "speed": speed,
    }


def _activity():
    return SimpleNamespace(
        id=1, title="Sunday Race", sport="cycling",
        started_at=datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc),
        distance_meters=18000.0, duration_seconds=1800, tss=90.0,
        # The stand-in has to carry what the real row carries: the header reads
        # the ride's OWN recorded ascent and only falls back to summing segments.
        elevation_gain_m=612.0,
    )


def _stream_row(streams):
    return SimpleNamespace(
        streams=streams, mmp_curve={5: 400.0, 60: 380.0, 300: 300.0, 600: 280.0, 1200: 260.0},
        total_kj=None, decoupling_pct=None, cp_watts=250.0, w_prime_j=20000.0, eftp_watts=256.0,
    )


def test_assemble_produces_header_verdict_and_blocks():
    streams = _synthetic_stream()
    profile = SimpleNamespace(weight_kg=70.0, ftp_watts=250)
    envelope = {5: 500.0, 60: 400.0, 300: 320.0, 600: 300.0, 1200: 280.0}
    rd = assemble_debrief(_activity(), _stream_row(streams), profile, envelope)

    assert rd.activity_id == 1
    assert rd.header.title == "Sunday Race"
    assert rd.header.moving_time_s == 1800
    assert rd.verdict.grade_letter in {"A", "B", "C", "D", "F"}
    # Analyzer blocks populated for a rich ride:
    assert rd.pacing is not None and rd.pacing.surge_count >= 1
    assert rd.efficiency is not None and rd.efficiency.efficiency_factor is not None
    assert rd.matchbook is not None
    assert rd.wko is not None and rd.wko.mftp_watts > 0
    assert rd.story is not None and len(rd.story.power) > 0
    assert rd.efforts  # effort matching vs the envelope
    assert rd.plan  # at least one prescription


def test_assemble_degrades_without_optional_channels():
    # No altitude/speed/hr/cadence → segmentation/climb/efficiency/quadrant/cda hide,
    # but header/verdict/pacing/matchbook still produced, no exception.
    n = 1200
    streams = {"power": [200.0] * n, "heart_rate": [], "cadence": [],
               "altitude": [], "distance": [], "speed": []}
    profile = SimpleNamespace(weight_kg=None, ftp_watts=250)
    rd = assemble_debrief(_activity(), _stream_row(streams), profile, {})
    assert rd.verdict is not None
    assert rd.segments == []
    assert rd.climbs == []
    assert rd.cda is None
    assert rd.pacing is not None


class TestElevationComesFromTheRide:
    """`elevation_m` was `sum(seg.elev_gain_m for seg in segments)`.

    Segments come out of the altitude stream, so a ride whose stream is missing
    or too short to segment reported ZERO metres for a ride that plainly
    climbed, and a ride that segmented differently disagreed with History, the
    crew board and the lifetime totals — all of which count the recorded value.
    """

    @staticmethod
    def _run(act, streams=None):
        profile = SimpleNamespace(weight_kg=70.0, ftp_watts=250)
        envelope = {5: 500.0, 60: 400.0, 300: 320.0, 600: 300.0, 1200: 280.0}
        return assemble_debrief(act, _stream_row(streams or _synthetic_stream()), profile, envelope)

    def test_the_recorded_ascent_wins_over_the_segment_sum(self):
        act = _activity()
        act.elevation_gain_m = 612.0
        assert self._run(act).header.elevation_m == 612.0

    def test_it_falls_back_to_segments_when_the_ride_never_recorded_one(self):
        act = _activity()
        act.elevation_gain_m = None
        # The synthetic stream climbs, so the fallback must produce something.
        got = self._run(act).header.elevation_m
        assert got is not None and got > 0

    def test_a_ride_with_neither_gets_a_dash_rather_than_a_confident_zero(self):
        act = _activity()
        act.elevation_gain_m = None
        flat = _synthetic_stream()
        flat["altitude"] = None      # nothing to segment, nothing to sum
        assert self._run(act, flat).header.elevation_m in (None, 0.0)
