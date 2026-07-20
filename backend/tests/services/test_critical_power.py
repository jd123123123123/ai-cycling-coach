"""Tests for the Critical Power / W′ model fit."""
from __future__ import annotations

import pytest

from app.services.critical_power import fit_critical_power


def _synthetic_mmp(cp: float, w_prime: float, durations) -> dict[int, float]:
    """Build an MMP curve that exactly obeys P(t) = CP + W'/t."""
    return {t: cp + w_prime / t for t in durations}


class TestFitCriticalPower:
    def test_recovers_known_cp_and_w_prime(self):
        mmp = _synthetic_mmp(250.0, 20000.0, [180, 300, 720, 1200])
        fit = fit_critical_power(mmp)
        assert fit is not None
        assert fit.cp_watts == pytest.approx(250.0, abs=1.0)
        assert fit.w_prime_j == pytest.approx(20000.0, abs=200.0)
        assert fit.r_squared == pytest.approx(1.0, abs=1e-6)

    def test_eftp_is_modeled_hour_power(self):
        # eFTP = modeled 60-min power = CP + W'/3600.
        mmp = _synthetic_mmp(250.0, 20000.0, [180, 300, 720, 1200])
        fit = fit_critical_power(mmp)
        assert fit.eftp_watts == pytest.approx(250.0 + 20000.0 / 3600.0, abs=1.0)

    def test_too_few_points_returns_none(self):
        assert fit_critical_power({300: 300.0}) is None

    def test_only_uses_points_in_valid_duration_band(self):
        # A 5 s sprint (anaerobic) and a 60-min point sit outside the CP band
        # and must be excluded; only the 3-20 min points drive the fit.
        mmp = _synthetic_mmp(250.0, 20000.0, [180, 300, 720, 1200])
        mmp[5] = 900.0      # neuromuscular spike — must be ignored
        mmp[3600] = 240.0   # below band — must be ignored
        fit = fit_critical_power(mmp)
        assert fit is not None
        assert fit.cp_watts == pytest.approx(250.0, abs=1.0)
        assert fit.n_points == 4

    def test_empty_curve_returns_none(self):
        assert fit_critical_power({}) is None

    def test_fit_reports_quality_metadata(self):
        # Downstream confidence scoring relies on n_points + r_squared.
        mmp = _synthetic_mmp(250.0, 20000.0, [180, 300, 720, 1200])
        fit = fit_critical_power(mmp)
        assert fit.n_points == 4
        assert 0.0 <= fit.r_squared <= 1.0


class TestSanitizedFitIntegration:
    """fit_critical_power stays pure; sanitization happens in the envelope
    (athlete_power_profile.build_sanitized_envelope) BEFORE the fit."""

    def test_corrupt_20min_point_cannot_inflate_cp(self):
        from app.services.athlete_power_profile import fit_athlete_cp

        base = {120: 300.0, 180: 285.0, 300: 270.0, 600: 255.0, 900: 248.0, 1200: 242.0}
        curves = [dict(base) for _ in range(5)]
        corrupt = dict(base)
        corrupt[1200] = 359.0  # the real-world artifact vs an all-time PR of 242
        clean_fit = fit_athlete_cp(curves)
        poisoned_fit = fit_athlete_cp(curves + [corrupt])
        assert clean_fit is not None and poisoned_fit is not None
        assert abs(poisoned_fit.cp_watts - clean_fit.cp_watts) < 2.0

    def test_corroborated_breakthrough_raises_cp(self):
        from app.services.athlete_power_profile import fit_athlete_cp

        base = {120: 300.0, 300: 270.0, 600: 255.0, 1200: 242.0}
        breakthrough = {1200: 260.0}
        confirm = {1200: 256.0}
        fit_before = fit_athlete_cp([dict(base) for _ in range(3)])
        fit_after = fit_athlete_cp([dict(base) for _ in range(3)] + [breakthrough, confirm])
        assert fit_after.cp_watts > fit_before.cp_watts
