"""Dual-sport (bike + run) coordination in the mesocycle week generator.

Covers the invariants of the run-interleave feature in
``mesocycle_generator.build_week_drafts``:

  1. Regression guard — cycling-only athletes get the exact same 7 bike
     drafts as before (no run rows, no budget change).
  2. Run count — 2 runs/week default, 3 when weekly_hours >= 8.
  3. Placement — runs only on bike-rest / bike-easy days; never on or
     adjacent to the hardest bike day; at most one run per date.
  4. Cross-sport hard-hard guard — the weekly quality run is never within
     24h of a hard bike session; quality runs exist ONLY in build/peak
     phases and never on a recovery (deload) week.
  5. Rest-day survival — at least one full rest day carries no run.
  6. Shared load budget — run rTSS estimates shrink the bike filler budget
     so the combined week still respects the weekly TSS target.
  7. Direction symmetry — primary running + secondary cycling also gets the
     interleave, with bike rows labelled 'cycling'.
  8. Run-program deferral — an active RUN program owns run scheduling; the
     mesocycle adds no maintenance runs (no double-planning).
  9. Determinism — identical inputs produce identical drafts.

All tests are pure-function tests on build_week_drafts (no DB) except the
final generate_mesocycle integration test, which mocks the AsyncSession.
"""
from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.mesocycle_generator import (
    _HARD_TYPES,
    build_week_drafts,
    generate_mesocycle,
)
from app.services.run_workout_templates import RUN_TEMPLATES
from app.services.workout_templates import TEMPLATES

# A fixed Monday keeps every rotation (template variety, quality-run flavor)
# deterministic across test runs.
MONDAY = date(2026, 7, 20)
assert MONDAY.weekday() == 0

_HARD_BIKE_CATEGORIES = {"tempo", "sweet_spot", "threshold", "vo2"}
_EASY_BIKE_CATEGORIES = {"rest", "recovery", "endurance"}
_RUN_QUALITY_IDS = {"run_strides_8x20", "run_tempo_20"}


# ──────────────────────────────────────────────────────────────────────────────
#  Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _athlete(**overrides) -> SimpleNamespace:
    ns = SimpleNamespace(
        id=1,
        user_id=1,
        ftp_watts=250,
        primary_sport="cycling",
        target_event_date=None,
        target_event_type=None,
        weekly_hours_available=10.0,
        secondary_sports=["running"],
    )
    for key, value in overrides.items():
        setattr(ns, key, value)
    return ns


def _week(
    athlete: SimpleNamespace,
    phase: str = "maintenance",
    block: str = "accumulation",
    tss: int = 400,
    week_start: date = MONDAY,
):
    return build_week_drafts(
        athlete=athlete,
        week_start=week_start,
        phase=phase,
        weekly_tss_target_val=tss,
        block_position=block,
        ftp_w=athlete.ftp_watts or 250,
    )


def _bike(drafts):
    return [d for d in drafts if d.sport != "running"]


def _runs(drafts):
    return [d for d in drafts if d.sport == "running"]


def _bike_by_date(drafts):
    return {d.date: d for d in _bike(drafts)}


def _hardest_bike_date(drafts) -> date:
    """Highest-TSS bike day (earliest wins ties) — mirrors the generator."""
    ridden = [
        d for d in _bike(drafts) if TEMPLATES[d.template_id].category != "rest"
    ]
    return max(
        ridden, key=lambda d: (TEMPLATES[d.template_id].base_tss, -d.date.toordinal())
    ).date


# Phase/block grid where the hardest bike day is a FIXED quality session
# (base_tss above every filler), so the hardest-day identity is stable
# through filler trimming and the adjacency invariant is directly checkable.
_BUILD_GRID = [
    ("maintenance", "accumulation", 400),
    ("base1", "accumulation", 350),
    ("base2", "transmutation", 420),
    ("build1", "transmutation", 450),
    ("build2", "realization", 480),
    ("peak", "accumulation", 480),
]

# Full grid including deload weeks — for the invariants that hold everywhere.
_FULL_GRID = _BUILD_GRID + [
    ("build2", "recovery", 280),
    ("maintenance", "recovery", 260),
]


