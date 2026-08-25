"""Unit tests for advanced_metrics.

Covers:
    - Pure numeric functions: aerobic_decoupling, efficiency_factor, durability_index
    - compute_activity_metrics over synthetic Activity objects
    - DB-backed helpers with mocked AsyncSession returning fake ORM instances:
        hrv_trend, zone_distribution grey-zone flag
    - why_am_i_tired cross-references HRV suppression into an ordered cause list
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.advanced_metrics import (
    aerobic_decoupling,
    compute_activity_metrics,
    durability_index,
    efficiency_factor,
    hrv_trend,
    rhr_trend,
    sleep_debt,
    why_am_i_tired,
    zone_distribution,
)


# ---------------------------------------------------------------------------
# Pure functions
# ---------------------------------------------------------------------------

class TestAerobicDecoupling:
    def test_steady_ride_zero_drift(self):
        """Identical NP/HR in both halves → 0% decoupling."""
        result = aerobic_decoupling(200.0, 150.0, 200.0, 150.0)
        assert result == 0.0

    def test_hr_drift_up_produces_negative_decoupling(self):
        """Same power, HR drifts up → pw:hr ratio drops → negative decoupling."""
        result = aerobic_decoupling(200.0, 150.0, 200.0, 160.0)
        # pw_hr first = 1.333; second = 1.25; delta = (1.25/1.333 - 1)*100 = -6.25
        assert result is not None
        assert result < 0
        assert abs(result + 6.25) < 0.1

    def test_power_holds_hr_steady_positive(self):
        """Power up at same HR → positive decoupling (economy *improved*)."""
        result = aerobic_decoupling(200.0, 150.0, 220.0, 150.0)
        assert result is not None
        assert result > 0

    def test_zero_hr_returns_none(self):
        """Guard against div-by-zero: 0 HR → None."""
        assert aerobic_decoupling(200.0, 0.0, 200.0, 150.0) is None
        assert aerobic_decoupling(200.0, 150.0, 200.0, 0.0) is None

    def test_zero_np_returns_none(self):
        """Guard against zero NP."""
        assert aerobic_decoupling(0.0, 150.0, 200.0, 150.0) is None


class TestEfficiencyFactor:
    def test_happy_path(self):
        """EF = NP / avgHR in W/bpm."""
        assert efficiency_factor(240.0, 150.0) == 1.6

    def test_rounds_to_three_decimals(self):
        """Output rounded to 3 decimals."""
        # 250 / 147 = 1.7006802... → 1.701
        assert efficiency_factor(250.0, 147.0) == 1.701

    def test_none_inputs_return_none(self):
        assert efficiency_factor(None, 150.0) is None
        assert efficiency_factor(240.0, None) is None

    def test_zero_hr_returns_none(self):
        assert efficiency_factor(240.0, 0.0) is None


class TestDurabilityIndex:
    def test_fresh_equals_fatigued_is_one(self):
        """No power drop after fatigue → index = 1.0."""
        assert durability_index(300.0, 300.0) == 1.0

    def test_six_point_five_pct_drop(self):
        """2025 PMC successful-amateur benchmark: 6.5% drop = 0.935."""
        assert durability_index(300.0, 280.5) == 0.935

    def test_zero_fresh_returns_none(self):
        """Guard against div-by-zero on fresh_np=0."""
        assert durability_index(0.0, 280.0) is None

    def test_none_inputs_return_none(self):
        assert durability_index(None, 280.0) is None
        assert durability_index(300.0, None) is None


# ---------------------------------------------------------------------------
# compute_activity_metrics — works on an Activity-shaped object
# ---------------------------------------------------------------------------

def _fake_activity(
    *,
    normalized_power: float | None = None,
    average_power: float | None = None,
    average_hr: float | None = None,
    duration_seconds: int | None = None,
    raw_data: dict | None = None,
):
    return SimpleNamespace(
        normalized_power=normalized_power,
        average_power=average_power,
        average_hr=average_hr,
        duration_seconds=duration_seconds,
        raw_data=raw_data,
    )


class TestComputeActivityMetrics:
    def test_summary_only_ef(self):
        """With only summary NP + avgHR, EF is computable but decoupling isn't."""
        act = _fake_activity(normalized_power=240.0, average_hr=150.0)
        result = compute_activity_metrics(act)
        assert result["ef"] == 1.6
        assert result["decoupling"] is None
        assert result["durability"] is None

    def test_no_data_all_none(self):
        act = _fake_activity()
        result = compute_activity_metrics(act)
        assert result == {"decoupling": None, "ef": None, "durability": None}

    def test_raw_samples_enables_decoupling(self):
        """With per-second samples, decoupling is computed."""
        # First half: 200W @ 150bpm — second half: same power but HR drifts to 160bpm
        power = [200.0] * 1800 + [200.0] * 1800
        hr = [150.0] * 1800 + [160.0] * 1800
        act = _fake_activity(
            normalized_power=200.0,
            average_hr=155.0,
            duration_seconds=3600,
            raw_data={"power_samples": power, "hr_samples": hr},
        )
        result = compute_activity_metrics(act)
        assert result["ef"] is not None
        assert result["decoupling"] is not None
        assert result["decoupling"] < 0  # HR drifted up → negative

    def test_short_ride_no_durability(self):
        """60-min ride with <1000kJ does not produce a durability index."""
        power = [200.0] * 1800 + [200.0] * 1800
        hr = [150.0] * 1800 + [160.0] * 1800
        act = _fake_activity(
            average_power=200.0,
            average_hr=155.0,
            duration_seconds=3600,  # 60 min, kJ ≈ 720
            raw_data={"power_samples": power, "hr_samples": hr},
        )
        result = compute_activity_metrics(act)
        assert result["durability"] is None


