"""Tests for cross-ride MMP aggregation → athlete-level Critical Power,
including the audit-P0-1 sanitized envelope + canonical threshold."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.athlete_power_profile import (
    aggregate_mmp_curves,
    build_sanitized_envelope,
    compute_athlete_power_profile,
    fit_athlete_cp,
    model_confidence,
    reconcile_threshold,
    reject_uncorroborated_peaks,
)


class TestAggregateMMP:
    def test_takes_best_power_at_each_duration(self):
        curves = [
            {60: 400.0, 300: 300.0, 1200: 250.0},
            {60: 450.0, 300: 290.0, 1200: 255.0},
        ]
        agg = aggregate_mmp_curves(curves)
        assert agg == {60: 450.0, 300: 300.0, 1200: 255.0}

    def test_handles_string_keys_from_json(self):
        # Stored mmp_curve JSON has string duration keys.
        curves = [{"300": 300.0, "1200": 250.0}, {"300": 310.0}]
        agg = aggregate_mmp_curves(curves)
        assert agg[300] == 310.0
        assert agg[1200] == 250.0

    def test_unions_durations_across_rides(self):
        curves = [{60: 500.0}, {1200: 240.0}]
        assert aggregate_mmp_curves(curves) == {60: 500.0, 1200: 240.0}

    def test_empty_returns_empty(self):
        assert aggregate_mmp_curves([]) == {}
        assert aggregate_mmp_curves([{}, {}]) == {}


class TestFitAthleteCP:
    def test_fits_cp_from_aggregate_of_distinct_efforts(self):
        # Best 3-min from a hard day, best 12-min from a long day → a real
        # athlete power-duration relationship the single rides couldn't give.
        curves = [
            {180: 340.0, 300: 315.0},   # short-effort day
            {720: 278.0, 1200: 267.0},  # long-effort day
        ]
        fit = fit_athlete_cp(curves)
        assert fit is not None
        assert 230.0 < fit.cp_watts < 290.0
        assert fit.w_prime_j > 0

    def test_insufficient_data_returns_none(self):
        assert fit_athlete_cp([{300: 300.0}]) is None
        assert fit_athlete_cp([]) is None


class TestBuildSanitizedEnvelope:
    def test_359w_artifact_rejected(self):
        # The real-world poison case: one corrupt 20-min value of 359 W against
        # an all-time PR of 242 W. Uncorroborated and >5% over → rejected.
        curves = [
            {"1200": 242.0}, {"1200": 240.0}, {"1200": 238.0}, {"1200": 359.0},
        ]
        env = build_sanitized_envelope(curves)
        assert env[1200] == 242.0

    def test_two_ride_corroboration_accepts_breakthrough(self):
        # A genuine jump confirmed by a second ride within 5% survives.
        curves = [
            {"1200": 240.0}, {"1200": 238.0}, {"1200": 300.0}, {"1200": 295.0},
        ]
        env = build_sanitized_envelope(curves)
        assert env[1200] == 300.0

    def test_mad_filter_kills_duplicated_corruption(self):
        # Two identical corrupt spikes corroborate each other — the MAD filter
        # (n ≥ 6) still rejects them as statistical outliers.
        curves = [{"1200": 240.0} for _ in range(6)]
        curves += [{"1200": 359.0}, {"1200": 358.0}]
        env = build_sanitized_envelope(curves)
        assert env[1200] == 240.0

    def test_envelope_monotonic_non_increasing(self):
        # A corroborated-but-inconsistent long-duration point cannot exceed a
        # shorter-duration point after sanitization.
        curves = [
            {300: 250.0, 600: 240.0},
            {300: 245.0, 600: 300.0},
            {600: 296.0},
        ]
        env = build_sanitized_envelope(curves)
        assert env[300] == 250.0
        assert env[600] <= env[300]

    def test_single_ride_kept_verbatim(self):
        env = build_sanitized_envelope([{60: 500.0, 300: 320.0}])
        assert env == {60: 500.0, 300: 320.0}

    def test_empty_input(self):
        assert build_sanitized_envelope([]) == {}
        assert build_sanitized_envelope([{}, {}]) == {}


class TestRejectUncorroboratedPeaks:
    def test_lone_spike_dropped(self):
        assert max(reject_uncorroborated_peaks([240.0, 238.0, 359.0])) == 240.0

    def test_corroborated_peak_kept(self):
        assert max(reject_uncorroborated_peaks([240.0, 300.0, 296.0])) == 300.0

    def test_small_lead_kept_without_corroboration(self):
        # 4% over the rest-PR is within tolerance — no corroboration needed.
        assert max(reject_uncorroborated_peaks([240.0, 249.0])) == 249.0

    def test_single_value_kept(self):
        assert reject_uncorroborated_peaks([500.0]) == [500.0]


class TestReconcileThreshold:
    def test_manual_ftp_wins(self):
        rec = reconcile_threshold(240, 250.0)
        # The athlete's number is still the displayed threshold; the record now
        # also carries what the MODEL thinks, so a disagreement is visible
        # rather than silently suppressed.
        assert rec["threshold_watts"] == 240
        assert rec["threshold_source"] == "manual"
        assert rec["model_valid"] is True
        assert rec["load_model_warning"] is False

    def test_model_suppressed_beyond_10pct_disagreement(self):
        rec = reconcile_threshold(240, 300.0)
        assert rec["threshold_watts"] == 240
        assert rec["threshold_source"] == "manual"
        assert rec["model_valid"] is False

    def test_model_used_without_manual_ftp(self):
        rec = reconcile_threshold(None, 251.4)
        assert rec == {
            "threshold_watts": 251,
            "threshold_source": "model",
            "model_valid": True,
        }

    def test_nothing_available(self):
        rec = reconcile_threshold(None, None)
        assert rec["threshold_watts"] is None
        assert rec["model_valid"] is False

    def test_confidence_bounds(self):
        assert model_confidence(0, 1.0) == 0.0
        assert model_confidence(12, 1.0) == 1.0
        assert 0.0 <= model_confidence(5, 0.9) <= 1.0
        assert model_confidence(30, None) == 0.0


def _db_with_curves(curves: list[dict]):
    db = MagicMock()
    result = MagicMock()
    result.all.return_value = [(c,) for c in curves]
    db.execute = AsyncMock(return_value=result)
    return db


class _Profile:
    def __init__(self, ftp_watts: int | None):
        self.ftp_watts = ftp_watts


class TestComputeAthletePowerProfile:
    CURVES = [
        {"300": 300.0, "600": 280.0, "1200": 260.0},
        {"300": 296.0, "600": 277.0, "1200": 257.0},
    ]

    @pytest.mark.asyncio
    async def test_manual_ftp_is_canonical_threshold(self):
        prof = await compute_athlete_power_profile(
            _db_with_curves(self.CURVES), 1, profile=_Profile(240)
        )
        assert prof["threshold_watts"] == 240
        assert prof["threshold_source"] == "manual"
        assert prof["model_valid"] is True  # eFTP ≈ 251 W, within 10% of 240
        assert prof["n_rides"] == 2
        assert 0.0 <= prof["confidence"] <= 1.0

    @pytest.mark.asyncio
    async def test_model_threshold_without_profile(self):
        prof = await compute_athlete_power_profile(_db_with_curves(self.CURVES), 1)
        assert prof["threshold_source"] == "model"
        assert prof["threshold_watts"] == round(prof["eftp_watts"])

    @pytest.mark.asyncio
    async def test_corrupt_curve_does_not_move_cp(self):
        corrupt = self.CURVES + [{"1200": 359.0}]
        clean = await compute_athlete_power_profile(_db_with_curves(self.CURVES), 1)
        poisoned = await compute_athlete_power_profile(_db_with_curves(corrupt), 1)
        assert abs(poisoned["cp_watts"] - clean["cp_watts"]) < 3.0
        assert poisoned["mmp_curve"][1200] <= 260.0


class TestDisagreementIsSurfacedNotHidden:
    """`model_valid=False` was consumed as "hide CP/W′". The model had been fit
    to the athlete's own maximal efforts and concluded their threshold was far
    from the number they typed — while every TSS, zone and CTL value is scaled
    by that typed number. Hiding the model hid the evidence that the load model
    was wrong."""

    def test_a_large_divergence_warns_about_the_load_model(self):
        from app.services.athlete_power_profile import reconcile_threshold
        r = reconcile_threshold(250, 300.0)   # model says +20%
        assert r["load_model_warning"] is True
        assert r["divergence_pct"] == 20.0
        assert r["suggested_threshold_watts"] == 300

    def test_agreement_raises_no_warning(self):
        from app.services.athlete_power_profile import reconcile_threshold
        r = reconcile_threshold(250, 255.0)
        assert r["load_model_warning"] is False

    def test_the_athletes_number_still_wins_as_the_displayed_threshold(self):
        # Surfacing the disagreement is not the same as overriding the athlete.
        from app.services.athlete_power_profile import reconcile_threshold
        r = reconcile_threshold(250, 300.0)
        assert r["threshold_watts"] == 250
        assert r["threshold_source"] == "manual"

    def test_no_model_means_no_claim_either_way(self):
        from app.services.athlete_power_profile import reconcile_threshold
        r = reconcile_threshold(250, None)
        assert r["load_model_warning"] is False
        assert r["divergence_pct"] is None
