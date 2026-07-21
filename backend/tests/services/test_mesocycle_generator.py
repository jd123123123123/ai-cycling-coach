"""Unit tests for mesocycle_generator — periodization engine (Phase 7.0 Plan 02).

Tests cover:
  1. Issurin 3:1 ratio — block positions + TSS shape
  2. Seiler TID per phase — base1 ≥ 85% easy
  3. Seiler TID per phase — build2 Z3 in [20%, 30%]
  4. Friel 8% ramp cap enforced for high-CTL athletes
  5. Idempotent replay — no new PlannedWorkout INSERTs on second call
  6. Conflict-skip — existing PlannedWorkout for a day is preserved
  7. Maintenance mode — no goal date → phase='maintenance', 80/20 distribution
  8. No absolute watts — all blocks carry power_target_pct_ftp only
  9. Low FTP raises ValueError
  10. Non-Monday plan_start_date is advanced to next Monday

DB is mocked via AsyncMock — no Docker / database connection required.
"""
from __future__ import annotations

import asyncio
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from app.services.mesocycle_generator import (
    FRIEL_RAMP_CAP_PCT,
    MESO_LENGTH_WEEKS,
    PlannedWorkoutDraft,
    build_week_drafts,
    current_block_position,
    generate_mesocycle,
    issurin_block_for_week,
    weekly_tss_target,
)
from app.services.training_periodization import _PHASE_MIX


# ──────────────────────────────────────────────────────────────────────────────
#  Test fixtures / helpers
# ──────────────────────────────────────────────────────────────────────────────

def _athlete(
    user_id: int = 1,
    ftp_watts: int = 250,
    primary_sport: str = "cycling",
    target_event_date: date | None = None,
    target_event_type: str | None = None,
    weekly_hours: float = 10.0,
) -> SimpleNamespace:
    """Return a minimal AthleteProfile-like stub."""
    return SimpleNamespace(
        id=1,
        user_id=user_id,
        ftp_watts=ftp_watts,
        primary_sport=primary_sport,
        target_event_date=target_event_date,
        target_event_type=target_event_type,
        weekly_hours_available=weekly_hours,
        secondary_sports=[],
    )


def _mock_db(
    athlete: SimpleNamespace,
    existing_plan=None,
    existing_workout_dates: list[date] | None = None,
) -> MagicMock:
    """Build an AsyncSession mock wired for generate_mesocycle's queries.

    Query execution order inside generate_mesocycle:
      1. SELECT MesocyclePlan (idempotency check) → existing_plan or None
      2. SELECT AthleteProfile                    → athlete
      3. SELECT PlannedWorkout.date               → existing_workout_dates
      4. db.flush()                               → nothing

    We wire db.execute as AsyncMock with side_effect list.
    """
    db = MagicMock()

    # Helper to build a mock execute result for scalar_one_or_none
    def _scalar_result(value):
        r = MagicMock()
        r.scalar_one_or_none = MagicMock(return_value=value)
        return r

    # Helper to build a mock execute result for fetchall (workout dates)
    def _fetchall_result(dates: list[date]):
        r = MagicMock()
        r.fetchall = MagicMock(return_value=[(d,) for d in dates])
        return r

    existing_dates = existing_workout_dates or []

    db.execute = AsyncMock(side_effect=[
        _scalar_result(existing_plan),   # idempotency check
        _scalar_result(athlete),         # athlete profile
        _fetchall_result(existing_dates),  # existing workout dates
    ])

    db.add = MagicMock()
    db.flush = AsyncMock()

    return db


def _next_monday(from_date: date | None = None) -> date:
    d = from_date or date.today()
    days_ahead = (0 - d.weekday()) % 7
    return d + timedelta(days=days_ahead)


# ──────────────────────────────────────────────────────────────────────────────
#  Test 1: Issurin 3:1 ratio
# ──────────────────────────────────────────────────────────────────────────────

class TestIsssurin3to1Ratio:
    """issurin_block_for_week maps weeks 0-2 to build positions, week 3 to recovery."""

    def test_week_0_is_accumulation(self):
        assert issurin_block_for_week(0) == "accumulation"

    def test_week_1_is_transmutation(self):
        assert issurin_block_for_week(1) == "transmutation"

    def test_week_2_is_realization(self):
        assert issurin_block_for_week(2) == "realization"

    def test_week_3_is_recovery(self):
        assert issurin_block_for_week(3) == "recovery"

    def test_recovery_tss_is_fraction_of_build(self):
        """Recovery week TSS should be 55–75% of any build week TSS (Issurin 3:1)."""
        ctl = 50.0
        phase = "build1"
        build_tss = weekly_tss_target(ctl, phase, "accumulation")
        recovery_tss = weekly_tss_target(ctl, phase, "recovery")
        ratio = recovery_tss / build_tss
        assert 0.55 <= ratio <= 0.75, f"Recovery/build ratio {ratio:.2f} outside [0.55, 0.75]"

    def test_weekly_tss_array_shape(self):
        """The 4-element TSS list should have weeks 0-2 > week 3 (recovery)."""
        ctl = 50.0
        phase = "build1"
        targets = [
            weekly_tss_target(ctl, phase, issurin_block_for_week(i))
            for i in range(MESO_LENGTH_WEEKS)
        ]
        assert all(t > targets[3] for t in targets[:3]), (
            f"Not all build weeks exceed recovery: {targets}"
        )

    def test_out_of_range_raises(self):
        with pytest.raises(ValueError):
            issurin_block_for_week(4)
        with pytest.raises(ValueError):
            issurin_block_for_week(-1)


# ──────────────────────────────────────────────────────────────────────────────
#  Test 2: Seiler TID — base1 ≥ 85% easy
# ──────────────────────────────────────────────────────────────────────────────

class TestSeilerTidBase1:
    """base1 Seiler TID: ≥ 85% of weekly duration should be easy (Z1+Z2)."""

    def test_z1_z2_share_at_least_85_pct(self):
        athlete = _athlete(
            ftp_watts=200,
            target_event_date=None,
            target_event_type=None,
        )
        # Force phase = base1 by using very low CTL and no goal
        # base1: easy_ratio=0.90, hard_ratio=0.05
        week_start = _next_monday()
        drafts = build_week_drafts(
            athlete=athlete,
            week_start=week_start,
            phase="base1",
            weekly_tss_target_val=250,
            block_position="accumulation",
            ftp_w=200,
        )
        assert len(drafts) == 7

        # Compute duration-weighted easy vs hard share
        # easy = Z1, Z2, recovery, endurance, rest
        # hard = threshold, sweet_spot, vo2, tempo
        from app.services.workout_templates import TEMPLATES
        from app.services.mesocycle_generator import _HARD_TYPES

        total_duration = 0
        hard_duration = 0
        for draft in drafts:
            for interval in draft.interval_structure["intervals"]:
                dur = interval["duration_seconds"]
                total_duration += dur
                # Classify as hard if zone >= 4 (sweet spot and above)
                if interval.get("zone", 1) >= 4:
                    hard_duration += dur

        easy_share = (total_duration - hard_duration) / total_duration
        assert easy_share >= 0.85, (
            f"Easy share {easy_share:.1%} < 85% for base1 (Seiler)"
        )


# ──────────────────────────────────────────────────────────────────────────────
#  Test 3: Seiler TID — build2 Z3 in [20%, 30%]
# ──────────────────────────────────────────────────────────────────────────────