# ──────────────────────────────────────────────────────────────────────────────
#  1. Regression guard — cycling-only athletes are untouched
# ──────────────────────────────────────────────────────────────────────────────

class TestCyclingOnlyRegression:
    def test_no_run_drafts_and_seven_days(self):
        drafts = _week(_athlete(secondary_sports=[]))
        assert len(drafts) == 7
        assert all(d.sport == "cycling" for d in drafts)

    def test_none_secondary_sports_is_cycling_only(self):
        drafts = _week(_athlete(secondary_sports=None))
        assert len(drafts) == 7
        assert not _runs(drafts)

    def test_other_secondary_sport_does_not_trigger(self):
        drafts = _week(_athlete(secondary_sports=["swimming", "gym"]))
        assert len(drafts) == 7
        assert not _runs(drafts)
        # Byte-identical to the no-secondary week.
        assert drafts == _week(_athlete(secondary_sports=[]))

    @pytest.mark.parametrize("phase,block,tss", _FULL_GRID)
    def test_bike_week_identical_when_budget_is_loose(self, phase, block, tss):
        """With no filler trimming in play, the dual athlete's bike week is
        byte-identical to the cycling-only week — the ONLY bike-side effect
        of dual-sport is the shared TSS budget."""
        loose = 5000  # far above any weekly plan — trimming never fires
        solo = _week(_athlete(secondary_sports=[]), phase, block, loose)
        dual = _week(_athlete(), phase, block, loose)
        assert _bike(dual) == solo

    def test_primary_running_without_cycling_secondary_unchanged(self):
        """A pure runner (no secondary cycling) keeps today's behavior:
        7 drafts labelled with the primary sport, no interleaved runs."""
        drafts = _week(_athlete(primary_sport="running", secondary_sports=[]))
        assert len(drafts) == 7
        assert all(d.sport == "running" for d in drafts)
        # None of them are run sessions — same bike templates as before.
        assert all(d.template_id in TEMPLATES for d in drafts)


# ──────────────────────────────────────────────────────────────────────────────
#  2. Run count — 2 default, 3 at >= 8 weekly hours
# ──────────────────────────────────────────────────────────────────────────────

class TestRunCount:
    def test_two_runs_below_eight_hours(self):
        drafts = _week(_athlete(weekly_hours_available=6.0))
        assert len(_runs(drafts)) == 2

    def test_three_runs_at_or_above_eight_hours(self):
        assert len(_runs(_week(_athlete(weekly_hours_available=8.0)))) == 3
        assert len(_runs(_week(_athlete(weekly_hours_available=10.0)))) == 3

    def test_default_hours_none_falls_back_to_ten(self):
        # weekly_hours_available None → generator's 10h default → 3 runs.
        drafts = _week(_athlete(weekly_hours_available=None))
        assert len(_runs(drafts)) == 3

    @pytest.mark.parametrize("phase,block,tss", _FULL_GRID)
    def test_run_count_never_exceeds_target(self, phase, block, tss):
        drafts = _week(_athlete(), phase, block, tss)
        assert 1 <= len(_runs(drafts)) <= 3


# ──────────────────────────────────────────────────────────────────────────────
#  3. Placement invariants
# ──────────────────────────────────────────────────────────────────────────────