# ---------------------------------------------------------------------------
# DB-backed helpers — mock AsyncSession
# ---------------------------------------------------------------------------

def _fake_metric(*, hrv: float | None = None, rhr: int | None = None, days_ago: int = 0, raw: dict | None = None):
    return SimpleNamespace(
        hrv_status=hrv,
        resting_hr=rhr,
        recorded_at=datetime.now().astimezone() - timedelta(days=days_ago),
        raw_data=raw,
    )


def _mock_db_returning(entities: list):
    """Build an AsyncMock AsyncSession whose .execute(...).scalars().all() returns entities."""
    db = MagicMock()
    scalars = MagicMock()
    scalars.all = MagicMock(return_value=entities)
    exec_result = MagicMock()
    exec_result.scalars = MagicMock(return_value=scalars)
    exec_result.scalar_one_or_none = MagicMock(return_value=None)
    exec_result.scalar = MagicMock(return_value=None)
    db.execute = AsyncMock(return_value=exec_result)
    return db


@pytest.mark.asyncio
class TestHrvTrend:
    async def test_no_data_returns_none_fields(self):
        db = _mock_db_returning([])
        result = await hrv_trend(db, user_id=1, days=7)
        assert result["current_mean"] is None
        assert result["baseline_28d_mean"] is None
        assert result["delta_pct"] is None
        assert result["samples_n"] == 0

    async def test_suppression_detected(self):
        """7-day mean 50ms vs 28-day mean 60ms → ~-17% delta."""
        # Last 7 days at 50ms, 8-28 days at 65ms → baseline pulled down by recents too
        recent = [_fake_metric(hrv=50, days_ago=d) for d in range(7)]
        older = [_fake_metric(hrv=65, days_ago=d) for d in range(8, 28)]
        db = _mock_db_returning(recent + older)

        result = await hrv_trend(db, user_id=1, days=7)
        assert result["samples_n"] == 7
        assert result["current_mean"] == 50.0
        # Baseline = (7*50 + 20*65) / 27 ≈ 61.1
        assert result["baseline_28d_mean"] is not None
        # delta should be strongly negative
        assert result["delta_pct"] is not None
        assert result["delta_pct"] < -10
        assert result["direction"] == "down"

    async def test_stable_direction(self):
        """Recent and baseline within 3% → direction 'stable'."""
        metrics = [_fake_metric(hrv=60, days_ago=d) for d in range(28)]
        db = _mock_db_returning(metrics)

        result = await hrv_trend(db, user_id=1, days=7)
        assert result["direction"] == "stable"


@pytest.mark.asyncio
class TestRhrTrend:
    async def test_elevation_detected(self):
        """rHR up = worse. 7d @ 60, 28d @ 55 → delta +9%, direction 'up'."""
        recent = [_fake_metric(rhr=60, days_ago=d) for d in range(7)]
        older = [_fake_metric(rhr=54, days_ago=d) for d in range(8, 28)]
        db = _mock_db_returning(recent + older)

        result = await rhr_trend(db, user_id=1, days=7)
        assert result["current_mean"] == 60.0
        assert result["delta_pct"] is not None
        assert result["delta_pct"] > 5
        assert result["direction"] == "up"