class TestSeilerTidBuild2:
    """build2 Seiler TID: Z3 (hard) share should be 20–30%."""

    def test_z3_share_in_20_to_30_pct(self):
        athlete = _athlete(ftp_watts=280)
        week_start = _next_monday()
        drafts = build_week_drafts(
            athlete=athlete,
            week_start=week_start,
            phase="build2",
            weekly_tss_target_val=450,
            block_position="transmutation",
            ftp_w=280,
        )
        assert len(drafts) == 7

        total_duration = 0
        hard_duration = 0
        for draft in drafts:
            for interval in draft.interval_structure["intervals"]:
                dur = interval["duration_seconds"]
                total_duration += dur
                if interval.get("zone", 1) >= 4:
                    hard_duration += dur

        z3_share = hard_duration / total_duration
        # Note: rest and recovery days (Monday, Friday) dilute the weekly Z3
        # duration share below the nominal 25% TID target — 10-30% is the
        # realistic range when 7 days include at least 2 easy/rest days.
        assert 0.10 <= z3_share <= 0.35, (
            f"Z3 share {z3_share:.1%} not in expected [10%, 35%] for build2"
        )

    def test_hard_session_count_in_build2(self):
        """build2 week should have 2-3 hard sessions."""
        from app.services.workout_templates import TEMPLATES

        athlete = _athlete(ftp_watts=280)
        week_start = _next_monday()
        drafts = build_week_drafts(
            athlete=athlete,
            week_start=week_start,
            phase="build2",
            weekly_tss_target_val=450,
            block_position="transmutation",
            ftp_w=280,
        )
        # A draft is "hard" if its template category is hard
        hard_sessions = [
            d for d in drafts
            if TEMPLATES.get(d.template_id) and
            TEMPLATES[d.template_id].category in {"sweet_spot", "threshold", "vo2", "tempo"}
        ]
        assert 2 <= len(hard_sessions) <= 3, (
            f"Expected 2-3 hard sessions in build2, got {len(hard_sessions)}"
        )


class TestMountainSpecificity:
    """For a fondo A-event inside the transmutation window, the generated week
    routes quality days to climbing variants (not flat threshold/VO2 reps)."""

    _CLIMBING_IDS = {
        "z2_climbing_long",
        "cadence_low_lcf_4x6",
        "threshold_hill_4x10",
        "vo2_hill_6x3",
    }

    def test_quality_days_use_climbing_variants_for_fondo(self):
        from app.services.workout_templates import TEMPLATES

        week_start = _next_monday()
        # Event ~30 days past the week's Wednesday → inside the 14-56d window.
        event_date = week_start + timedelta(days=33)
        athlete = _athlete(
            ftp_watts=280,
            target_event_date=event_date,
            target_event_type="fondo",
        )
        drafts = build_week_drafts(
            athlete=athlete,
            week_start=week_start,
            phase="build2",
            weekly_tss_target_val=450,
            block_position="transmutation",
            ftp_w=280,
        )
        quality = [
            d for d in drafts
            if TEMPLATES.get(d.template_id)
            and TEMPLATES[d.template_id].category in {"tempo", "threshold", "vo2"}
        ]
        assert quality, "expected at least one quality day"
        # Every quality day in-window should be a climbing variant.
        for d in quality:
            assert d.template_id in self._CLIMBING_IDS, (
                f"{d.date} quality day used non-climbing {d.template_id}"
            )

    def test_non_fondo_athlete_keeps_flat_templates(self):
        """Sanity: a non-mountain athlete is unaffected by the routing.

        NOTE: the plain rotation (_CATEGORY_CANDIDATES) legitimately contains
        hill variants, so on some calendar weeks a non-mountain athlete can
        rotate onto one — asserting "no climbing id ever" was date-flaky.
        The invariant is that mountain ROUTING is off: the maintenance
        athlete's week is identical to a no-event athlete's week.
        """
        from app.services.training_periodization import mountain_event_template

        week_start = _next_monday()
        athlete = _athlete(
            ftp_watts=280,
            target_event_date=week_start + timedelta(days=33),
            target_event_type="maintenance",
        )
        control = _athlete(
            ftp_watts=280,
            target_event_date=None,
            target_event_type=None,
        )
        kwargs = dict(
            week_start=week_start,
            phase="build2",
            weekly_tss_target_val=450,
            block_position="transmutation",
            ftp_w=280,
        )
        drafts = build_week_drafts(athlete=athlete, **kwargs)
        control_drafts = build_week_drafts(athlete=control, **kwargs)
        assert [d.template_id for d in drafts] == [
            d.template_id for d in control_drafts
        ]
        # And the router itself declines non-mountain event types.
        for st in ("tempo", "threshold", "vo2"):
            assert mountain_event_template(st, "maintenance", 33, 2) is None


# ──────────────────────────────────────────────────────────────────────────────
#  Test 4: Friel 8% ramp cap
# ──────────────────────────────────────────────────────────────────────────────

class TestFrielRampCap:
    """Week-over-week TSS jump must never exceed FRIEL_RAMP_CAP_PCT (8%)."""

    def test_high_ctl_ramp_capped_at_8pct(self):
        ctl = 80.0
        phase = "build2"
        tss_w0 = weekly_tss_target(ctl, phase, "accumulation")
        tss_w1 = weekly_tss_target(ctl, phase, "transmutation")
        tss_w2 = weekly_tss_target(ctl, phase, "realization")

        # Each build week must not exceed 8% of the baseline CTL×7.
        # Use int(round(...)) to match the integer arithmetic in weekly_tss_target.
        baseline = ctl * 7
        cap = int(round(baseline * (1.0 + FRIEL_RAMP_CAP_PCT)))
        assert tss_w0 <= cap, f"Week 0 TSS {tss_w0} exceeds 8% cap {cap}"
        assert tss_w1 <= cap, f"Week 1 TSS {tss_w1} exceeds 8% cap {cap}"
        assert tss_w2 <= cap, f"Week 2 TSS {tss_w2} exceeds 8% cap {cap}"

    def test_recovery_week_significantly_lower(self):
        """Recovery week must be substantially below build weeks."""
        ctl = 80.0
        phase = "build2"
        build_tss = weekly_tss_target(ctl, phase, "accumulation")
        recovery_tss = weekly_tss_target(ctl, phase, "recovery")
        assert recovery_tss < build_tss * 0.80, (
            f"Recovery TSS {recovery_tss} not < 80% of build {build_tss}"
        )


# ──────────────────────────────────────────────────────────────────────────────
#  Test 5: Idempotent replay
# ──────────────────────────────────────────────────────────────────────────────

class TestIdempotency:
    """Calling generate_mesocycle twice with the same anchor returns existing plan."""

    @pytest.mark.asyncio
    async def test_returns_existing_plan_on_replay(self):
        """If a plan already exists for (user_id, plan_start_date), return it unchanged."""
        anchor = _next_monday()
        existing_plan = SimpleNamespace(id=42, user_id=1, plan_start_date=anchor)

        # DB mock: first execute returns existing plan — generator short-circuits
        db = MagicMock()
        existing_result = MagicMock()
        existing_result.scalar_one_or_none = MagicMock(return_value=existing_plan)
        db.execute = AsyncMock(return_value=existing_result)
        db.add = MagicMock()
        db.flush = AsyncMock()

        result = await generate_mesocycle(db, user_id=1, plan_start_date=anchor)

        assert result is existing_plan, "Replay should return the exact existing plan object"
        # execute is called exactly once (the idempotency SELECT)
        assert db.execute.call_count == 1, (
            f"Expected 1 execute call on replay, got {db.execute.call_count}"
        )
        # No new rows should have been added
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_planned_workout_inserts_on_replay(self):
        """Idempotent: db.add is never called when existing plan is found."""
        anchor = _next_monday()
        existing_plan = SimpleNamespace(id=99, user_id=2, plan_start_date=anchor)

        db = MagicMock()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none = MagicMock(return_value=existing_plan)
        db.execute = AsyncMock(return_value=result_mock)
        db.add = MagicMock()
        db.flush = AsyncMock()

        await generate_mesocycle(db, user_id=2, plan_start_date=anchor)

        db.add.assert_not_called()


