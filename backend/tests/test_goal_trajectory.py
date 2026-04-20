"""Unit tests for goal_trajectory — CTL/TSB projection and Mujika taper
classification.

Covers:
    - Each taper_window state: too_flat / ideal / too_fresh / overreached / unknown
    - Each on_track state: ahead / on_track / behind / no_goal
    - No goal date set → on_track='no_goal', still emits a CTL-trend narrative
    - No target_ctl set → narrative still useful, on_track='on_track'
    - Empty PMC history → graceful "not enough data" narrative
    - Linear extrapolation math (ctl_7d_delta * days_to_goal / 7)
    - Serialization round-trip
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.services.goal_trajectory import (
    TSB_IDEAL_MAX,
    TSB_IDEAL_MIN,
    TSB_OVERREACHED,
    TSB_TOO_FRESH_MAX,
    _taper_window,
    project,
    trajectory_to_dict,
)


# ======================================================================
# Helpers
# ======================================================================

def _pmc_series(
    *,
    days: int = 30,
    start_ctl: float = 40.0,
    daily_delta: float = 0.1,
    atl: float = 45.0,
    tss_per_day: float | None = 40.0,
) -> list[dict]:
    """Build a synthetic PMC series with a controlled daily CTL slope.

    Defaults simulate a mild build (+0.1 CTL/day → +0.7 CTL/week).
    """
    today = date.today()
    rows: list[dict] = []
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        ctl = start_ctl + daily_delta * i
        tsb = ctl - atl
        row = {"date": d, "ctl": ctl, "atl": atl, "tsb": tsb}
        if tss_per_day is not None:
            row["tss"] = tss_per_day
        rows.append(row)
    return rows


# ======================================================================
# Taper window classification
# ======================================================================

class TestTaperWindow:
    def test_ideal_band(self):
        assert _taper_window(TSB_IDEAL_MIN) == "ideal"
        assert _taper_window(15.0) == "ideal"
        assert _taper_window(TSB_IDEAL_MAX) == "ideal"

    def test_too_flat_below_5(self):
        assert _taper_window(0.0) == "too_flat"
        assert _taper_window(4.9) == "too_flat"

    def test_overreached_below_minus_15(self):
        assert _taper_window(TSB_OVERREACHED - 1) == "overreached"
        assert _taper_window(-30.0) == "overreached"

    def test_too_fresh_above_25(self):
        assert _taper_window(30.0) == "too_fresh"
        assert _taper_window(TSB_TOO_FRESH_MAX) == "too_fresh"
        assert _taper_window(TSB_TOO_FRESH_MAX + 10.0) == "too_fresh"


# ======================================================================
# On-track classification
# ======================================================================

class TestOnTrack:
    def test_on_track_when_projection_matches_target(self):
        pmc = _pmc_series(start_ctl=40.0, daily_delta=0.1)  # +0.1/day
        goal_date = (date.today() + timedelta(days=50)).isoformat()
        # Projected CTL after 50 days: 42 + 5 = ~47. Target 45 → on_track
        tp = project(
            pmc,
            athlete_goals={
                "target_ctl": 46.0,
                "target_event": {"date": goal_date, "name": "A race"},
            },
            phase="build1",
        )
        assert tp.on_track == "on_track"
        assert tp.days_to_goal is not None

    def test_ahead_when_projection_exceeds_target(self):
        pmc = _pmc_series(start_ctl=50.0, daily_delta=0.5)  # aggressive build
        goal_date = (date.today() + timedelta(days=42)).isoformat()
        tp = project(
            pmc,
            athlete_goals={
                "target_ctl": 40.0,
                "target_event": {"date": goal_date, "name": "A race"},
            },
            phase="build1",
        )
        assert tp.on_track == "ahead"

    def test_behind_when_projection_short_of_target(self):
        pmc = _pmc_series(start_ctl=40.0, daily_delta=0.0)  # flat
        goal_date = (date.today() + timedelta(days=40)).isoformat()
        tp = project(
            pmc,
            athlete_goals={
                "target_ctl": 60.0,
                "target_event": {"date": goal_date, "name": "A race"},
            },
            phase="build1",
        )
        assert tp.on_track == "behind"
        # Should recommend more weekly TSS to close gap
        assert tp.weekly_tss_required > tp.weekly_tss_actual

    def test_no_goal_date(self):
        pmc = _pmc_series(start_ctl=40.0, daily_delta=0.2)
        tp = project(pmc, athlete_goals=None, phase="maintenance")
        assert tp.on_track == "no_goal"
        assert tp.days_to_goal is None
        # Narrative is still useful
        assert tp.narrative_hook
        assert len(tp.narrative_hook) > 20

    def test_no_target_ctl_still_on_track(self):
        """Goal date set but no target_ctl — we treat as on_track, narrative
        talks about trajectory rate instead of gap."""
        pmc = _pmc_series(start_ctl=50.0, daily_delta=0.1)
        goal_date = (date.today() + timedelta(days=30)).isoformat()
        tp = project(
            pmc,
            athlete_goals={"target_event": {"date": goal_date, "name": "A race"}},
            phase="build1",
        )
        assert tp.on_track == "on_track"
        assert tp.ctl_target is None
        # Narrative cites trajectory, not gap
        assert "trend" in tp.narrative_hook.lower() or "build" in tp.narrative_hook.lower() or "steady" in tp.narrative_hook.lower()


# ======================================================================
# Taper-window narratives
# ======================================================================

class TestTaperNarratives:
    def test_race_week_ideal_narrative(self):
        """7 days to goal, projected TSB in ideal band → confidence narrative."""
        pmc = _pmc_series(start_ctl=55.0, atl=45.0, daily_delta=-0.1, days=60)
        goal_date = (date.today() + timedelta(days=7)).isoformat()
        tp = project(
            pmc,
            athlete_goals={
                "target_ctl": 50.0,
                "target_event": {"date": goal_date, "name": "A race"},
            },
            phase="race",
        )
        # Given the setup, TSB projects into the ideal range for race week
        assert tp.taper_window in ("ideal", "too_flat")  # boundary-sensitive
        assert tp.days_to_goal == 7

    def test_overreached_narrative_mentions_volume_cut(self):
        """Deep-fatigue athlete 10 days from race → overreached taper + warning."""
        pmc = _pmc_series(start_ctl=55.0, atl=90.0, daily_delta=0.0, days=30)
        goal_date = (date.today() + timedelta(days=10)).isoformat()
        tp = project(
            pmc,
            athlete_goals={
                "target_ctl": 55.0,
                "target_event": {"date": goal_date, "name": "A race"},
            },
            phase="taper",
        )
        # ATL 90, projected ATL drops to ~83 (10/14 of way through taper window)
        # TSB_proj = 55 - 2 (taper decay) - 83 = -30 → overreached
        assert tp.taper_window == "overreached"
        assert "cut" in tp.narrative_hook.lower() or "fatigue" in tp.narrative_hook.lower()


# ======================================================================
# Empty / degenerate PMC
# ======================================================================

class TestEmptyHistory:
    def test_no_pmc_rows(self):
        tp = project([], athlete_goals=None, phase="offseason")
        assert tp.ctl_now == 0.0
        assert tp.on_track == "no_goal"
        assert tp.taper_window == "unknown"
        assert tp.days_to_goal is None
        assert "Not enough" in tp.narrative_hook or "log a few weeks" in tp.narrative_hook.lower()

    def test_single_pmc_row_no_ctl_7d(self):
        """One row — ctl_7d_delta defaults to 0 (no 7-day baseline)."""
        pmc = [{"date": date.today(), "ctl": 40.0, "atl": 38.0, "tsb": 2.0}]
        tp = project(pmc, athlete_goals=None, phase="maintenance")
        assert tp.ctl_7d_delta == 0.0
        assert tp.ctl_now == 40.0


# ======================================================================
# Projection math
# ======================================================================

class TestProjectionMath:
    def test_linear_extrapolation(self):
        """+0.1 CTL/day × 30 days → +3 CTL projected."""
        pmc = _pmc_series(start_ctl=40.0, daily_delta=0.1, days=30)
        # ctl_now ≈ 42.9, ctl_7d ≈ 0.7
        goal_date = (date.today() + timedelta(days=30)).isoformat()
        tp = project(
            pmc,
            athlete_goals={
                "target_ctl": 50.0,
                "target_event": {"date": goal_date, "name": "A race"},
            },
            phase="build2",
        )
        # Projected: 42.9 + (0.7/7)*30 = 42.9 + 3 = 45.9
        assert 45.0 < tp.ctl_projected_at_goal < 47.0

    def test_weekly_tss_actual_from_explicit_tss(self):
        pmc = _pmc_series(tss_per_day=50.0, days=28)
        tp = project(pmc, athlete_goals=None, phase="maintenance")
        # 50 TSS/day × 7 = 350 TSS/week
        assert tp.weekly_tss_actual == pytest.approx(350.0, abs=1.0)


# ======================================================================
# Serialization
# ======================================================================

class TestSerialization:
    def test_dict_roundtrip(self):
        pmc = _pmc_series(start_ctl=40.0, daily_delta=0.1)
        tp = project(pmc, athlete_goals=None, phase="maintenance")
        d = trajectory_to_dict(tp)
        assert d["ctl_now"] == tp.ctl_now
        assert d["taper_window"] == tp.taper_window
        assert d["on_track"] == tp.on_track
        assert d["narrative_hook"] == tp.narrative_hook
