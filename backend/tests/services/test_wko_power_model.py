"""Tests for the WKO-style power-duration model."""
from __future__ import annotations

from app.services.wko_power_model import WkoPowerModel, fit_wko_model


def _synthetic_mmp(cp: float, w_prime: float) -> dict[int, float]:
    """MMP curve from a known CP/W′: P(t) = cp + w_prime/t, plus a sprint point."""
    mmp = {t: cp + w_prime / t for t in (120, 180, 300, 480, 600, 720, 1200)}
    mmp[5] = 1000.0   # neuromuscular sprint, above the CP band
    mmp[1] = 1200.0
    return mmp


class TestFitWkoModel:
    def test_none_when_cp_underdetermined(self):
        # Only one point in the CP band → fit_critical_power returns None.
        assert fit_wko_model({300: 320.0}) is None

    def test_recovers_cp_and_wprime(self):
        model = fit_wko_model(_synthetic_mmp(250.0, 20000.0))
        assert abs(model.cp_watts - 250.0) < 2.0
        assert abs(model.w_prime_j - 20000.0) < 500.0
        assert model.frc_j == model.w_prime_j

    def test_pmax_from_shortest_efforts(self):
        model = fit_wko_model(_synthetic_mmp(250.0, 20000.0))
        assert model.pmax_watts == 1200.0   # best power at <=5 s

    def test_mftp_equals_eftp(self):
        model = fit_wko_model(_synthetic_mmp(250.0, 20000.0))
        # eFTP = CP + W'/3600 ≈ 250 + 5.6
        assert abs(model.mftp_watts - (250.0 + 20000.0 / 3600.0)) < 1.0

    def test_tte_is_longest_duration_at_or_above_mftp(self):
        model = fit_wko_model(_synthetic_mmp(250.0, 20000.0))
        # On this curve every band point > mFTP up to 1200 s → tte at least 1200.
        assert model.tte_s is not None
        assert model.tte_s >= 1200

    def test_vo2max_none_without_mass(self):
        assert fit_wko_model(_synthetic_mmp(250.0, 20000.0)).vo2max_estimate is None

    def test_vo2max_estimated_with_mass(self):
        model = fit_wko_model(_synthetic_mmp(250.0, 20000.0), mass_kg=70.0)
        assert model.vo2max_estimate is not None
        assert 30.0 < model.vo2max_estimate < 90.0  # physiological range