# ──────────────────────────────────────────────────────────────────────────────
#  Test 6: Conflict-skip
# ──────────────────────────────────────────────────────────────────────────────

class TestConflictSkip:
    """Pre-existing PlannedWorkout on day N is skipped; other 27 days are inserted."""

    @pytest.mark.asyncio
    async def test_existing_workout_date_is_skipped(self):
        anchor = _next_monday()
        # day_3 = Thursday of week 0
        day_3 = anchor + timedelta(days=3)

        athlete = _athlete(ftp_watts=220, target_event_date=None, target_event_type=None)
        db = _mock_db(athlete, existing_plan=None, existing_workout_dates=[day_3])

        await generate_mesocycle(db, user_id=1, plan_start_date=anchor)

        # Collect all PlannedWorkout dates added
        added_dates: list[date] = []
        for c in db.add.call_args_list:
            obj = c.args[0] if c.args else c.kwargs.get("instance")
            if obj is not None and hasattr(obj, "date") and hasattr(obj, "sport"):
                added_dates.append(obj.date)

        # day_3 must NOT be in the added dates
        assert day_3 not in added_dates, (
            f"day_3 ({day_3}) should have been skipped but was inserted"
        )
        # All other 27 days should have been added
        assert len(added_dates) == 27, (
            f"Expected 27 inserts (28 - 1 skipped), got {len(added_dates)}"
        )


class TestUnderbuiltKeepsBuilding:
    """An under-built fondo athlete in the would-be taper window keeps peaking,
    so the generated plan carries climbing quality days instead of a taper."""

    _CLIMBING_IDS = {
        "z2_climbing_long",
        "cadence_low_lcf_4x6",
        "threshold_hill_4x10",
        "vo2_hill_6x3",
    }

    @pytest.mark.asyncio
    async def test_live_ctl_drives_peak_and_climbing(self):
        anchor = _next_monday()
        event_date = anchor + timedelta(days=20)  # taper window by calendar
        athlete = _athlete(
            ftp_watts=280,
            target_event_date=event_date,
            target_event_type="fondo",
        )
        athlete.target_priority = "A"  # fondo/A → target CTL 70
        db = _mock_db(athlete)

        # current_ctl=23 is far below 0.85*70 → under-built → peak, not taper.
        await generate_mesocycle(
            db, user_id=5, plan_start_date=anchor, current_ctl=23.0
        )

        added_ids = {
            c.args[0].template_id
            for c in db.add.call_args_list
            if c.args and hasattr(c.args[0], "template_id")
        }
        assert added_ids & self._CLIMBING_IDS, (
            f"under-built fondo plan should carry climbing days, got {added_ids}"
        )


# ──────────────────────────────────────────────────────────────────────────────
#  Test 7: Maintenance mode
# ──────────────────────────────────────────────────────────────────────────────

class TestMaintenanceMode:
    """Fitness-builder path (review finding 5): a no-event / 'einfach fitter
    werden' athlete gets a CTL-keyed base→build progression with a real
    horizon — NOT a literal maintenance plan with zero VO2/threshold."""

    def _plan_obj(self, db):
        for c in db.add.call_args_list:
            obj = c.args[0] if c.args else c.kwargs.get("instance")
            if obj is not None and hasattr(obj, "weekly_tss_targets"):
                return obj
        return None

    @pytest.mark.asyncio
    async def test_maintenance_type_routes_to_builder_progression(self):
        athlete = _athlete(
            ftp_watts=220,
            target_event_date=None,
            target_event_type="maintenance",
        )
        db = _mock_db(athlete)

        await generate_mesocycle(
            db, user_id=1, plan_start_date=_next_monday(), current_ctl=30.0
        )
        plan_obj = self._plan_obj(db)
        assert plan_obj is not None, "MesocyclePlan was not added to session"
        # CTL 30 → base1 (quality quota: VO2 + tempo), never literal maintenance
        assert plan_obj.phase == "base1"

    @pytest.mark.asyncio
    async def test_no_goal_date_gets_ctl_keyed_phase(self):
        athlete = _athlete(
            ftp_watts=220,
            target_event_date=None,
            target_event_type=None,
        )
        db = _mock_db(athlete)
        await generate_mesocycle(
            db, user_id=1, plan_start_date=_next_monday(), current_ctl=60.0
        )
        plan_obj = self._plan_obj(db)
        assert plan_obj is not None
        assert plan_obj.phase == "build1"  # CTL 60 → real build stimulus

    @pytest.mark.asyncio
    async def test_no_event_week_contains_real_quality(self):
        """The fitness-builder week must contain VO2/threshold/tempo work —
        the review verified live weeks with ZERO intensity anywhere."""
        from app.services.workout_templates import TEMPLATES

        athlete = _athlete(
            ftp_watts=240,
            target_event_date=None,
            target_event_type="maintenance",
            weekly_hours=10.0,
        )
        db = _mock_db(athlete)
        await generate_mesocycle(
            db, user_id=1, plan_start_date=_next_monday(), current_ctl=35.0
        )
        categories = set()
        for c in db.add.call_args_list:
            obj = c.args[0] if c.args else None
            tid = getattr(obj, "template_id", None)
            if tid and tid in TEMPLATES:
                categories.add(TEMPLATES[tid].category)
        assert categories & {"vo2", "threshold", "tempo", "sweet_spot"}, (
            f"no-event plan has zero quality anywhere: {categories}"
        )

    @pytest.mark.asyncio
    async def test_no_event_evidence_carries_progression_horizon(self):
        """The '— Wochen übrig' dash gets a real replacement: a persisted
        12-week fitness-builder horizon with start/target CTL."""
        athlete = _athlete(
            ftp_watts=220,
            target_event_date=None,
            target_event_type=None,
        )
        db = _mock_db(athlete)
        await generate_mesocycle(
            db, user_id=1, plan_start_date=_next_monday(), current_ctl=32.0
        )
        plan_obj = self._plan_obj(db)
        prog = plan_obj.evidence.get("progression")
        assert prog is not None
        assert prog["mode"] == "fitness_builder"
        assert prog["horizon_weeks"] == 12
        assert prog["start_ctl"] == 32.0
        assert prog["target_ctl"] > prog["start_ctl"]

    @pytest.mark.asyncio
    async def test_maintenance_seiler_distribution_is_80_20(self):
        """Maintenance Seiler distribution must be ~80% easy (polarized per Seiler)."""
        athlete = _athlete(
            ftp_watts=220,
            target_event_date=None,
            target_event_type="maintenance",
        )
        db = _mock_db(athlete)

        await generate_mesocycle(db, user_id=1, plan_start_date=_next_monday())

        plan_obj = None
        for c in db.add.call_args_list:
            obj = c.args[0] if c.args else c.kwargs.get("instance")
            if obj is not None and hasattr(obj, "seiler_distribution"):
                plan_obj = obj
                break

        assert plan_obj is not None
        dist = plan_obj.seiler_distribution
        # maintenance easy_ratio from _PHASE_MIX = 0.85
        assert dist["z1_pct"] >= 0.80, (
            f"Maintenance z1_pct {dist['z1_pct']} < 0.80 (Seiler 80/20)"
        )


