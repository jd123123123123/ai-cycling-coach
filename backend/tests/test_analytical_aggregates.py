"""Tests for analytical_aggregates — pure aggregation functions that feed the
Claude tool-use loop in /coach/chat.

Each aggregator must:
    - be JSON-serializable (no raw datetime objects on the wire)
    - scope by user_id (callers pass RLS-scoped session + explicit user_id)
    - degrade gracefully on empty windows (no raise; return zeros / insufficient_data)

We mock AsyncSession the same way tests/test_advanced_metrics.py does — the
aggregators are thin orchestrators over existing services (pmc_service,
training_load) so we stub the DB layer and exercise the synthesis code.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.analytical_aggregates import (
    activity_summary,
    ftp_progression_summary,
    pmc_window_summary,
    recovery_trend_summary,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_db_returning_activities(activities: list) -> MagicMock:
    """AsyncSession mock whose .execute().scalars().all() returns `activities`."""
    db = MagicMock()
    scalars = MagicMock()
    scalars.all = MagicMock(return_value=activities)
    exec_result = MagicMock()
    exec_result.scalars = MagicMock(return_value=scalars)
    exec_result.scalar_one_or_none = MagicMock(return_value=None)
    db.execute = AsyncMock(return_value=exec_result)
    return db


def _fake_activity(
    *,
    activity_id: int = 1,
    started_at: datetime | None = None,
    sport: str = "cycling",
    duration_seconds: int = 3600,
    tss: float | None = 60.0,
    normalized_power: float | None = 200.0,
    average_power: float | None = 195.0,
    average_hr: float | None = 150.0,
    raw_data: dict | None = None,
):
    return SimpleNamespace(
        id=activity_id,
        started_at=started_at or datetime.now(timezone.utc),
        sport=sport,
        duration_seconds=duration_seconds,
        tss=tss,
        normalized_power=normalized_power,
        average_power=average_power,
        average_hr=average_hr,
        raw_data=raw_data,
        user_id=1,
    )


def _fake_metric(
    *,
    days_ago: int = 0,
    hrv: float | None = None,
    rhr: int | None = None,
    sleep_score: int | None = None,
    body_battery: int | None = None,
    raw_data: dict | None = None,
):
    return SimpleNamespace(
        recorded_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
        date=(date.today() - timedelta(days=days_ago)),
        hrv_status=hrv,
        resting_hr=rhr,
        sleep_score=sleep_score,
        body_battery=body_battery,
        raw_data=raw_data,
    )


# ---------------------------------------------------------------------------
# pmc_window_summary — training-load trend
# ---------------------------------------------------------------------------

def _pmc_series(days: list[tuple[date, float, float, float, float]]) -> list[dict]:
    """Helper: build a PMC series list of dicts the shape compute_user_pmc emits."""
    return [
        {"date": d, "ctl": ctl, "atl": atl, "tsb": tsb, "tss": tss}
        for (d, ctl, atl, tsb, tss) in days
    ]


@pytest.mark.asyncio
class TestPmcWindowSummary:
    async def test_rising_ctl_direction_building(self):
        """28-day window with CTL rising monotonically → direction='building'."""
        today = date.today()
        series = _pmc_series([
            (today - timedelta(days=27 - i), 40.0 + i * 0.5, 45.0 + i * 0.2, -5.0 + i * 0.3, 50.0)
            for i in range(28)
        ])
        db = _mock_db_returning_activities([])
        with patch(
            "app.services.analytical_aggregates.compute_user_pmc",
            new=AsyncMock(return_value={"total": series, "cycling": [], "running": [], "gym": []}),
        ):
            result = await pmc_window_summary(
                user_id=1,
                start_date=today - timedelta(days=27),
                end_date=today,
                db=db,
            )
        assert len(result["days"]) == 28
        assert result["trend"]["direction"] == "building"
        assert result["aggregate"]["ramp_rate"] > 0
        assert result["aggregate"]["avg_ctl"] > 0
        # All dates must be ISO strings (JSON-serialisable)
        for d in result["days"]:
            assert isinstance(d["date"], str)

    async def test_taper_freshening_direction(self):
        """7-day window with ATL falling + TSB rising → direction='freshening'."""
        today = date.today()
        series = _pmc_series([
            # CTL holds, ATL falls, TSB rises
            (today - timedelta(days=6 - i), 60.0, 60.0 - i * 2, -5.0 + i * 2, 30.0 - i * 3)
            for i in range(7)
        ])
        db = _mock_db_returning_activities([])
        with patch(
            "app.services.analytical_aggregates.compute_user_pmc",
            new=AsyncMock(return_value={"total": series, "cycling": [], "running": [], "gym": []}),
        ):
            result = await pmc_window_summary(
                user_id=1,
                start_date=today - timedelta(days=6),
                end_date=today,
                db=db,
            )
        assert result["trend"]["direction"] == "freshening"
        assert result["trend"]["tsb_delta"] > 0

    async def test_overreaching_direction(self):
        """ATL spiking faster than CTL can absorb → direction='overreaching'."""
        today = date.today()
        series = _pmc_series([
            (today - timedelta(days=6 - i), 50.0, 50.0 + i * 4, -i * 3, 120.0)
            for i in range(7)
        ])
        db = _mock_db_returning_activities([])
        with patch(
            "app.services.analytical_aggregates.compute_user_pmc",
            new=AsyncMock(return_value={"total": series, "cycling": [], "running": [], "gym": []}),
        ):
            result = await pmc_window_summary(
                user_id=1,
                start_date=today - timedelta(days=6),
                end_date=today,
                db=db,
            )
        assert result["trend"]["direction"] == "overreaching"
        assert result["trend"]["tsb_delta"] < 0

    async def test_empty_range_insufficient_data(self):
        """Empty PMC series → direction='insufficient_data', zeroed aggregate."""
        today = date.today()
        db = _mock_db_returning_activities([])
        with patch(
            "app.services.analytical_aggregates.compute_user_pmc",
            new=AsyncMock(return_value={"total": [], "cycling": [], "running": [], "gym": []}),
        ):
            result = await pmc_window_summary(
                user_id=1,
                start_date=today - timedelta(days=6),
                end_date=today,
                db=db,
            )
        assert result["days"] == []
        assert result["trend"]["direction"] == "insufficient_data"
        assert result["aggregate"]["avg_ctl"] == 0
        assert result["aggregate"]["total_tss"] == 0

    async def test_single_day_maintaining(self):
        """Single-day window returns a one-entry day list with a neutral trend."""
        today = date.today()
        series = _pmc_series([(today, 50.0, 50.0, 0.0, 60.0)])
        db = _mock_db_returning_activities([])
        with patch(
            "app.services.analytical_aggregates.compute_user_pmc",
            new=AsyncMock(return_value={"total": series, "cycling": [], "running": [], "gym": []}),
        ):
            result = await pmc_window_summary(
                user_id=1, start_date=today, end_date=today, db=db,
            )
        assert len(result["days"]) == 1
        assert result["trend"]["direction"] in ("maintaining", "insufficient_data")


# ---------------------------------------------------------------------------
# recovery_trend_summary
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestRecoveryTrendSummary:
    async def test_low_hrv_flag(self):
        """HRV dropping ≥10% vs baseline → flags contains 'low_hrv'."""
        # 7d recent @ 45; 28d baseline @ ~62 → drop ~27%
        recent = [_fake_metric(hrv=45.0, days_ago=d) for d in range(7)]
        older = [_fake_metric(hrv=65.0, days_ago=d) for d in range(8, 28)]
        db = _mock_db_returning_activities(recent + older)

        result = await recovery_trend_summary(user_id=1, days=7, db=db)
        assert "low_hrv" in result["flags"]
        assert result["aggregate"]["hrv_trend_pct"] < 0

    async def test_sleep_debt_flag(self):
        """<7h sleep on ≥5 of 7 nights → flags contains 'sleep_debt'."""
        metrics = [
            _fake_metric(days_ago=d, raw_data={"sleep": {"hours": 6.0}})
            for d in range(5)
        ] + [
            _fake_metric(days_ago=d, raw_data={"sleep": {"hours": 8.0}})
            for d in range(5, 7)
        ]
        db = _mock_db_returning_activities(metrics)

        result = await recovery_trend_summary(user_id=1, days=7, db=db)
        assert "sleep_debt" in result["flags"]
        assert result["aggregate"]["sleep_debt_hours"] > 0

    async def test_elevated_rhr_flag(self):
        """rHR elevated ≥5% vs baseline → flags contains 'rhr_elevated'."""
        recent = [_fake_metric(rhr=64, days_ago=d) for d in range(7)]
        older = [_fake_metric(rhr=55, days_ago=d) for d in range(8, 28)]
        db = _mock_db_returning_activities(recent + older)

        result = await recovery_trend_summary(user_id=1, days=7, db=db)
        assert "rhr_elevated" in result["flags"]

    async def test_empty_metrics_no_flags(self):
        """No metrics → empty flags, JSON-safe zeros."""
        db = _mock_db_returning_activities([])
        result = await recovery_trend_summary(user_id=1, days=7, db=db)
        assert result["flags"] == []
        assert result["aggregate"]["avg_sleep"] == 0
        # Dates must be strings
        for d in result["days"]:
            assert isinstance(d["date"], str)

    async def test_days_param_clamped(self):
        """days param is clamped to [1, 90] by the dispatcher (tested in tool dispatcher)
        but the aggregator itself must accept any positive int."""
        db = _mock_db_returning_activities([])
        result = await recovery_trend_summary(user_id=1, days=1, db=db)
        assert isinstance(result["days"], list)


# ---------------------------------------------------------------------------
# activity_summary
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestActivitySummary:
    async def test_cycling_if_average(self):
        """10 cycling activities with avg IF 0.7 → aggregate.avg_if ≈ 0.70.

        We construct activities so NP/FTP = 0.7 consistently.
        FTP=200 → NP=140 gives IF=0.7.
        """
        acts = []
        for i in range(10):
            acts.append(_fake_activity(
                activity_id=i + 1,
                normalized_power=140.0,
                average_power=135.0,
                duration_seconds=3600,
                tss=49.0,
                started_at=datetime.now(timezone.utc) - timedelta(days=i),
            ))
        db = _mock_db_returning_activities(acts)

        # Patch FTP lookup
        with patch(
            "app.services.analytical_aggregates._fetch_athlete_ftp",
            new=AsyncMock(return_value=200),
        ):
            result = await activity_summary(user_id=1, limit=10, sport_filter=None, db=db)
        assert len(result["activities"]) == 10
        assert result["aggregate"]["avg_if"] is not None
        assert 0.68 <= result["aggregate"]["avg_if"] <= 0.72
        assert result["aggregate"]["total_tss"] == pytest.approx(490.0, rel=0.02)

    async def test_sport_filter(self):
        """sport_filter='running' passes through the DB query; returned list is
        whatever the mock returns (service-layer filter is tested via the SQL, not shape)."""
        acts = [_fake_activity(sport="running", normalized_power=None, average_hr=160)]
        db = _mock_db_returning_activities(acts)
        with patch(
            "app.services.analytical_aggregates._fetch_athlete_ftp",
            new=AsyncMock(return_value=None),
        ):
            result = await activity_summary(user_id=1, limit=5, sport_filter="running", db=db)
        assert len(result["activities"]) == 1
        assert result["activities"][0]["sport"] == "running"

    async def test_sport_mix_counts(self):
        """Mixed cycling + running returns a sport_mix breakdown."""
        acts = (
            [_fake_activity(activity_id=i, sport="cycling") for i in range(3)]
            + [_fake_activity(activity_id=i + 10, sport="running", normalized_power=None) for i in range(2)]
        )
        db = _mock_db_returning_activities(acts)
        with patch(
            "app.services.analytical_aggregates._fetch_athlete_ftp",
            new=AsyncMock(return_value=200),
        ):
            result = await activity_summary(user_id=1, limit=10, sport_filter=None, db=db)
        assert result["aggregate"]["sport_mix"]["cycling"] == 3
        assert result["aggregate"]["sport_mix"]["running"] == 2

    async def test_running_activity_produces_unknown_zone(self):
        """Running activities must NOT inherit cycling FTP for IF calculation.

        A running activity with avg_power=332 W and FTP=240 W would produce
        IF=1.38 → zone "z3", which is nonsense. Sport guard must return
        if_=None and zone="unknown" for non-cycling activities.
        """
        acts = [
            _fake_activity(
                sport="running",
                normalized_power=332.0,
                average_power=332.0,
            )
        ]
        db = _mock_db_returning_activities(acts)
        with patch(
            "app.services.analytical_aggregates._fetch_athlete_ftp",
            new=AsyncMock(return_value=240),
        ):
            result = await activity_summary(user_id=1, limit=5, sport_filter=None, db=db)
        row = result["activities"][0]
        assert row["if_"] is None, "running activities must not produce an IF value"
        assert row["zone"] == "unknown", "running activities must not be assigned a power zone"

    async def test_empty_activities(self):
        db = _mock_db_returning_activities([])
        with patch(
            "app.services.analytical_aggregates._fetch_athlete_ftp",
            new=AsyncMock(return_value=200),
        ):
            result = await activity_summary(user_id=1, limit=10, sport_filter=None, db=db)
        assert result["activities"] == []
        assert result["aggregate"]["total_tss"] == 0
        assert result["aggregate"]["avg_if"] is None

    async def test_activities_json_serialisable(self):
        """Per-activity dates must be ISO strings."""
        acts = [_fake_activity()]
        db = _mock_db_returning_activities(acts)
        with patch(
            "app.services.analytical_aggregates._fetch_athlete_ftp",
            new=AsyncMock(return_value=200),
        ):
            result = await activity_summary(user_id=1, limit=5, sport_filter=None, db=db)
        assert isinstance(result["activities"][0]["date"], str)


# ---------------------------------------------------------------------------
# ftp_progression_summary
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestFtpProgressionSummary:
    async def test_improving_trend(self):
        """History showing 30d delta > +2% → trend='improving'."""
        today = date.today()
        history = [
            {"ftp_watts": 250, "measured_at": (today - timedelta(days=120)).isoformat(), "source": "manual"},
            {"ftp_watts": 260, "measured_at": (today - timedelta(days=60)).isoformat(), "source": "manual"},
            {"ftp_watts": 275, "measured_at": (today - timedelta(days=15)).isoformat(), "source": "manual"},
        ]
        profile = SimpleNamespace(ftp_watts=275, ftp_history=history)
        db = MagicMock()
        exec_result = MagicMock()
        exec_result.scalar_one_or_none = MagicMock(return_value=profile)
        db.execute = AsyncMock(return_value=exec_result)

        result = await ftp_progression_summary(user_id=1, db=db)
        assert result["current"] == 275
        assert result["trend"] == "improving"
        assert result["delta_30d_pct"] is not None and result["delta_30d_pct"] > 0

    async def test_stable_trend(self):
        """No change in 30d → trend='stable'."""
        today = date.today()
        history = [
            {"ftp_watts": 280, "measured_at": (today - timedelta(days=60)).isoformat(), "source": "manual"},
            {"ftp_watts": 280, "measured_at": (today - timedelta(days=5)).isoformat(), "source": "manual"},
        ]
        profile = SimpleNamespace(ftp_watts=280, ftp_history=history)
        db = MagicMock()
        exec_result = MagicMock()
        exec_result.scalar_one_or_none = MagicMock(return_value=profile)
        db.execute = AsyncMock(return_value=exec_result)

        result = await ftp_progression_summary(user_id=1, db=db)
        assert result["trend"] == "stable"

    async def test_no_history(self):
        """Profile with no ftp_history → entries=[], trend='stable', current=None."""
        profile = SimpleNamespace(ftp_watts=None, ftp_history=[])
        db = MagicMock()
        exec_result = MagicMock()
        exec_result.scalar_one_or_none = MagicMock(return_value=profile)
        db.execute = AsyncMock(return_value=exec_result)

        result = await ftp_progression_summary(user_id=1, db=db)
        assert result["entries"] == []
        assert result["current"] is None
        assert result["trend"] == "stable"