@pytest.mark.asyncio
class TestSleepDebt:
    async def test_no_metrics_returns_zeros(self):
        db = _mock_db_returning([])
        result = await sleep_debt(db, user_id=1, days=14)
        assert result["total_debt_hours"] == 0.0
        assert result["samples_n"] == 0

    async def test_extracts_hours_from_sleep_hours_shape(self):
        """raw_data.sleep.hours form is read correctly. Target updated to 7.5h
        per AASM healthy-adult range (was 8h, which over-flagged athletes
        averaging 7.5h as 'short on sleep')."""
        # 14 nights of 7h sleep vs 7.5h target = 7h total debt (0.5h × 14)
        metrics = [
            _fake_metric(days_ago=d, raw={"sleep": {"hours": 7.0}})
            for d in range(14)
        ]
        db = _mock_db_returning(metrics)
        result = await sleep_debt(db, user_id=1, days=14)
        assert result["samples_n"] == 14
        assert result["total_debt_hours"] == 7.0
        assert result["nights_short"] == 14
        assert result["nights_healthy"] == 0


@pytest.mark.asyncio
class TestZoneDistributionGreyZoneFlag:
    async def test_grey_zone_flag_at_20_percent_threshold(self):
        """z2 > 20% → grey_zone_flag True. Boundary tested: 21% triggers.

        We need FTP present so the helper can compute IF. The helper calls
        text() against athlete_profiles — we mock that scalar_one_or_none.
        """
        # Build activities: total duration 10h. 75% in Z1 (IF<0.77), 21% in Z2 (0.77-1.0),
        # 4% in Z3 (>1.0). With FTP=300, 200W NP = IF 0.667 (Z1), 250W = 0.833 (Z2), 310W = Z3.
        acts = []
        # Z1: 7.5h / 27000s
        acts.append(SimpleNamespace(
            duration_seconds=27000, normalized_power=200.0, average_power=200.0,
            started_at=datetime.now(timezone.utc) - timedelta(days=2),
            sport="cycling", user_id=1,
        ))
        # Z2: 2.1h / 7560s (21%)
        acts.append(SimpleNamespace(
            duration_seconds=7560, normalized_power=250.0, average_power=250.0,
            started_at=datetime.now(timezone.utc) - timedelta(days=4),
            sport="cycling", user_id=1,
        ))
        # Z3: 0.4h / 1440s
        acts.append(SimpleNamespace(
            duration_seconds=1440, normalized_power=310.0, average_power=310.0,
            started_at=datetime.now(timezone.utc) - timedelta(days=6),
            sport="cycling", user_id=1,
        ))

        # Build a MagicMock that returns activities for the Activity query AND
        # an FTP scalar for the raw text() query for athlete_profiles.
        db = MagicMock()
        scalars_mock = MagicMock()
        scalars_mock.all = MagicMock(return_value=acts)
        activity_result = MagicMock()
        activity_result.scalars = MagicMock(return_value=scalars_mock)

        ftp_result = MagicMock()
        ftp_result.scalar_one_or_none = MagicMock(return_value=300)

        # First .execute() call → activities, second → FTP.
        db.execute = AsyncMock(side_effect=[activity_result, ftp_result])

        result = await zone_distribution(db, user_id=1, days=28)
        # Verify we actually count all three activities (FTP path worked)
        assert result["samples_n"] == 3
        assert result["z2_pct"] >= 20
        assert result["grey_zone_flag"] is True

    async def test_healthy_distribution_no_flag(self):
        """Z2 at 10% is well under the 20% threshold."""
        acts = []
        # Z1 80% / 28800s
        acts.append(SimpleNamespace(
            duration_seconds=28800, normalized_power=200.0, average_power=200.0,
            started_at=datetime.now(timezone.utc) - timedelta(days=2),
            sport="cycling", user_id=1,
        ))
        # Z2 10% / 3600s
        acts.append(SimpleNamespace(
            duration_seconds=3600, normalized_power=250.0, average_power=250.0,
            started_at=datetime.now(timezone.utc) - timedelta(days=4),
            sport="cycling", user_id=1,
        ))
        # Z3 10% / 3600s
        acts.append(SimpleNamespace(
            duration_seconds=3600, normalized_power=310.0, average_power=310.0,
            started_at=datetime.now(timezone.utc) - timedelta(days=6),
            sport="cycling", user_id=1,
        ))

        db = MagicMock()
        scalars_mock = MagicMock()
        scalars_mock.all = MagicMock(return_value=acts)
        activity_result = MagicMock()
        activity_result.scalars = MagicMock(return_value=scalars_mock)
        ftp_result = MagicMock()
        ftp_result.scalar_one_or_none = MagicMock(return_value=300)
        db.execute = AsyncMock(side_effect=[activity_result, ftp_result])

        result = await zone_distribution(db, user_id=1, days=28)
        assert result["grey_zone_flag"] is False