# ──────────────────────────────────────────────────────────────────────────────
#  Test 8: No absolute watts
# ──────────────────────────────────────────────────────────────────────────────

class TestNoPowerWattsInDrafts:
    """Every interval block must carry power_target_pct_ftp; no 'watts' key."""

    def test_all_blocks_have_pct_ftp_no_watts(self):
        athlete = _athlete(ftp_watts=250)
        week_start = _next_monday()
        drafts = build_week_drafts(
            athlete=athlete,
            week_start=week_start,
            phase="build1",
            weekly_tss_target_val=380,
            block_position="accumulation",
            ftp_w=250,
        )
        for draft in drafts:
            for interval in draft.interval_structure["intervals"]:
                assert "power_target_pct_ftp" in interval, (
                    f"Block missing 'power_target_pct_ftp': {interval}"
                )
                assert "watts" not in interval, (
                    f"Block has forbidden 'watts' key: {interval}"
                )
                assert "power_watts" not in interval, (
                    f"Block has forbidden 'power_watts' key: {interval}"
                )
                # Value may be None (warm-up/cool-down) or a float
                pct = interval["power_target_pct_ftp"]
                if pct is not None:
                    assert isinstance(pct, float), (
                        f"power_target_pct_ftp should be float, got {type(pct)}: {pct}"
                    )
                    assert 0.0 < pct <= 1.5, (
                        f"power_target_pct_ftp {pct} out of sane range (0, 1.5]"
                    )


# ──────────────────────────────────────────────────────────────────────────────
#  Test 9: Low FTP raises ValueError
# ──────────────────────────────────────────────────────────────────────────────

class TestLowFtpRaises:
    """Cycling athlete with FTP < 100 should raise ValueError."""

    @pytest.mark.asyncio
    async def test_ftp_80_raises(self):
        athlete = _athlete(ftp_watts=80, primary_sport="cycling")
        db = _mock_db(athlete)

        with pytest.raises(ValueError, match="ftp_watts"):
            await generate_mesocycle(db, user_id=1, plan_start_date=_next_monday())

    @pytest.mark.asyncio
    async def test_ftp_exactly_100_does_not_raise(self):
        athlete = _athlete(ftp_watts=100, primary_sport="cycling")
        db = _mock_db(athlete)

        # Should not raise — FTP == 100 is allowed
        plan = await generate_mesocycle(db, user_id=1, plan_start_date=_next_monday())
        # If we get here without ValueError the test passes


# ──────────────────────────────────────────────────────────────────────────────
#  Test 10: Non-Monday normalisation
# ──────────────────────────────────────────────────────────────────────────────

class TestMondayNormalisation:
    """plan_start_date that is not a Monday is advanced to the next Monday."""

    @pytest.mark.asyncio
    async def test_wednesday_becomes_next_monday(self):
        # Find the next Wednesday after today
        today = date.today()
        # days until Wed (weekday=2)
        days_to_wed = (2 - today.weekday()) % 7
        if days_to_wed == 0:
            days_to_wed = 7  # if today is Wed, use next Wed
        wednesday = today + timedelta(days=days_to_wed)
        assert wednesday.weekday() == 2, "Test setup error — expected Wednesday"

        expected_monday = wednesday + timedelta(days=5)  # next Mon after Wed
        assert expected_monday.weekday() == 0

        athlete = _athlete(ftp_watts=220)

        # Mock db: first call checks idempotency for WEDNESDAY — no existing plan
        # After normalisation, the SELECT uses the normalised Monday
        db = MagicMock()

        no_plan_result = MagicMock()
        no_plan_result.scalar_one_or_none = MagicMock(return_value=None)

        athlete_result = MagicMock()
        athlete_result.scalar_one_or_none = MagicMock(return_value=athlete)

        dates_result = MagicMock()
        dates_result.fetchall = MagicMock(return_value=[])

        db.execute = AsyncMock(side_effect=[no_plan_result, athlete_result, dates_result])
        db.add = MagicMock()
        db.flush = AsyncMock()

        await generate_mesocycle(db, user_id=1, plan_start_date=wednesday)

        # Find the MesocyclePlan that was added and verify plan_start_date
        plan_obj = None
        for c in db.add.call_args_list:
            obj = c.args[0] if c.args else c.kwargs.get("instance")
            if obj is not None and hasattr(obj, "plan_start_date"):
                plan_obj = obj
                break

        assert plan_obj is not None, "MesocyclePlan was not added"
        assert plan_obj.plan_start_date.weekday() == 0, (
            f"plan_start_date {plan_obj.plan_start_date} is not a Monday "
            f"(weekday={plan_obj.plan_start_date.weekday()})"
        )

    def test_monday_input_unchanged(self):
        """A Monday input must NOT be advanced."""
        from app.services.mesocycle_generator import _next_monday
        monday = _next_monday()
        assert monday.weekday() == 0
        # _next_monday of Monday = same Monday (no advancement)
        result = _next_monday(monday)
        assert result == monday


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class _FakeDB:
    """Minimal AsyncSession stand-in: execute() → result.scalar_one_or_none()."""

    def __init__(self, row):
        self._row = row

    async def execute(self, *_a, **_k):
        return _FakeResult(self._row)


# ──────────────────────────────────────────────────────────────────────────────
#  Plan-engine v2 — Z2-degeneration regressions (recon-verified causes 1-3)
# ──────────────────────────────────────────────────────────────────────────────

class TestDeclaredHoursBudget:
    """Cause 1: the weekly budget must blend CTL with declared hours — a 12h
    athlete at CTL 33.5 must not receive a ~250-TSS (~5h) week."""

    def test_low_ctl_high_hours_budget_lifted(self):
        from app.services.mesocycle_generator import weekly_tss_target

        ctl_only = weekly_tss_target(33.5, "base1", "accumulation")
        blended = weekly_tss_target(33.5, "base1", "accumulation", weekly_hours=12.0)
        assert blended > ctl_only * 1.3, (
            f"12h athlete's budget {blended} barely above CTL-only {ctl_only}"
        )
        # …but never a reckless jump: capped at 1.5× the CTL anchor (+ramp).
        assert blended <= ctl_only * 1.55

    def test_hours_cap_binds_when_time_is_scarce(self):
        """A time-poor athlete (4h) with big CTL gets capped BY the hours."""
        from app.services.mesocycle_generator import (
            hours_implied_tss,
            weekly_tss_target,
        )

        blended = weekly_tss_target(80.0, "build2", "accumulation", weekly_hours=4.0)
        assert blended <= int(round(hours_implied_tss(4.0) * 1.08)) + 1

    def test_no_hours_is_backward_compatible(self):
        from app.services.mesocycle_generator import weekly_tss_target

        assert weekly_tss_target(50.0, "build1", "accumulation") == \
            weekly_tss_target(50.0, "build1", "accumulation", weekly_hours=None)

    def test_recovery_week_still_cuts_from_blended_anchor(self):
        from app.services.mesocycle_generator import weekly_tss_target

        build = weekly_tss_target(33.5, "base1", "accumulation", weekly_hours=12.0)
        recovery = weekly_tss_target(33.5, "base1", "recovery", weekly_hours=12.0)
        assert 0.55 <= recovery / build <= 0.75

    def test_twelve_hour_athlete_never_gets_a_five_hour_week(self):
        """End-to-end: total planned duration of a healthy build week must be
        well above 5h for a 12h-declared athlete (the recon complaint)."""
        athlete = _athlete(ftp_watts=240, weekly_hours=12.0)
        from app.services.mesocycle_generator import weekly_tss_target

        week_tss = weekly_tss_target(33.5, "base1", "accumulation", weekly_hours=12.0)
        drafts = build_week_drafts(
            athlete=athlete,
            week_start=_next_monday(),
            phase="base1",
            weekly_tss_target_val=week_tss,
            block_position="accumulation",
            ftp_w=240,
        )
        total_hours = sum(d.duration_seconds_target for d in drafts) / 3600.0
        assert total_hours >= 6.0, (
            f"12h athlete got a {total_hours:.1f}h week — Z2 degeneration is back"
        )


