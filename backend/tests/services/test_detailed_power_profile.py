"""Tests for the detailed (dense) power-profile builder."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.detailed_power_profile import (
    build_power_profile,
    compute_detailed_power_profile,
)


class TestBuildPowerProfile:
    def _rides(self):
        # Two 5-min-effort days (320 / 316 W — corroborating each other within
        # 5%) and two 20-min-effort days (250 / 247 W). The sanitized envelope
        # keeps a best effort only when a second ride corroborates it.
        a1 = [150.0] * 300 + [320.0] * 300 + [150.0] * 300
        a2 = [150.0] * 300 + [316.0] * 300 + [150.0] * 300
        b1 = [150.0] * 200 + [250.0] * 1200 + [150.0] * 200
        b2 = [150.0] * 200 + [247.0] * 1200 + [150.0] * 200
        return [a1, a2, b1, b2]

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
        assert prof["n_rides"] == 4

    def test_empty_returns_none(self):
        assert build_power_profile([], weight_kg=70.0) is None
        assert build_power_profile([[], []], weight_kg=70.0) is None

    def test_corrupt_ride_never_renders_in_curve_or_peaks(self):
        # Audit P0-1: a corrupt 359-W sustained "effort" (flat sensor artifact)
        # must not appear in the chart curve, the peaks, or the CP fit.
        rides = self._rides() + [[359.0] * 1500]
        prof = build_power_profile(rides, weight_kg=70.0)
        assert prof["peaks"]["1200"] == pytest.approx(250.0, abs=1.0)
        assert prof["peaks"]["300"] == pytest.approx(320.0, abs=1.0)
        assert max(prof["mmp_curve"].values()) <= 321.0

    def test_envelope_is_non_increasing(self):
        prof = build_power_profile(self._rides(), weight_kg=70.0)
        values = [prof["mmp_curve"][d] for d in sorted(prof["mmp_curve"])]
        assert all(a >= b for a, b in zip(values, values[1:]))

    def test_threshold_fields_manual_ftp_wins(self):
        prof = build_power_profile(self._rides(), weight_kg=70.0, ftp_watts=240.0)
        assert prof["threshold_watts"] == 240
        assert prof["threshold_source"] == "manual"
        assert isinstance(prof["model_valid"], bool)
        assert 0.0 <= prof["confidence"] <= 1.0

    def test_threshold_falls_back_to_model_eftp(self):
        prof = build_power_profile(self._rides(), weight_kg=70.0)
        assert prof["threshold_source"] == "model"
        assert prof["threshold_watts"] == round(prof["eftp_watts"])
        assert prof["model_valid"] is True

    def test_model_suppressed_when_disagreeing_with_manual_ftp(self):
        # Model eFTP lands near 245 W for this fixture; a manual FTP of 180 W
        # disagrees by far more than 10% → CP/W′ display must be suppressed.
        prof = build_power_profile(self._rides(), weight_kg=70.0, ftp_watts=180.0)
        assert prof["threshold_watts"] == 180
        assert prof["model_valid"] is False


@pytest.mark.asyncio
async def test_detailed_profile_query_excludes_run_streams():
    """The stream query must carry the cycling marker (mmp_curve IS NOT NULL) —
    runs, whose power model is deliberately nulled at ingest, and guard-flagged
    corrupt rides must never be refit from raw streams."""
    captured: list[str] = []
    db = MagicMock()

    async def _execute(stmt):  # noqa: ANN001
        captured.append(str(stmt))
        res = MagicMock()
        res.all.return_value = []
        res.first.return_value = None
        return res

    db.execute = AsyncMock(side_effect=_execute)
    out = await compute_detailed_power_profile(db, user_id=1)
    assert out is None
    assert "mmp_curve IS NOT NULL" in captured[0]
