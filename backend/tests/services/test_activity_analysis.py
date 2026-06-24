"""Tests for the ride-analysis orchestrator (streams → science bundle)."""
from __future__ import annotations

import pytest

from app.services.activity_analysis import analyze_streams


class TestAnalyzeStreams:
    def test_steady_ride_core_metrics(self):
        power = [200.0] * 1200  # 20 min steady @ 200 W
        a = analyze_streams(power, ftp=250.0)
        assert a.np_watts == pytest.approx(200.0, abs=1.0)
        assert a.if_ == pytest.approx(0.8, abs=0.01)       # NP / FTP
        assert a.vi == pytest.approx(1.0, abs=0.01)         # NP / avg
        assert a.total_kj == pytest.approx(240.0, abs=1.0)  # 200 W * 1200 s
        assert a.duration_s == 1200
        assert a.mmp_curve  # non-empty curve

    def test_flat_ride_has_no_w_balance(self):
        # No efforts above CP → W' ≈ 0 → W'bal is undefined and must be None,
        # never a divide-by-zero.
        a = analyze_streams([200.0] * 1200, ftp=250.0)
        assert a.w_bal is None

    def test_ride_with_distinct_efforts_yields_critical_power(self):
        # Two isolated max efforts (5-min @ 300, 12-min @ 270) padded by easy
        # riding → a fittable power-duration relationship.
        power = (
            [150.0] * 600
            + [300.0] * 300      # 5-min effort
            + [150.0] * 1200
            + [270.0] * 720      # 12-min effort
            + [150.0] * 600
        )
        a = analyze_streams(power, ftp=250.0)
        assert a.cp is not None
        assert 150.0 < a.cp.cp_watts < 320.0
        assert a.cp.w_prime_j > 0
        # With a real W', the W'bal trajectory is computable.
        assert a.w_bal is not None

    def test_decoupling_computed_when_hr_present(self):
        power = [200.0] * 600
        hr = [130.0] * 300 + [140.0] * 300
        a = analyze_streams(power, hr_series=hr, ftp=250.0)
        assert a.decoupling_pct == pytest.approx(7.1, abs=0.5)

    def test_empty_power_degrades_gracefully(self):
        a = analyze_streams([], ftp=250.0)
        assert a.np_watts == 0.0
        assert a.total_kj == 0.0
        assert a.cp is None
        assert a.w_bal is None
        assert a.durability is None
        assert a.mmp_curve == {}

    def test_no_ftp_leaves_if_none_but_keeps_rest(self):
        a = analyze_streams([200.0] * 600, ftp=None)
        assert a.if_ is None
        assert a.np_watts == pytest.approx(200.0, abs=1.0)