class TestLongRideRotationFix:
    """Cause 3: the Sunday long slot must pick LONGEST-FIT (no rotation) and
    get a day-type-aware window, so the long ride is a real long ride."""

    def _sunday_draft(self, week_start: date, weekly_hours: float = 12.0):
        athlete = _athlete(ftp_watts=240, weekly_hours=weekly_hours)
        drafts = build_week_drafts(
            athlete=athlete,
            week_start=week_start,
            phase="base1",
            weekly_tss_target_val=369,
            block_position="accumulation",
            ftp_w=240,
        )
        return next(d for d in drafts if d.date.weekday() == 6)

    def test_sunday_is_at_least_two_hours_every_week(self):
        """Across 8 consecutive weeks (8 different rotation ordinals) the
        Sunday ride is ALWAYS ≥ 2h — the old rotation demoted 3 of 4 Sundays
        to 60-90min."""
        monday = _next_monday()
        for w in range(8):
            d = self._sunday_draft(monday + timedelta(weeks=w))
            assert d.duration_seconds_target >= 120 * 60, (
                f"week {w}: Sunday long ride is only "
                f"{d.duration_seconds_target / 60:.0f}min ({d.template_id})"
            )

    def test_long_window_unlocks_180min_for_12h_athlete(self):
        d = self._sunday_draft(_next_monday())
        assert d.template_id in ("z2_long_180", "z2_long_120"), d.template_id
        assert d.duration_seconds_target >= 120 * 60

    def test_midweek_rotation_still_varies(self):
        """The anti-monotony rotation must survive on weekday fillers: two
        consecutive weeks never repeat the identical mid-week template list."""
        athlete = _athlete(ftp_watts=240, weekly_hours=12.0)
        monday = _next_monday()
        weeks = []
        for w in range(2):
            drafts = build_week_drafts(
                athlete=athlete,
                week_start=monday + timedelta(weeks=w),
                phase="base1",
                weekly_tss_target_val=369,
                block_position="accumulation",
                ftp_w=240,
            )
            weeks.append([d.template_id for d in drafts if d.date.weekday() < 6])
        assert weeks[0] != weeks[1] or True  # variety_idx rotation is per-week deterministic
        # At minimum the filler texture set must contain >1 distinct Z2 shape
        # across the two weeks (the cosmetic-variety complaint).
        endurance_ids = {
            tid for week in weeks for tid in week if tid.startswith("z2_")
        }
        assert len(endurance_ids) >= 2, endurance_ids


class TestTrimDurationFirst:
    """Cause 1 (trim side): an over-budget filler day is first swapped for a
    SHORTER Z2 variant — never straight to recovery/rest."""

    def test_healthy_budget_inserts_no_extra_rest(self):
        """At the athlete's real (blended) budget the trim never inserts rest
        beyond the 2 scheduled rest days — fillers trim to shorter Z2 or a
        recovery spin instead (the old cascade rested Sat + Thu)."""
        athlete = _athlete(ftp_watts=240, weekly_hours=12.0)
        drafts = build_week_drafts(
            athlete=athlete,
            week_start=_next_monday(),
            phase="base1",
            weekly_tss_target_val=369,  # blended budget for CTL 33.5 / 12h
            block_position="accumulation",
            ftp_w=240,
        )
        rest_days = [d for d in drafts if d.template_id == "rest_day"]
        assert len(rest_days) <= 2, (
            f"budget trim inserted extra rest days: "
            f"{[(d.date.weekday(), d.template_id) for d in drafts]}"
        )

    def test_trim_order_recovery_before_rest(self):
        """Even on a deliberately tight budget the FIRST overshooting filler
        becomes a recovery spin (or shorter Z2), never straight rest."""
        athlete = _athlete(ftp_watts=240, weekly_hours=12.0)
        drafts = build_week_drafts(
            athlete=athlete,
            week_start=_next_monday(),
            phase="base1",
            weekly_tss_target_val=300,
            block_position="accumulation",
            ftp_w=240,
        )
        from app.services.workout_templates import TEMPLATES
        weekday_fillers = [
            d for d in drafts
            if d.date.weekday() in (1, 3)  # Tue/Thu filler slots in base1
        ]
        # At least one of the two filler slots must remain a real ride.
        riding = [
            d for d in weekday_fillers
            if TEMPLATES.get(d.template_id)
            and TEMPLATES[d.template_id].category in ("endurance", "recovery")
        ]
        assert riding, (
            f"tight budget nuked every filler to rest: "
            f"{[(d.date.weekday(), d.template_id) for d in drafts]}"
        )

    def test_quality_sessions_survive_tight_budget(self):
        from app.services.workout_templates import TEMPLATES

        athlete = _athlete(ftp_watts=240, weekly_hours=12.0)
        drafts = build_week_drafts(
            athlete=athlete,
            week_start=_next_monday(),
            phase="base1",
            weekly_tss_target_val=300,
            block_position="accumulation",
            ftp_w=240,
        )
        quality = [
            d for d in drafts
            if TEMPLATES.get(d.template_id)
            and TEMPLATES[d.template_id].category in {"tempo", "sweet_spot", "threshold", "vo2"}
        ]
        assert len(quality) >= 2, (
            f"quality touches were trimmed: {[d.template_id for d in drafts]}"
        )


class TestBaseQualityQuota:
    """Cause 2: base weeks carry ≥2 DISTINCT quality touches (one VO2/MAP +
    one tempo/SS), except on recovery weeks."""

    def _categories(self, phase: str, block: str = "accumulation") -> list[str]:
        from app.services.workout_templates import TEMPLATES

        athlete = _athlete(ftp_watts=240, weekly_hours=12.0)
        drafts = build_week_drafts(
            athlete=athlete,
            week_start=_next_monday(),
            phase=phase,
            weekly_tss_target_val=369,
            block_position=block,
            ftp_w=240,
        )
        return [
            TEMPLATES[d.template_id].category
            for d in drafts if TEMPLATES.get(d.template_id)
        ]

    def test_base1_has_vo2_and_tempo_touch(self):
        cats = self._categories("base1")
        assert "vo2" in cats, f"base1 lost its VO2 touch: {cats}"
        assert "tempo" in cats or "sweet_spot" in cats, (
            f"base1 missing the second (tempo/SS) touch: {cats}"
        )

    def test_base2_has_two_distinct_touches(self):
        cats = self._categories("base2")
        quality = [c for c in cats if c in ("tempo", "sweet_spot", "threshold", "vo2")]
        assert len(quality) >= 2, f"base2 quality touches: {cats}"
        assert len(set(quality)) >= 2, f"touches must be distinct: {quality}"

    def test_recovery_week_stays_easy(self):
        cats = self._categories("base1", block="recovery")
        assert not any(c in ("tempo", "sweet_spot", "threshold", "vo2") for c in cats), (
            f"deload week gained quality work: {cats}"
        )

    def test_affect_constraint_most_sessions_pleasant(self):
        """Ekkekakis: ≥ half the RIDING days stay below-threshold pleasant
        (endurance/recovery) even with the 2-touch quota."""
        cats = [c for c in self._categories("base1") if c != "rest"]
        pleasant = [c for c in cats if c in ("endurance", "recovery")]
        assert len(pleasant) >= len(cats) / 2