class TestPlacement:
    @pytest.mark.parametrize("phase,block,tss", _FULL_GRID)
    def test_runs_only_on_bike_rest_or_easy_days(self, phase, block, tss):
        drafts = _week(_athlete(), phase, block, tss)
        bike_by_date = _bike_by_date(drafts)
        for run in _runs(drafts):
            bike = bike_by_date[run.date]
            category = TEMPLATES[bike.template_id].category
            assert category in _EASY_BIKE_CATEGORIES, (
                f"{phase}/{block}: run on {run.date} shares the day with a "
                f"{category} bike session ({bike.template_id})"
            )

    @pytest.mark.parametrize("phase,block,tss", _FULL_GRID)
    def test_at_most_one_run_per_date(self, phase, block, tss):
        run_dates = [d.date for d in _runs(_week(_athlete(), phase, block, tss))]
        assert len(run_dates) == len(set(run_dates))

    @pytest.mark.parametrize("phase,block,tss", _BUILD_GRID)
    def test_never_adjacent_to_hardest_bike_day(self, phase, block, tss):
        """No run on, the day before, or the day after the hardest bike day."""
        drafts = _week(_athlete(), phase, block, tss)
        hardest = _hardest_bike_date(drafts)
        forbidden = {hardest - timedelta(days=1), hardest, hardest + timedelta(days=1)}
        for run in _runs(drafts):
            assert run.date not in forbidden, (
                f"{phase}/{block}: run on {run.date} adjacent to hardest "
                f"bike day {hardest}"
            )

    @pytest.mark.parametrize("phase,block,tss", _FULL_GRID)
    def test_at_least_one_full_rest_day_survives(self, phase, block, tss):
        drafts = _week(_athlete(), phase, block, tss)
        run_dates = {d.date for d in _runs(drafts)}
        full_rest = [
            d for d in _bike(drafts)
            if TEMPLATES[d.template_id].category == "rest" and d.date not in run_dates
        ]
        assert full_rest, f"{phase}/{block}: no run-free full rest day survived"

    @pytest.mark.parametrize("phase,block,tss", _FULL_GRID)
    def test_all_run_dates_inside_the_week(self, phase, block, tss):
        for run in _runs(_week(_athlete(), phase, block, tss)):
            assert MONDAY <= run.date <= MONDAY + timedelta(days=6)


# ──────────────────────────────────────────────────────────────────────────────
#  4. Quality run — build/peak only, never near hard bike work
# ──────────────────────────────────────────────────────────────────────────────

class TestQualityRun:
    @pytest.mark.parametrize("phase,block,tss", [
        ("maintenance", "accumulation", 400),
        ("base1", "accumulation", 350),
        ("base2", "transmutation", 420),
    ])
    def test_no_quality_run_outside_build_peak(self, phase, block, tss):
        runs = _runs(_week(_athlete(), phase, block, tss))
        assert runs
        assert all(r.template_id == "run_easy_45" for r in runs)

    @pytest.mark.parametrize("phase", ["build1", "build2", "peak"])
    def test_exactly_one_quality_run_in_build_peak(self, phase):
        runs = _runs(_week(_athlete(), phase, "accumulation", 480))
        quality = [r for r in runs if r.template_id in _RUN_QUALITY_IDS]
        assert len(quality) == 1, (
            f"{phase}: expected exactly one quality run, got "
            f"{[r.template_id for r in runs]}"
        )

    @pytest.mark.parametrize("phase", ["build1", "build2", "peak"])
    def test_no_quality_run_on_recovery_week(self, phase):
        """The deload is sacred — quality downgrades to easy on week 4."""
        runs = _runs(_week(_athlete(), phase, "recovery", 300))
        assert runs
        assert all(r.template_id == "run_easy_45" for r in runs)

    @pytest.mark.parametrize("phase,block,tss", _FULL_GRID)
    def test_quality_run_never_within_24h_of_hard_bike(self, phase, block, tss):
        """Never two hard sessions across sports within 24h."""
        drafts = _week(_athlete(), phase, block, tss)
        hard_bike_dates = {
            d.date for d in _bike(drafts)
            if TEMPLATES[d.template_id].category in _HARD_BIKE_CATEGORIES
        }
        for run in _runs(drafts):
            if run.template_id not in _RUN_QUALITY_IDS:
                continue
            window = {
                run.date - timedelta(days=1),
                run.date,
                run.date + timedelta(days=1),
            }
            assert not (window & hard_bike_dates), (
                f"{phase}/{block}: quality run {run.date} within 24h of hard "
                f"bike day(s) {sorted(window & hard_bike_dates)}"
            )

    def test_quality_flavor_rotates_week_over_week(self):
        """Strides ↔ tempo alternate across consecutive build weeks."""
        flavors = []
        for w in range(4):
            week_start = MONDAY + timedelta(weeks=w)
            runs = _runs(_week(_athlete(), "build2", "accumulation", 480, week_start))
            quality = [r.template_id for r in runs if r.template_id in _RUN_QUALITY_IDS]
            assert len(quality) == 1
            flavors.append(quality[0])
        assert flavors[0] != flavors[1]
        assert flavors == [flavors[0], flavors[1]] * 2

    def test_hard_types_module_contract(self):
        """The cross-sport guard keys off _HARD_TYPES — make sure the bike
        hard set still contains what the spec calls hard."""
        assert {"vo2", "threshold", "sweet_spot"} <= set(_HARD_TYPES)


