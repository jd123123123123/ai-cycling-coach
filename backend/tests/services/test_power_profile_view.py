"""Tests for the V3 Power Profile view-model builder (power_profile_view).

Pure functions only — the async composer is exercised via the API test. These
cover the four view-specific derivations the V3 · Power Profile surface adds on
top of the existing sanitized envelope / CP fit: power zones, cohort benchmark
bands, monthly FTP progression, recent-PR flagging and phenotype traits.
"""
from __future__ import annotations

from datetime import date

import pytest

from app.services.power_profile_view import (
    benchmark_bands,
    ftp_progression,
    hero_curve,
    phenotype_traits,
    recent_pr_durations,
    power_zones,
)


class TestPowerZones:
    def test_six_zones_from_ftp(self):
        zones = power_zones(281)
        assert [z["code"] for z in zones] == ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"]
        # Coggan upper bounds as fractions of FTP.
        z1, z2, z4, z6 = zones[0], zones[1], zones[3], zones[5]
        assert z1["low"] is None  # Z1 is "≤ high"
        assert z1["high"] == round(0.55 * 281)
        # Contiguous: each zone's low is the previous high + 1.
        assert z2["low"] == zones[0]["high"] + 1
        # Z4 straddles threshold (0.91–1.05).
        assert z4["low"] == round(0.90 * 281) + 1
        assert z4["high"] == round(1.05 * 281)
        # Z6 is open-ended.
        assert z6["high"] is None
        assert z6["low"] == round(1.20 * 281) + 1

    def test_no_ftp_yields_empty(self):
        assert power_zones(None) == []
        assert power_zones(0) == []


class TestBenchmarkBands:
    def test_racer_category(self):
        b = benchmark_bands(4.1)
        assert b is not None
        assert b["category_key"] == "racer"
        assert 0 <= b["position_pct"] <= 100
        assert [band["key"] for band in b["bands"]] == ["everyday", "racer", "pro"]

    def test_everyday_and_pro_edges(self):
        assert benchmark_bands(2.4)["category_key"] == "everyday"
        assert benchmark_bands(5.2)["category_key"] == "pro"

    def test_none_when_no_wkg(self):
        assert benchmark_bands(None) is None


class TestFtpProgression:
    def test_monthly_eftp_from_cumulative_envelope(self):
        # A 5-min effort in March, a stronger one in May — cumulative envelope
        # (and thus eFTP) is non-decreasing month over month.
        mar = {60: 400.0, 300: 300.0, 1200: 250.0}
        may = {60: 430.0, 300: 330.0, 1200: 275.0}
        rides = [
            (date(2026, 3, 10), mar),
            (date(2026, 5, 12), may),
        ]
        prog = ftp_progression(rides, ftp_watts=None)
        assert len(prog) >= 2
        # Chronological, current month last, watts non-decreasing.
        watts = [p["watts"] for p in prog]
        assert watts == sorted(watts)
        assert prog[-1]["is_current"] is True

    def test_empty_when_no_rides(self):
        assert ftp_progression([], ftp_watts=None) == []


class TestRecentPRs:
    def test_flags_duration_whose_best_is_recent(self):
        old = (date(2026, 1, 1), {5: 900.0, 1200: 260.0})
        new = (date(2026, 7, 20), {5: 1200.0, 1200: 255.0})
        prs = recent_pr_durations([old, new], today=date(2026, 7, 21), window_days=14)
        # 5 s best came from the recent ride → PR. 1200 s best is the old ride.
        assert 5 in prs
        assert 1200 not in prs

    def test_empty_without_data(self):
        assert recent_pr_durations([], today=date(2026, 7, 21)) == set()


class TestHeroCurve:
    def test_points_with_wkg_and_pr_flag(self):
        envelope = {5: 1200.0, 15: 1000.0, 60: 640.0, 300: 380.0, 1200: 305.0, 3600: 272.0}
        pts = hero_curve(envelope, weight_kg=74.0, pr_durations={5, 1200})
        by = {p["seconds"]: p for p in pts}
        assert by[5]["watts"] == 1200.0
        assert by[5]["wkg"] == pytest.approx(1200.0 / 74.0, abs=0.01)
        assert by[5]["is_pr"] is True
        assert by[60]["is_pr"] is False
        # Missing durations are emitted with null watts (honest dash), not dropped.
        sparse = hero_curve({5: 900.0}, weight_kg=None, pr_durations=set())
        by2 = {p["seconds"]: p for p in sparse}
        assert by2[1200]["watts"] is None
        assert by2[5]["wkg"] is None


class TestPhenotypeTraits:
    def test_four_traits_scaled_0_100(self):
        reserves = {"neuromuscular_x": 2.6, "anaerobic_x": 1.8, "vo2_x": 1.2}
        traits = phenotype_traits(reserves, durability_best_pct=6.0)
        assert [t["key"] for t in traits] == ["sprint", "short_climbs", "threshold", "endurance"]
        for t in traits:
            assert 0 <= t["pct"] <= 100