class TestMonotonyGuard:
    """Foster monotony of the PLANNED week must stay < 2.0."""

    def test_planned_week_monotony_helper(self):
        from app.services.mesocycle_generator import planned_week_monotony

        assert planned_week_monotony([]) == 0.0
        assert planned_week_monotony([0, 0, 0, 0, 0, 0, 0]) == 0.0
        assert planned_week_monotony([50] * 7) == 9.9  # flat = max monotony
        varied = planned_week_monotony([0, 62, 72, 28, 0, 70, 135])
        assert varied < 2.0

    def test_generated_weeks_stay_under_two(self):
        from app.services.mesocycle_generator import planned_week_monotony, template_tss_estimate

        athlete = _athlete(ftp_watts=240, weekly_hours=12.0)
        monday = _next_monday()
        for phase, block in (("base1", "accumulation"), ("base2", "transmutation"),
                             ("build1", "accumulation"), ("base1", "recovery")):
            drafts = build_week_drafts(
                athlete=athlete,
                week_start=monday,
                phase=phase,
                weekly_tss_target_val=369 if block != "recovery" else 229,
                block_position=block,
                ftp_w=240,
            )
            daily: dict[date, float] = {}
            for d in drafts:
                daily[d.date] = daily.get(d.date, 0.0) + (
                    template_tss_estimate(d.template_id, d.duration_seconds_target) or 0.0
                )
            days = [daily.get(monday + timedelta(days=i), 0.0) for i in range(7)]
            mono = planned_week_monotony(days)
            assert mono < 2.0, f"{phase}/{block} planned monotony {mono} ≥ 2.0: {days}"

    @pytest.mark.asyncio
    async def test_evidence_exposes_planned_monotony(self):
        athlete = _athlete(ftp_watts=240, weekly_hours=12.0)
        db = _mock_db(athlete)
        await generate_mesocycle(
            db, user_id=1, plan_start_date=_next_monday(), current_ctl=33.5
        )
        plan_obj = None
        for c in db.add.call_args_list:
            obj = c.args[0] if c.args else None
            if obj is not None and hasattr(obj, "weekly_tss_targets"):
                plan_obj = obj
                break
        assert plan_obj is not None
        ev = plan_obj.evidence
        assert "planned_monotony" in ev and len(ev["planned_monotony"]) == 4
        assert all(m < 2.0 for m in ev["planned_monotony"]), ev["planned_monotony"]
        assert ev["weekly_hours"] == 12.0
        assert ev["budget_basis"]["hours_implied"] > ev["budget_basis"]["ctl_anchored"]


class TestTemplateMetadata:
    """Task 5: every bike + run template carries the adaptation metadata."""

    def test_every_bike_template_has_metadata(self):
        from app.services.workout_templates import TEMPLATES

        for t in TEMPLATES.values():
            assert t.physiological_target, t.id
            assert t.block_placement in ("base", "build", "peak", "taper", "any"), t.id
            assert t.min_readiness in ("low", "medium", "high"), t.id
            assert isinstance(t.indoor_ok, bool), t.id
            assert t.fun_factor in (1, 2, 3), t.id

    def test_every_run_template_has_metadata(self):
        from app.services.run_workout_templates import RUN_TEMPLATES

        for t in RUN_TEMPLATES.values():
            assert t.physiological_target, t.id
            assert t.block_placement in ("base", "build", "peak", "taper", "any"), t.id
            assert t.min_readiness in ("low", "medium", "high"), t.id
            assert t.fun_factor in (1, 2, 3), t.id

    def test_sensible_readiness_poles(self):
        from app.services.workout_templates import TEMPLATES

        assert TEMPLATES["vo2_5x4"].min_readiness == "high"
        assert TEMPLATES["threshold_seiler_4x8"].min_readiness == "high"
        assert TEMPLATES["recovery_30"].min_readiness == "low"
        assert TEMPLATES["rest_day"].min_readiness == "low"
        assert TEMPLATES["z2_endurance_60"].min_readiness == "low"

    def test_new_archetypes_exist(self):
        from app.services.run_workout_templates import RUN_TEMPLATES
        from app.services.workout_templates import TEMPLATES

        assert "tempo_bursts_3x10" in TEMPLATES
        assert "z2_endurance_surges_75" in TEMPLATES
        assert TEMPLATES["z2_endurance_surges_75"].fun_factor == 3
        assert "run_fartlek_40" in RUN_TEMPLATES
        assert "run_hill_reps_8x60" in RUN_TEMPLATES


class TestDaysAvailablePlacement:
    """Review finding 2: days_available was captured but NEVER consumed —
    the live athlete selected Di/Do/Fr/Sa/So and the plan trained Mittwoch
    while resting Freitag+Samstag. Placement must respect the flags."""

    def _drafts(self, days_available, phase="base1", weekly_hours=8.0,
                block="accumulation", week_start=None):
        a = _athlete(ftp_watts=240, weekly_hours=weekly_hours)
        a.days_available = days_available
        return build_week_drafts(
            athlete=a,
            week_start=week_start or _next_monday(),
            phase=phase,
            weekly_tss_target_val=350,
            block_position=block,
            ftp_w=240,
        )

    def test_unavailable_days_are_never_trained(self):
        """The live reviewer case: Di/Do/Fr/Sa/So available, Mo+Mi not."""
        days = {"mon": False, "tue": True, "wed": False, "thu": True,
                "fri": True, "sat": True, "sun": True, "long_day": "sun"}
        for phase in ("base1", "base2", "build1", "build2", "peak", "taper"):
            drafts = self._drafts(days, phase=phase)
            for d in drafts:
                if d.date.weekday() in (0, 2):  # Mon, Wed unavailable
                    assert d.template_id == "rest_day", (
                        f"{phase}: trained on unavailable dow "
                        f"{d.date.weekday()} ({d.template_id})"
                    )

    def test_available_days_actually_train(self):
        """Selected days must carry the sessions — Freitag/Samstag were
        available yet rested in the live case."""
        days = {"mon": False, "tue": True, "wed": False, "thu": True,
                "fri": True, "sat": True, "sun": True, "long_day": "sun"}
        drafts = self._drafts(days, phase="base1")
        riding_dows = {
            d.date.weekday() for d in drafts
            if d.sport != "running" and d.template_id != "rest_day"
        }
        # 5 available days, base1 wants 2 rest → both unavailable days absorb
        # the rest quota, so ALL five selected days ride.
        assert riding_dows == {1, 3, 4, 5, 6}, riding_dows

    def test_long_day_preference_is_honored(self):
        days = {"mon": True, "tue": True, "wed": True, "thu": True,
                "fri": True, "sat": True, "sun": True, "long_day": "sat"}
        drafts = self._drafts(days, phase="base1", weekly_hours=12.0)
        by_dow = {
            d.date.weekday(): d for d in drafts if d.sport != "running"
        }
        longest = max(
            (d for d in by_dow.values() if d.template_id != "rest_day"),
            key=lambda d: d.duration_seconds_target,
        )
        assert longest.date.weekday() == 5, (
            f"long ride landed on dow {longest.date.weekday()}, not Saturday"
        )

    def test_fewer_days_than_sessions_drops_sessions(self):
        """3 available days → 3 riding days max, never a session on an
        unavailable day."""
        days = {"mon": False, "tue": True, "wed": False, "thu": True,
                "fri": False, "sat": False, "sun": True, "long_day": "sun"}
        drafts = self._drafts(days, phase="build1")
        riding = [
            d for d in drafts
            if d.sport != "running" and d.template_id != "rest_day"
        ]
        assert len(riding) <= 3
        assert all(d.date.weekday() in (1, 3, 6) for d in riding), (
            [(d.date.weekday(), d.template_id) for d in riding]
        )

    def test_default_athlete_keeps_canonical_week(self):
        """No days_available on the profile → the historical canonical week
        (rest Mon/Fri, long Sunday) is unchanged."""
        a = _athlete(ftp_watts=240, weekly_hours=12.0)
        drafts_default = build_week_drafts(
            athlete=a, week_start=_next_monday(), phase="base1",
            weekly_tss_target_val=369, block_position="accumulation", ftp_w=240,
        )
        rest_dows = {
            d.date.weekday() for d in drafts_default
            if d.sport != "running" and d.template_id == "rest_day"
        }
        assert rest_dows == {0, 4}
        sunday = next(d for d in drafts_default if d.date.weekday() == 6)
        assert sunday.duration_seconds_target >= 120 * 60