# ──────────────────────────────────────────────────────────────────────────────
#  5. Shared load budget
# ──────────────────────────────────────────────────────────────────────────────

class TestSharedLoadBudget:
    def _bike_tss(self, drafts) -> float:
        return sum(TEMPLATES[d.template_id].base_tss for d in _bike(drafts))

    def _run_tss_estimate(self, drafts) -> float:
        total = 0.0
        for run in _runs(drafts):
            minutes = run.duration_seconds_target / 60.0
            factor = 1.1 if run.template_id in _RUN_QUALITY_IDS else 0.75
            total += minutes * factor
        return total

    def test_run_tss_shrinks_the_bike_filler(self):
        """On a tight budget the dual athlete's bike week carries LESS TSS
        than the cycling-only week — the runs ate part of the budget."""
        target = 350
        solo = _week(_athlete(secondary_sports=[]), tss=target)
        dual = _week(_athlete(), tss=target)
        assert self._bike_tss(dual) < self._bike_tss(solo)

    def test_combined_week_lands_near_target(self):
        """Bike TSS + run rTSS estimate respects the weekly target within the
        filler-overshoot tolerance the trimmer already allows."""
        target = 350
        dual = _week(_athlete(), tss=target)
        combined = self._bike_tss(dual) + self._run_tss_estimate(dual)
        # _FILLER_RECOVERY_OVERSHOOT (1.15) is the trimmer's worst-case pass;
        # fixed sessions can push slightly beyond, so allow a modest margin.
        assert combined <= target * 1.25, (
            f"combined load {combined:.0f} blew past target {target}"
        )

    def test_run_tss_estimate_formula(self):
        """duration_min × 0.75 easy / × 1.1 quality — spot-check the numbers."""
        easy = RUN_TEMPLATES["run_easy_45"]
        assert easy.duration_s == 45 * 60
        assert (easy.duration_s / 60.0) * 0.75 == pytest.approx(33.75)
        tempo = RUN_TEMPLATES["run_tempo_20"]
        assert (tempo.duration_s / 60.0) * 1.1 == pytest.approx(44.0)


# ──────────────────────────────────────────────────────────────────────────────
#  6. Run session shape
# ──────────────────────────────────────────────────────────────────────────────

class TestRunSessionShape:
    @pytest.mark.parametrize("phase,block,tss", _FULL_GRID)
    def test_run_draft_fields(self, phase, block, tss):
        for run in _runs(_week(_athlete(), phase, block, tss)):
            assert run.sport == "running"
            assert run.blocks_source == "ai_prescribed"
            assert run.template_id in RUN_TEMPLATES
            intervals = run.interval_structure["intervals"]
            assert intervals
            for block_ in intervals:
                assert isinstance(block_["duration_s"], int)
                assert block_["duration_s"] > 0
                assert 1 <= block_["zone"] <= 5
                assert 1 <= block_["rpe"] <= 10
                assert isinstance(block_["description"], str) and block_["description"]
            assert run.duration_seconds_target == sum(
                b["duration_s"] for b in intervals
            )

    def test_easy_run_duration_and_zone2_semantics(self):
        runs = _runs(_week(_athlete()))  # maintenance → all easy
        assert runs
        for run in runs:
            assert 40 * 60 <= run.duration_seconds_target <= 50 * 60
            for block_ in run.interval_structure["intervals"]:
                assert block_["zone"] <= 2, "easy run must stay Z1-Z2"

    def test_no_power_targets_on_runs(self):
        """Runs are pace/RPE sessions — never power blocks."""
        for run in _runs(_week(_athlete(), "build2", "accumulation", 480)):
            for block_ in run.interval_structure["intervals"]:
                assert "power_target_pct_ftp" not in block_
                assert "watts" not in block_


