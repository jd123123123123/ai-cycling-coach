"""Tests for the detailed (dense) power-profile builder."""
from __future__ import annotations

import pytest

from app.services.detailed_power_profile import build_power_profile


class TestBuildPowerProfile:
    def _rides(self):
        # Ride A: a 5-min effort @ 320 inside easy riding. Ride B: a 20-min @ 250.
        a = [150.0] * 300 + [320.0] * 300 + [150.0] * 300
        b = [150.0] * 200 + [250.0] * 1200 + [150.0] * 200
        return [a, b]

    def test_dense_curve_has_many_points(self):
        prof = build_power_profile(self._rides(), weight_kg=70.0)
        assert prof is not None
        # The densified duration set yields a rich curve (≥ 10 points here).
        assert len(prof["mmp_curve"]) >= 10
        # Envelope takes the best across rides at each duration.
        assert prof["mmp_curve"][300] == pytest.approx(320.0, abs=1.0)

    def test_peaks_reported_at_key_durations(self):
        prof = build_power_profile(self._rides(), weight_kg=70.0)
        assert prof["peaks"]["300"] == pytest.approx(320.0, abs=1.0)
        assert prof["peaks"]["1200"] == pytest.approx(250.0, abs=1.0)

    def test_w_per_kg_present_with_weight(self):
        prof = build_power_profile(self._rides(), weight_kg=80.0)
        assert prof["cp_wkg"] == pytest.approx(prof["cp_watts"] / 80.0, abs=0.01)
        assert prof["wkg_curve"]["300"] == pytest.approx(prof["mmp_curve"][300] / 80.0, abs=0.01)

    def test_no_weight_omits_w_per_kg(self):
        prof = build_power_profile(self._rides(), weight_kg=None)
        assert prof["cp_wkg"] is None
        assert prof["wkg_curve"] is None

    def test_includes_cp_fit(self):
        prof = build_power_profile(self._rides(), weight_kg=70.0)
        assert prof["cp_watts"] is not None
        assert prof["w_prime_j"] > 0
        assert prof["n_rides"] == 2

    def test_empty_returns_none(self):
        assert build_power_profile([], weight_kg=70.0) is None
        assert build_power_profile([[], []], weight_kg=70.0) is None