# ---------------------------------------------------------------------------
# why_am_i_tired — cross-reference ordering
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestWhyAmITired:
    async def test_hrv_suppression_produces_high_severity_cause(self, monkeypatch):
        """When HRV is -15%, the first cause should be HRV suppression with 'high' severity."""
        async def fake_hrv(*_a, **_k):
            return {
                "delta_pct": -15.0, "current_mean": 45.0,
                "baseline_28d_mean": 53.0, "samples_n": 7, "direction": "down",
            }

        async def fake_rhr(*_a, **_k):
            return {"delta_pct": 1.0, "current_mean": 55, "baseline_28d_mean": 54, "samples_n": 7, "direction": "stable"}

        async def fake_sleep(*_a, **_k):
            return {
                "total_debt_hours": 2.0, "avg_nightly_debt": 0.15,
                "nights_short": 4, "nights_healthy": 10,
                "samples_n": 14, "target_hours": 8.0,
            }

        async def fake_pmc(*_a, **_k):
            return {
                "ctl": 60.0, "atl": 65.0, "tsb": -5.0,
                "ctl_7d_delta": 1.0, "tsb_7d_delta": -1.0, "form_status": "grey",
            }

        async def fake_zones(*_a, **_k):
            return {
                "z1_pct": 80.0, "z2_pct": 10.0, "z3_pct": 10.0,
                "total_hours": 10.0, "grey_zone_flag": False, "samples_n": 6,
            }

        monkeypatch.setattr("app.services.advanced_metrics.hrv_trend", fake_hrv)
        monkeypatch.setattr("app.services.advanced_metrics.rhr_trend", fake_rhr)
        monkeypatch.setattr("app.services.advanced_metrics.sleep_debt", fake_sleep)
        monkeypatch.setattr("app.services.advanced_metrics.ctl_atl_tsb_snapshot", fake_pmc)
        monkeypatch.setattr("app.services.advanced_metrics.zone_distribution", fake_zones)

        db = MagicMock()
        result = await why_am_i_tired(db, user_id=1)
        causes = result["causes"]
        assert len(causes) >= 1
        # First cause must be the 'high' severity HRV suppression
        assert causes[0]["label"] == "HRV suppressed"
        assert causes[0]["severity"] == "high"
        assert "HRV" in causes[0]["evidence"]


# ─── Plews CV: the variability half of the HRV signal ───────────────────────
# `readiness_score._hrv_component` implements a coefficient-of-variation
# penalty and names it as core rationale ("slope > point"), but every
# production caller passed `hrv_cv_pct=None`, so the penalty could never fire.
# The mean alone smooths over exactly the day-to-day instability the penalty
# exists to catch. `hrv_trend` already holds the window; it now reports its
# dispersion too.

class TestHrvCv:
    def test_reports_cv_for_the_current_window(self):
        from app.services.advanced_metrics import _hrv_cv_pct
        # mean 50; SAMPLE sd (n-1) of [45,55,45,55] is 5.774, so CV = 11.55%.
        # Sample rather than population sd on purpose: these readings are a
        # sample of the athlete's current state, not the whole of it.
        assert _hrv_cv_pct([45.0, 55.0, 45.0, 55.0]) == pytest.approx(11.55, abs=0.05)

    def test_a_steady_athlete_has_near_zero_cv(self):
        from app.services.advanced_metrics import _hrv_cv_pct
        assert _hrv_cv_pct([50.0, 50.0, 50.0, 50.0]) == pytest.approx(0.0, abs=1e-9)

    def test_too_few_readings_is_none_not_zero(self):
        from app.services.advanced_metrics import _hrv_cv_pct
        # One reading has no dispersion to report; zero would read as "rock
        # steady" and hand out a clean bill of health on no evidence.
        assert _hrv_cv_pct([50.0]) is None
        assert _hrv_cv_pct([]) is None

    def test_ignores_a_nonsense_baseline(self):
        from app.services.advanced_metrics import _hrv_cv_pct
        assert _hrv_cv_pct([0.0, 0.0, 0.0]) is None