# ──────────────────────────────────────────────────────────────────────────────
#  7. Primary running + secondary cycling direction
# ──────────────────────────────────────────────────────────────────────────────

class TestPrimaryRunnerDirection:
    def test_interleave_applies_and_sports_are_labelled(self):
        athlete = _athlete(primary_sport="running", secondary_sports=["cycling"])
        drafts = _week(athlete)
        runs = _runs(drafts)
        bike = _bike(drafts)
        assert len(runs) == 3
        assert len(bike) == 7
        assert all(d.sport == "cycling" for d in bike)
        assert all(d.sport == "running" for d in runs)

    def test_case_insensitive_secondary_match(self):
        drafts = _week(_athlete(secondary_sports=["Running"]))
        assert _runs(drafts), "'Running' (capitalised) must still trigger"


# ──────────────────────────────────────────────────────────────────────────────
#  8. Run-program deferral — never double-plan runs
# ──────────────────────────────────────────────────────────────────────────────

class TestRunProgramDeferral:
    def test_active_run_program_suppresses_maintenance_runs(self):
        athlete = _athlete(
            goals={
                "program": {
                    "run": {"id": "run_5k_speed", "started": "2026-07-06"},
                    "bike": None,
                }
            }
        )
        drafts = _week(athlete)
        assert not _runs(drafts)
        # And the bike week is byte-identical to the cycling-only week.
        assert drafts == _week(_athlete(secondary_sports=[]))


# ──────────────────────────────────────────────────────────────────────────────
#  9. Determinism
# ──────────────────────────────────────────────────────────────────────────────

class TestDeterminism:
    @pytest.mark.parametrize("phase,block,tss", _FULL_GRID)
    def test_same_inputs_same_output(self, phase, block, tss):
        first = _week(_athlete(), phase, block, tss)
        second = _week(_athlete(), phase, block, tss)
        assert first == second


# ──────────────────────────────────────────────────────────────────────────────
#  10. generate_mesocycle integration (mock DB)
# ──────────────────────────────────────────────────────────────────────────────

def _mock_db(athlete: SimpleNamespace) -> MagicMock:
    db = MagicMock()

    def _scalar_result(value):
        r = MagicMock()
        r.scalar_one_or_none = MagicMock(return_value=value)
        return r

    dates_result = MagicMock()
    dates_result.fetchall = MagicMock(return_value=[])

    db.execute = AsyncMock(side_effect=[
        _scalar_result(None),     # idempotency check — no existing plan
        _scalar_result(athlete),  # athlete profile
        dates_result,             # no existing PlannedWorkout dates
    ])
    db.add = MagicMock()
    db.flush = AsyncMock()
    return db


def _next_monday() -> date:
    today = date.today()
    return today + timedelta(days=(0 - today.weekday()) % 7)


class TestGenerateMesocycleDualSport:
    async def test_run_rows_inserted_across_the_meso(self):
        athlete = _athlete()
        db = _mock_db(athlete)
        anchor = _next_monday()

        await generate_mesocycle(db, user_id=1, plan_start_date=anchor)

        added = [
            c.args[0] for c in db.add.call_args_list
            if c.args and hasattr(c.args[0], "sport")
        ]
        bike_rows = [w for w in added if w.sport == "cycling"]
        run_rows = [w for w in added if w.sport == "running"]

        assert len(bike_rows) == 28, "one bike row per day, all four weeks"
        assert len(run_rows) >= 4, "each week should carry maintenance runs"
        window_end = anchor + timedelta(days=27)
        for row in run_rows:
            assert anchor <= row.date <= window_end
        # No date carries two runs.
        run_dates = [w.date for w in run_rows]
        assert len(run_dates) == len(set(run_dates))

    async def test_cycling_only_meso_has_no_run_rows(self):
        athlete = _athlete(secondary_sports=[])
        db = _mock_db(athlete)

        await generate_mesocycle(db, user_id=1, plan_start_date=_next_monday())

        added = [
            c.args[0] for c in db.add.call_args_list
            if c.args and hasattr(c.args[0], "sport")
        ]
        assert len(added) == 28
        assert all(w.sport == "cycling" for w in added)