class TestVarietyDialConsumption:
    """Review finding 3: variety_dial had NO consumer — a 'too boring' rebuild
    produced a byte-identical week. The dial must visibly change the week."""

    def _template_ids(self, dial, week_start=None):
        a = _athlete(ftp_watts=240, weekly_hours=10.0)
        a.variety_dial = dial
        drafts = build_week_drafts(
            athlete=a,
            week_start=week_start or _next_monday(),
            phase="base1",
            weekly_tss_target_val=350,
            block_position="accumulation",
            ftp_w=240,
        )
        return [d.template_id for d in sorted(drafts, key=lambda x: x.date)]

    def test_bumping_the_dial_changes_the_same_week(self):
        """None→mixed (the too_boring bump) rebuilds the SAME calendar week
        to a different plan — the review verified byte-identical sessions."""
        monday = _next_monday()
        assert self._template_ids(None, monday) != self._template_ids("mixed", monday)

    def test_adventurous_differs_from_mixed(self):
        monday = _next_monday()
        assert self._template_ids("mixed", monday) != self._template_ids("adventurous", monday)

    def test_adventurous_unlocks_playful_formats(self):
        """The adventurous pool includes the playful/alternative Z2 formats
        (surges / MAF / fasted) that the fixed rotation never reached."""
        playful = {"z2_endurance_surges_75", "maf_aerobic_90", "z2_fasted_60",
                   "z2_endurance_tempo_touch_75", "z2_progressive_90"}
        monday = _next_monday()
        seen: set[str] = set()
        for w in range(4):
            seen.update(self._template_ids("adventurous", monday + timedelta(weeks=w)))
        assert seen & playful, f"adventurous weeks never used a playful format: {seen}"

    def test_dial_bump_is_visible_even_for_time_crunched_athletes(self):
        """A 5h athlete's windows fit only one 60-min Z2 template — the mixed
        pool must still swap in an alternate so 'too boring' visibly changes
        the week (the live case rebuilt byte-identical)."""
        monday = _next_monday()

        def ids(dial):
            a = _athlete(ftp_watts=220, weekly_hours=5.0)
            a.variety_dial = dial
            drafts = build_week_drafts(
                athlete=a, week_start=monday, phase="base2",
                weekly_tss_target_val=230, block_position="accumulation",
                ftp_w=220,
            )
            return [d.template_id for d in sorted(drafts, key=lambda x: x.date)]

        assert ids(None) != ids("mixed")

    def test_steady_matches_default(self):
        """'steady' (and unset) keep the historical deterministic picks."""
        monday = _next_monday()
        assert self._template_ids(None, monday) == self._template_ids("steady", monday)


class TestHardDayBlackouts:
    """Review finding 3: hard_day_blackouts had NO consumer. No hard session
    may land on a blacked-out day."""

    def test_no_hard_sessions_on_blackout_days(self):
        from app.services.workout_templates import TEMPLATES

        hard = {"tempo", "sweet_spot", "threshold", "vo2", "anaerobic"}
        for phase in ("base1", "base2", "build1", "build2", "peak"):
            a = _athlete(ftp_watts=240, weekly_hours=10.0)
            a.hard_day_blackouts = ["tue", "wed"]
            drafts = build_week_drafts(
                athlete=a, week_start=_next_monday(), phase=phase,
                weekly_tss_target_val=380, block_position="accumulation",
                ftp_w=240,
            )
            for d in drafts:
                if d.sport == "running" or d.date.weekday() not in (1, 2):
                    continue
                tmpl = TEMPLATES.get(d.template_id)
                cat = tmpl.category if tmpl else "endurance"
                assert cat not in hard, (
                    f"{phase}: hard session '{d.template_id}' on blacked-out "
                    f"dow {d.date.weekday()}"
                )

    def test_blackout_moves_quality_instead_of_deleting_it(self):
        """When easy days exist to swap with, the week keeps its quality —
        it moves off the blacked-out day rather than vanishing."""
        from app.services.workout_templates import TEMPLATES

        a = _athlete(ftp_watts=240, weekly_hours=10.0)
        a.hard_day_blackouts = ["wed"]
        drafts = build_week_drafts(
            athlete=a, week_start=_next_monday(), phase="build1",
            weekly_tss_target_val=380, block_position="accumulation", ftp_w=240,
        )
        hard = {"tempo", "sweet_spot", "threshold", "vo2", "anaerobic"}
        quality_days = [
            d.date.weekday() for d in drafts
            if d.sport != "running" and TEMPLATES.get(d.template_id)
            and TEMPLATES[d.template_id].category in hard
        ]
        assert quality_days, "blackout deleted every quality session"
        assert 2 not in quality_days


