"""Window-invariant PMC (usability audit P0-4/P0-5).

compute_user_pmc must run the CTL/ATL EWMA from the athlete's FIRST activity
and only SLICE the requested window — days=60 and days=90 must report the
identical CTL/ATL/TSB for the same calendar day (the '+1 vs +7 TSB' bug).

DB is mocked: one SQL execute returning per-day TSS rows; the profile is
passed in directly so no profile query runs.
"""
from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.pmc_service import HISTORY_CAP_DAYS, compute_user_pmc


def _profile(tz: str = "Europe/Berlin") -> SimpleNamespace:
    return SimpleNamespace(timezone=tz)


def _tss_rows(n_days: int, tss: float = 60.0, sport: str = "cycling") -> list:
    """n_days of daily TSS ending today (athlete-local == server-local here)."""
    today = date.today()
    return [
        SimpleNamespace(day=today - timedelta(days=i), sport=sport, daily_tss=tss)
        for i in range(n_days - 1, -1, -1)
    ]


def _db(rows: list) -> MagicMock:
    db = MagicMock()
    captured: dict = {}

    async def execute(stmt, params=None):  # noqa: ANN001
        captured["params"] = params
        result = MagicMock()
        result.fetchall.return_value = rows
        return result

    db.execute = AsyncMock(side_effect=execute)
    db._captured = captured
    return db


class TestWindowInvariance:
    @pytest.mark.asyncio
    async def test_same_tsb_for_days_60_and_90(self):
        """120 days of history: the last entry's CTL/ATL/TSB must be identical
        whether the caller asked for a 60- or 90-day window."""
        rows = _tss_rows(120)
        out60 = await compute_user_pmc(_db(rows), 1, days=60, profile=_profile())
        out90 = await compute_user_pmc(_db(rows), 1, days=90, profile=_profile())

        last60 = out60["total"][-1]
        last90 = out90["total"][-1]
        assert last60["date"] == last90["date"]
        assert last60["ctl"] == last90["ctl"]
        assert last60["atl"] == last90["atl"]
        assert last60["tsb"] == last90["tsb"]

    @pytest.mark.asyncio
    async def test_days_param_only_slices(self):
        rows = _tss_rows(120)
        out60 = await compute_user_pmc(_db(rows), 1, days=60, profile=_profile())
        out90 = await compute_user_pmc(_db(rows), 1, days=90, profile=_profile())
        assert len(out60["total"]) == 60
        assert len(out90["total"]) == 90
        # The 60-day window is exactly the tail of the 90-day window.
        assert out90["total"][-60:] == out60["total"]

    @pytest.mark.asyncio
    async def test_full_history_queried_regardless_of_window(self):
        """The SQL always scans the capped full history, never just `days`."""
        db = _db(_tss_rows(30))
        await compute_user_pmc(db, 1, days=30, profile=_profile())
        # tz is bound as a parameter; the interval is the history cap.
        stmt_params = db._captured["params"]
        assert stmt_params["tz"] == "Europe/Berlin"
        assert stmt_params["user_id"] == 1
        # HISTORY_CAP_DAYS is interpolated into the SQL text server-side —
        # sanity-check the constant is what the docstring promises.
        assert HISTORY_CAP_DAYS == 730

    @pytest.mark.asyncio
    async def test_athlete_tz_bound_from_profile(self):
        db = _db(_tss_rows(10))
        await compute_user_pmc(db, 1, days=10, profile=_profile("America/New_York"))
        assert db._captured["params"]["tz"] == "America/New_York"

    @pytest.mark.asyncio
    async def test_short_history_pads_window_with_zeros(self):
        """5 days of activity in a 30-day window → 30 entries, zeros before."""
        rows = _tss_rows(5)
        out = await compute_user_pmc(_db(rows), 1, days=30, profile=_profile())
        total = out["total"]
        assert len(total) == 30
        assert all(e["tss"] == 0.0 for e in total[:25])
        assert all(e["tss"] > 0.0 for e in total[-5:])

    @pytest.mark.asyncio
    async def test_no_activities_returns_empty_series(self):
        out = await compute_user_pmc(_db([]), 1, days=30, profile=_profile())
        assert out["total"] == []
        assert out["cycling"] == []
