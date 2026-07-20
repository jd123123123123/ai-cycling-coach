"""Unit tests for goal_trajectory — forward race-day simulation (audit P0-4).

Covers:
    - Mujika taper_window classification bands
    - Honesty guard: no event / <14d history / empty PMC → basis 'none',
      null projections, on_track 'unknown' (never a fabricated 0)
    - Forward simulation under a fully materialized plan → basis 'plan'
    - Synthesized weeks beyond the plan horizon → basis 'synthesized',
      sane CTL under a 12-week horizon, natural taper into the event
    - on_track: 'behind' only when simulated CTL misses target by >10%
    - weekly_tss_required = the plan's own next-7-days TSS
    - normalize_athlete_goals: first-class event date wins, default target_ctl
    - compute_goal_trajectory end-to-end with mocked DB
    - Serialization round-trip incl. projection_basis
"""
from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.goal_trajectory import (
    MIN_HISTORY_DAYS,
    TSB_IDEAL_MAX,
    TSB_IDEAL_MIN,
    TSB_OVERREACHED,
    TSB_TOO_FRESH_MAX,
    _taper_window,
    compute_goal_trajectory,
    normalize_athlete_goals,
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
    """Synthetic PMC series ending today with a controlled daily CTL slope."""
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


def _goals(days_to_goal: int, target_ctl: float | None = None) -> dict:
    goals: dict = {
        "target_event": {
            "date": (date.today() + timedelta(days=days_to_goal)).isoformat(),
            "name": "A race",
        }
    }
    if target_ctl is not None:
        goals["target_ctl"] = target_ctl
    return goals


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
# Honesty guard — basis 'none', null projections, never 0
# ======================================================================

class TestHonestyGuard:
    def test_no_pmc_rows(self):
        tp = project([], athlete_goals=None, phase="offseason")
        assert tp.projection_basis == "none"
        assert tp.ctl_projected_at_goal is None
        assert tp.tsb_projected_at_goal is None
        assert tp.weekly_tss_required is None
        assert tp.on_track == "unknown"
        assert tp.taper_window == "unknown"
        assert tp.narrative_hook

    def test_no_target_event(self):
        pmc = _pmc_series(days=60)
        tp = project(pmc, athlete_goals=None, phase="maintenance")
        assert tp.projection_basis == "none"
        assert tp.ctl_projected_at_goal is None
        assert tp.on_track == "unknown"
        # Trend observation still present for the UI
        assert len(tp.narrative_hook) > 20

    def test_past_event_treated_as_no_goal(self):
        pmc = _pmc_series(days=60)
        goals = {"target_event": {"date": (date.today() - timedelta(days=5)).isoformat()}}
        tp = project(pmc, athlete_goals=goals, phase="maintenance")
        assert tp.projection_basis == "none"

    def test_five_day_old_athlete_gets_none_basis(self):
        """<14 days of real history → 'Prognose folgt', null projections."""
        today = date.today()
        rows = []
        for i in range(90):
            d = today - timedelta(days=89 - i)
            tss = 50.0 if (today - d).days < 5 else 0.0  # only last 5 days active
            rows.append({"date": d, "ctl": 2.0, "atl": 8.0, "tsb": -6.0, "tss": tss})
        tp = project(rows, athlete_goals=_goals(60, 60.0), phase="base1")
        assert tp.projection_basis == "none"
        assert tp.ctl_projected_at_goal is None
        assert tp.tsb_projected_at_goal is None
        assert tp.weekly_tss_required is None
        assert tp.on_track == "unknown"

    def test_exactly_min_history_projects(self):
        today = date.today()
        rows = []
        for i in range(90):
            d = today - timedelta(days=89 - i)
            active = (today - d).days < MIN_HISTORY_DAYS
            rows.append({
                "date": d, "ctl": 20.0, "atl": 25.0, "tsb": -5.0,
                "tss": 60.0 if active else 0.0,
            })
        tp = project(rows, athlete_goals=_goals(40, 50.0), phase="build1")
        assert tp.projection_basis in ("plan", "synthesized")
        assert tp.ctl_projected_at_goal is not None


# ======================================================================
# Forward simulation
# ======================================================================

class TestSimulation:
    def test_synthesized_basis_beyond_plan(self):
        """No materialized rows at all → every future week is synthesized."""
        pmc = _pmc_series(days=60, start_ctl=40.0, daily_delta=0.0, atl=40.0)
        tp = project(pmc, athlete_goals=_goals(84, 70.0), phase="build1")
        assert tp.projection_basis == "synthesized"
        # A 12-week simulation from CTL 40 under the app's own ramp factors
        # lands near maintenance (the Issurin 3:1 recovery week + Mujika taper
        # give back most of what the ~5-8% build weeks add). Sane band — never
        # 0, never runaway.
        assert tp.ctl_projected_at_goal is not None
        assert 25.0 < tp.ctl_projected_at_goal < 60.0
        assert tp.weekly_tss_required is not None and tp.weekly_tss_required > 0
        # Target 70 is honestly out of reach for this plan → 'behind' verdict.
        assert tp.on_track == "behind"

    def test_plan_basis_when_fully_materialized(self):
        """Planned rows covering every day to the event → basis 'plan'."""
        pmc = _pmc_series(days=60, start_ctl=50.0, daily_delta=0.0, atl=55.0)
        today = date.today()
        event_in = 14
        planned = {
            today + timedelta(days=i): 50.0 for i in range(1, event_in)
        }
        tp = project(
            pmc, athlete_goals=_goals(event_in, 50.0), phase="taper",
            planned_by_date=planned,
        )
        assert tp.projection_basis == "plan"
        assert tp.ctl_projected_at_goal is not None

    def test_weekly_tss_required_is_plan_ramp_not_gap_math(self):
        """weekly_tss_required equals the simulated next-7-days TSS."""
        pmc = _pmc_series(days=60, start_ctl=50.0, daily_delta=0.0, atl=50.0)
        today = date.today()
        planned = {today + timedelta(days=i): 60.0 for i in range(1, 30)}
        tp = project(
            pmc, athlete_goals=_goals(30, 55.0), phase="build2",
            planned_by_date=planned,
        )
        assert tp.weekly_tss_required == pytest.approx(7 * 60.0, abs=0.5)

    def test_taper_emerges_from_simulation(self):
        """Synthesized weeks cut volume in the final freshen — race-day TSB
        must land clearly above deep fatigue for an adequately-built athlete."""
        pmc = _pmc_series(days=90, start_ctl=60.0, daily_delta=0.0, atl=65.0)
        tp = project(pmc, athlete_goals=_goals(35, 60.0), phase="peak")
        assert tp.projection_basis == "synthesized"
        assert tp.tsb_projected_at_goal is not None
        # Mujika: the taper should freshen the athlete out of overreach.
        assert tp.tsb_projected_at_goal > TSB_OVERREACHED

    def test_rest_gap_inside_plan_horizon_is_rest_not_synth(self):
        """Missing days BEFORE the last materialized row count as rest days."""
        pmc = _pmc_series(days=60, start_ctl=50.0, daily_delta=0.0, atl=60.0)
        today = date.today()
        # Only one planned row far out — the gap in between is rest (plan basis).
        planned = {today + timedelta(days=13): 80.0}
        tp = project(
            pmc, athlete_goals=_goals(14, 45.0), phase="taper",
            planned_by_date=planned,
        )
        assert tp.projection_basis == "plan"
        # Two weeks of near-rest → athlete freshens markedly.
        assert tp.tsb_projected_at_goal is not None
        assert tp.tsb_projected_at_goal > pmc[-1]["tsb"]


# ======================================================================
# On-track classification (>10% rule)
# ======================================================================

class TestOnTrack:
    def _project_to(self, target_ctl: float) -> object:
        pmc = _pmc_series(days=60, start_ctl=50.0, daily_delta=0.0, atl=50.0)
        today = date.today()
        planned = {today + timedelta(days=i): 50.0 for i in range(1, 28)}
        return project(
            pmc, athlete_goals=_goals(28, target_ctl), phase="build1",
            planned_by_date=planned,
        )

    def test_behind_only_when_missing_by_over_10_pct(self):
        # Steady 50 TSS/day holds CTL ≈ 50. Target 70 → miss by ~29% → behind.
        tp = self._project_to(70.0)
        assert tp.on_track == "behind"

    def test_on_track_within_tolerance(self):
        # CTL ≈ 50 vs target 52 → within 10% → on_track (no false alarm).
        tp = self._project_to(52.0)
        assert tp.on_track == "on_track"

    def test_ahead_when_exceeding_by_over_10_pct(self):
        tp = self._project_to(40.0)
        assert tp.on_track == "ahead"

    def test_no_target_ctl_is_on_track(self):
        pmc = _pmc_series(days=60, start_ctl=50.0, daily_delta=0.1)
        tp = project(pmc, athlete_goals=_goals(30), phase="build1")
        assert tp.on_track == "on_track"
        assert tp.ctl_target is None


# ======================================================================
# Goals normalization (moved out of api/coach.py)
# ======================================================================

class TestNormalizeGoals:
    def test_first_class_event_date_overwrites_stale_jsonb(self):
        stale = (date.today() - timedelta(days=200)).isoformat()
        fresh = date.today() + timedelta(days=45)
        profile = SimpleNamespace(
            goals={"target_event": {"date": stale, "name": "Alpen GF"}},
            target_event_date=fresh,
            target_event_type="fondo",
            target_priority="A",
        )
        goals = normalize_athlete_goals(profile)
        assert goals["target_event"]["date"] == fresh.isoformat()
        assert goals["target_event"]["name"] == "Alpen GF"  # name preserved

    def test_default_target_ctl_injected(self):
        profile = SimpleNamespace(
            goals={},
            target_event_date=date.today() + timedelta(days=45),
            target_event_type="fondo",
            target_priority="A",
        )
        goals = normalize_athlete_goals(profile)
        assert isinstance(goals.get("target_ctl"), float)

    def test_explicit_target_ctl_wins(self):
        profile = SimpleNamespace(
            goals={"target_ctl": 61.0},
            target_event_date=date.today() + timedelta(days=45),
            target_event_type="fondo",
            target_priority="A",
        )
        assert normalize_athlete_goals(profile)["target_ctl"] == 61.0

    def test_none_profile(self):
        assert normalize_athlete_goals(None) == {}


# ======================================================================
# compute_goal_trajectory — the one async producer
# ======================================================================

class TestComputeGoalTrajectory:
    @pytest.mark.asyncio
    async def test_end_to_end_with_mocked_db(self):
        event = date.today() + timedelta(days=42)
        profile = SimpleNamespace(
            goals={},
            target_event_date=event,
            target_event_type="race",
            target_priority="B",
            timezone="Europe/Berlin",
        )

        # Mocked DB only serves the PlannedWorkout query (PMC is patched).
        db = MagicMock()

        async def execute(stmt, *a, **kw):  # noqa: ANN001
            result = MagicMock()
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
            return result

        db.execute = AsyncMock(side_effect=execute)

        pmc = {"total": _pmc_series(days=90, start_ctl=45.0, daily_delta=0.0, atl=48.0)}
        with patch(
            "app.services.pmc_service.compute_user_pmc",
            new=AsyncMock(return_value=pmc),
        ):
            payload = await compute_goal_trajectory(db, 1, profile, lang="de")

        assert payload is not None
        assert payload["projection_basis"] == "synthesized"
        assert payload["ctl_projected_at_goal"] is not None
        assert payload["event_date"] == event.isoformat()
        assert payload["event_type"] == "race"
        assert payload["target_priority"] == "B"
        # default target_ctl for race/B is injected → on_track is a real verdict
        assert payload["on_track"] in ("behind", "on_track", "ahead")

    @pytest.mark.asyncio
    async def test_no_event_returns_none_basis(self):
        profile = SimpleNamespace(
            goals={},
            target_event_date=None,
            target_event_type=None,
            target_priority=None,
            timezone="Europe/Berlin",
        )
        db = MagicMock()
        db.execute = AsyncMock()

        pmc = {"total": _pmc_series(days=90)}
        with patch(
            "app.services.pmc_service.compute_user_pmc",
            new=AsyncMock(return_value=pmc),
        ):
            payload = await compute_goal_trajectory(db, 1, profile)

        assert payload["projection_basis"] == "none"
        assert payload["ctl_projected_at_goal"] is None
        assert payload["weekly_tss_required"] is None
        assert payload["on_track"] == "unknown"


# ======================================================================
# Serialization
# ======================================================================

class TestSerialization:
    def test_dict_roundtrip_includes_basis(self):
        pmc = _pmc_series(start_ctl=40.0, daily_delta=0.1, days=60)
        tp = project(pmc, athlete_goals=_goals(30, 50.0), phase="build1")
        d = trajectory_to_dict(tp)
        assert d["ctl_now"] == tp.ctl_now
        assert d["taper_window"] == tp.taper_window
        assert d["on_track"] == tp.on_track
        assert d["narrative_hook"] == tp.narrative_hook
        assert d["projection_basis"] == tp.projection_basis