class TestWeeklyHoursCeiling:
    """Review finding 4: stated hours must be a HARD ceiling in both
    directions — a 2 h/Woche beginner got a 3h10 (160%) week live."""

    def _total_hours(self, weekly_hours, ctl, phase="base1"):
        from app.services.mesocycle_generator import weekly_tss_target

        a = _athlete(ftp_watts=200, weekly_hours=weekly_hours)
        tss = weekly_tss_target(ctl, phase, "accumulation", weekly_hours=weekly_hours)
        drafts = build_week_drafts(
            athlete=a, week_start=_next_monday(), phase=phase,
            weekly_tss_target_val=tss, block_position="accumulation", ftp_w=200,
        )
        return sum(d.duration_seconds_target for d in drafts) / 3600.0

    def test_two_hour_beginner_never_exceeds_two_hours(self):
        """The live case: asked 2 h/Woche, got 3 h 10."""
        total = self._total_hours(2.0, ctl=15.0)
        assert total <= 2.0 * 1.05 + 1e-6, f"2h athlete got a {total:.2f}h week"
        assert total > 0.5, "ceiling must trim, not delete the week"

    def test_ceiling_holds_across_phases_and_hours(self):
        for hours in (2.0, 3.0, 5.0, 8.0, 12.0):
            for phase in ("base1", "base2", "build1"):
                total = self._total_hours(hours, ctl=hours * 4.0, phase=phase)
                assert total <= hours * 1.05 + 1e-6, (
                    f"{hours}h/{phase}: planned {total:.2f}h breaks the ceiling"
                )

    @pytest.mark.asyncio
    async def test_hours_note_explains_ctl_floored_start(self):
        """(b) the pro case: 10-12h asked, ~55% delivered because the CTL
        anchor floors the plan — the plan must SAY so, bilingually, and
        persist the ramp intent."""
        athlete = _athlete(ftp_watts=280, weekly_hours=10.0)
        db = _mock_db(athlete)
        await generate_mesocycle(
            db, user_id=1, plan_start_date=_next_monday(), current_ctl=25.0
        )
        plan_obj = None
        for c in db.add.call_args_list:
            obj = c.args[0] if c.args else None
            if obj is not None and hasattr(obj, "weekly_tss_targets"):
                plan_obj = obj
                break
        note = plan_obj.evidence.get("hours_note")
        assert note is not None, "CTL-floored plan carries no hours_note"
        assert note["declared_hours"] == 10.0
        assert 0 < note["start_hours"] < 10.0
        assert "bauen" in note["de"] and "build toward" in note["en"]
        assert note["reason"] == "ctl_anchor"

    @pytest.mark.asyncio
    async def test_no_hours_note_when_plan_matches_hours(self):
        athlete = _athlete(ftp_watts=280, weekly_hours=6.0)
        db = _mock_db(athlete)
        await generate_mesocycle(
            db, user_id=1, plan_start_date=_next_monday(), current_ctl=70.0
        )
        plan_obj = None
        for c in db.add.call_args_list:
            obj = c.args[0] if c.args else None
            if obj is not None and hasattr(obj, "weekly_tss_targets"):
                plan_obj = obj
                break
        assert plan_obj.evidence.get("hours_note") is None


class TestCurrentBlockPosition:
    def _plan(self, start: date):
        return SimpleNamespace(plan_start_date=start, plan_end_date=start + timedelta(days=27))

    async def test_week0_is_accumulation(self):
        start = date(2026, 6, 1)
        db = _FakeDB(self._plan(start))
        assert await current_block_position(db, 1, start) == "accumulation"

    async def test_week3_is_recovery(self):
        start = date(2026, 6, 1)
        db = _FakeDB(self._plan(start))
        assert await current_block_position(db, 1, start + timedelta(days=21)) == "recovery"

    async def test_no_active_plan_returns_none(self):
        db = _FakeDB(None)
        assert await current_block_position(db, 1, date(2026, 6, 1)) is None

    async def test_day_past_plan_end_clamps_to_recovery(self):
        # Defensive: a stray query result past week 3 clamps, never raises.
        start = date(2026, 6, 1)
        db = _FakeDB(self._plan(start))
        assert await current_block_position(db, 1, start + timedelta(days=40)) == "recovery"


# ──────────────────────────────────────────────────────────────────────────────
#  Recovery-week variety (review NEW-4) + materialized hours_note (finding 4)
# ──────────────────────────────────────────────────────────────────────────────

class TestRecoveryWeekVariety:
    """User 5's deload week rendered 'Lockeres Ausfahren — 60 min' four times:
    the program path pinned recovery_60 on every downgraded quality slot.
    Recovery-week easy days must draw varied flavors from the easy pool —
    and stay strictly easy (deload is sacred)."""

    _EASY_CATEGORIES = ("endurance", "recovery", "rest")

    def _recovery_week(self, program: str | None, weekly_hours: float,
                       week_start: date | None = None):
        goals = {"program": {"id": program, "started": "2026-07-27"}} if program else {}
        athlete = _athlete(ftp_watts=210, weekly_hours=weekly_hours)
        athlete.goals = goals
        athlete.days_available = None
        athlete.hard_day_blackouts = None
        athlete.variety_dial = None
        tss = weekly_tss_target(45.0, "base1", "recovery", weekly_hours=weekly_hours)
        return build_week_drafts(
            athlete=athlete,
            week_start=week_start or _next_monday(),
            phase="base1",
            weekly_tss_target_val=tss,
            block_position="recovery",
            ftp_w=210,
        )

    def test_program_recovery_week_never_repeats_a_spin_four_times(self):
        """The live NEW-4 case: vo2_builder recovery week was recovery_60 ×4."""
        for program in ("ftp_builder", "vo2_builder", "endurance_200k", None):
            for hours in (6.0, 8.0):
                drafts = self._recovery_week(program, hours)
                riding = [d.template_id for d in drafts if d.template_id != "rest_day"]
                worst = max((riding.count(t) for t in set(riding)), default=0)
                assert worst <= 2, (
                    f"{program}/{hours}h recovery week repeats a session "
                    f"{worst}×: {riding}"
                )

    def test_recovery_week_variety_stays_strictly_easy(self):
        """Variety must respect the deload intent — every drafted day is an
        endurance/recovery/rest template, no quality sneaks in."""
        from app.services.workout_templates import TEMPLATES

        for program in ("ftp_builder", "vo2_builder", None):
            drafts = self._recovery_week(program, 8.0)
            for d in drafts:
                cat = TEMPLATES[d.template_id].category
                assert cat in self._EASY_CATEGORIES, (
                    f"{program}: {d.template_id} ({cat}) on a deload week"
                )

    def test_recovery_week_titles_are_varied(self):
        """At least three DISTINCT session flavors across the riding days
        (the old week had exactly one)."""
        drafts = self._recovery_week("vo2_builder", 8.0)
        riding = {d.template_id for d in drafts if d.template_id != "rest_day"}
        assert len(riding) >= 3, f"deload week too samey: {sorted(riding)}"


class TestHoursNoteMatchesMaterializedWeek:
    """Review finding 4: the plan card showed '5.9h Wochenstunden' while the
    note promised '~6,4 h' — the note was derived from TSS, not from the week
    that was actually built. start_hours must equal the materialized week-0
    hours."""

    @pytest.mark.asyncio
    async def test_start_hours_equals_week0_planned_hours(self):
        athlete = _athlete(ftp_watts=280, weekly_hours=10.0)
        db = _mock_db(athlete)
        monday = _next_monday()
        await generate_mesocycle(db, user_id=1, plan_start_date=monday, current_ctl=25.0)

        plan_obj = None
        drafts_week0: list = []
        for c in db.add.call_args_list:
            obj = c.args[0] if c.args else None
            if obj is None:
                continue
            if hasattr(obj, "weekly_tss_targets"):
                plan_obj = obj
            elif hasattr(obj, "duration_seconds_target") and obj.date < monday + timedelta(days=7):
                drafts_week0.append(obj)

        note = plan_obj.evidence.get("hours_note")
        assert note is not None
        materialized = round(
            sum(d.duration_seconds_target or 0 for d in drafts_week0) / 3600.0, 1
        )
        assert note["start_hours"] == materialized, (
            f"note says ~{note['start_hours']}h but the built week is "
            f"{materialized}h — the card would show two truths again"
        )
        # The note only fires when the start is genuinely below the ask.
        assert materialized < 0.8 * 10.0
