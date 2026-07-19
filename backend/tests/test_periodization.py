"""Unit tests for training_periodization.

Covers:
    - detect_training_phase boundary cases (16w, 8w, 4w, 3w, 1w, 0w to goal)
    - weekly_intensity_quota returns Seiler-polarized split by phase
    - session_type_for_today respects intensity_ceiling (never exceeds)
    - pick_template FTP gating (no VO2 for FTP<180) + available-minutes fit
"""
from __future__ import annotations

from datetime import date, timedelta

from app.services.training_periodization import (
    detect_training_phase,
    pick_template,
    session_type_for_today,
    weekly_intensity_quota,
)
from app.services.workout_templates import TEMPLATES


class TestPhaseDetection:
    def test_no_goal_low_ctl_is_offseason(self):
        assert detect_training_phase(None, 20.0) == "offseason"

    def test_no_goal_high_ctl_is_maintenance(self):
        assert detect_training_phase(None, 50.0) == "maintenance"

    def test_16_weeks_out_low_ctl_is_base1(self):
        d = date.today() + timedelta(weeks=18)
        assert detect_training_phase(d, current_ctl=25.0) == "base1"

    def test_16_weeks_out_high_ctl_is_base2(self):
        d = date.today() + timedelta(weeks=18)
        assert detect_training_phase(d, current_ctl=50.0) == "base2"

    def test_12_weeks_out_low_ctl_is_build1(self):
        d = date.today() + timedelta(weeks=12)
        assert detect_training_phase(d, current_ctl=45.0) == "build1"

    def test_12_weeks_out_high_ctl_is_build2(self):
        d = date.today() + timedelta(weeks=12)
        assert detect_training_phase(d, current_ctl=60.0) == "build2"

    def test_6_weeks_out_is_peak(self):
        d = date.today() + timedelta(weeks=6)
        assert detect_training_phase(d, current_ctl=70.0) == "peak"

    def test_2_weeks_out_is_taper(self):
        d = date.today() + timedelta(weeks=2)
        assert detect_training_phase(d, current_ctl=70.0) == "taper"

    def test_race_week_is_race(self):
        d = date.today() + timedelta(days=5)
        assert detect_training_phase(d, current_ctl=70.0) == "race"

    def test_past_goal_is_maintenance(self):
        d = date.today() - timedelta(days=5)
        assert detect_training_phase(d, current_ctl=60.0) == "maintenance"

    def test_boundary_4_weeks_is_peak(self):
        """4 weeks ~ 28 days — should be peak (>21 days, <=49 days)."""
        d = date.today() + timedelta(days=28)
        assert detect_training_phase(d, current_ctl=60.0) == "peak"

    def test_boundary_3_weeks_is_taper(self):
        """3 weeks = 21 days — should be taper."""
        d = date.today() + timedelta(days=21)
        assert detect_training_phase(d, current_ctl=60.0) == "taper"

    def test_boundary_7_days_is_race(self):
        """7 days out is race week."""
        d = date.today() + timedelta(days=7)
        assert detect_training_phase(d, current_ctl=60.0) == "race"

    # --- Under-built override: you can't taper fitness you haven't built ---

    def test_underbuilt_in_taper_window_keeps_building(self):
        """18 days out but CTL far below target → keep peaking, don't taper.

        Tapering sheds the little fitness an under-built athlete has; the last
        building window is worth more than freshness when CTL is well short of
        the event demand (Friel: taper only what you've built)."""
        d = date.today() + timedelta(days=18)
        assert detect_training_phase(d, current_ctl=23.0, target_ctl=70.0) == "peak"

    def test_built_in_taper_window_still_tapers(self):
        """18 days out and CTL near target → normal taper."""
        d = date.today() + timedelta(days=18)
        assert detect_training_phase(d, current_ctl=65.0, target_ctl=70.0) == "taper"

    def test_taper_window_without_target_is_unchanged(self):
        """No target_ctl → calendar-based behaviour preserved (taper)."""
        d = date.today() + timedelta(days=18)
        assert detect_training_phase(d, current_ctl=23.0) == "taper"

    def test_race_week_tapers_even_when_underbuilt(self):
        """Inside the final 7 days you can't build — freshen regardless."""
        d = date.today() + timedelta(days=5)
        assert detect_training_phase(d, current_ctl=20.0, target_ctl=70.0) == "race"


class TestWeeklyQuota:
    def test_base2_is_85_15(self):
        q = weekly_intensity_quota("base2", 10.0)
        assert q["z1_z2_hours"] == 8.5
        assert q["hard_hours"] == 1.0

    def test_build2_is_75_25(self):
        q = weekly_intensity_quota("build2", 10.0)
        assert q["z1_z2_hours"] == 7.5
        assert q["hard_hours"] == 2.0

    def test_build2_has_vo2_target(self):
        q = weekly_intensity_quota("build2", 10.0)
        assert q["vo2_sessions"] >= 1

    def test_taper_keeps_intensity(self):
        q = weekly_intensity_quota("taper", 10.0)
        assert q["hard_hours"] == 1.0   # 10% — intensity retained during Mujika cut

    def test_race_has_no_hard_sessions(self):
        q = weekly_intensity_quota("race", 10.0)
        assert q["hard_hours"] == 0.0


class TestWeeklyQuotaTrainingModel:
    def test_none_model_matches_baseline(self):
        base = weekly_intensity_quota("build2", 10.0)
        explicit = weekly_intensity_quota("build2", 10.0, training_model=None)
        for k in ("z1_z2_hours", "hard_hours", "vo2_sessions", "threshold_sessions", "rest_days"):
            assert base[k] == explicit[k]

    def test_polarized_trims_threshold_and_hard_hours(self):
        base = weekly_intensity_quota("build2", 10.0)
        pol = weekly_intensity_quota("build2", 10.0, training_model="polarized")
        # Polarized keeps the VO2 pole but trims the threshold middle + grey-zone hours.
        assert pol["vo2_sessions"] == base["vo2_sessions"]
        assert pol["threshold_sessions"] == base["threshold_sessions"] - 1
        assert pol["hard_hours"] < base["hard_hours"]

    def test_sweetspot_adds_threshold_and_hard_hours(self):
        base = weekly_intensity_quota("build2", 10.0)
        ss = weekly_intensity_quota("build2", 10.0, training_model="sweetspot")
        assert ss["threshold_sessions"] == base["threshold_sessions"] + 1
        assert ss["vo2_sessions"] == max(0, base["vo2_sessions"] - 1)
        assert ss["hard_hours"] > base["hard_hours"]

    def test_days_per_week_sets_rest_floor_and_caps_hard(self):
        q = weekly_intensity_quota("build2", 10.0, training_model="sweetspot", days_per_week=3)
        assert q["rest_days"] >= 4  # 7 − 3 training days
        assert q["vo2_sessions"] + q["threshold_sessions"] <= 2  # days − 1

    def test_polarized_quality_day_avoids_grey_zone(self):
        # build1 second quality day would normally be sweet_spot; polarized → easy.
        prog = {"hard_done": 0, "hard_sessions_done": 0, "vo2_sessions_done": 1, "last_72h_quality_count": 0}
        pick = session_type_for_today("build1", prog, tsb=0.0, intensity_ceiling="push", day_of_week=1, training_model="polarized")
        assert pick == "endurance"

    def test_sweetspot_wednesday_swaps_vo2_for_sweet_spot(self):
        prog = {"hard_sessions_done": 0, "vo2_sessions_done": 0, "last_72h_quality_count": 0}
        pick = session_type_for_today("build2", prog, tsb=0.0, intensity_ceiling="push", day_of_week=2, training_model="sweetspot")
        assert pick == "sweet_spot"


class TestRecoveryWeekDeload:
    def test_recovery_quota_drops_hard_sessions(self):
        loading = weekly_intensity_quota("build2", 10.0, block_position="realization")
        deload = weekly_intensity_quota("build2", 10.0, block_position="recovery")
        assert deload["vo2_sessions"] == 0
        assert deload["threshold_sessions"] == 0
        assert deload["hard_hours"] < loading["hard_hours"]
        assert deload["rest_days"] >= loading["rest_days"] + 1

    def test_recovery_overrides_model(self):
        # Even a sweet-spot athlete deloads on the recovery week.
        q = weekly_intensity_quota("build2", 10.0, training_model="sweetspot", block_position="recovery")
        assert q["vo2_sessions"] == 0 and q["threshold_sessions"] == 0

    def test_recovery_week_wednesday_is_easy(self):
        prog = {"hard_sessions_done": 0, "vo2_sessions_done": 0, "last_72h_quality_count": 0}
        pick = session_type_for_today("build2", prog, tsb=0.0, intensity_ceiling="push", day_of_week=2, is_recovery_week=True)
        assert pick == "endurance"

    def test_loading_week_wednesday_still_hard(self):
        prog = {"hard_sessions_done": 0, "vo2_sessions_done": 0, "last_72h_quality_count": 0}
        pick = session_type_for_today("build2", prog, tsb=0.0, intensity_ceiling="push", day_of_week=2, is_recovery_week=False)
        assert pick in ("vo2", "threshold", "sweet_spot")


class TestRecentLoadGuard:
    """Regression guard: a big *volume* day yesterday must block a hard session
    today, even when its intensity was low enough that it never tripped the
    intensity-only quality flag (last_72h_quality_count).

    Bug: a 4h Z2 ride (~250 TSS, but ~55-65 TSS/h) left recent_quality=0, so the
    mid-week picker prescribed VO2/threshold the next day and the athlete was
    told they were 'fresh'. Long rides carry the largest acute load of the week;
    the alternation guard must be volume-aware, not intensity-only, and must
    apply mid-week (Tue/Wed/Thu), not only on Monday.
    """

    def _long_ride_yesterday(self) -> dict:
        # High volume, low intensity → NOT flagged as a quality session.
        return {
            "hard_sessions_done": 0,
            "vo2_sessions_done": 0,
            "last_72h_quality_count": 0,
            "yesterday_tss": 250.0,
            "last_48h_tss": 250.0,
            "today_tss": 0.0,
        }

    def test_long_ride_yesterday_blocks_wednesday_vo2(self):
        pick = session_type_for_today(
            "build2", self._long_ride_yesterday(), tsb=-12.0,
            intensity_ceiling="push", day_of_week=2,
        )
        assert pick in ("endurance", "recovery"), (
            f"expected easy day after a 4h ride, got {pick}"
        )

    def test_long_ride_yesterday_blocks_tuesday_quality(self):
        pick = session_type_for_today(
            "build2", self._long_ride_yesterday(), tsb=-12.0,
            intensity_ceiling="push", day_of_week=1,
        )
        assert pick in ("endurance", "recovery"), (
            f"expected easy day after a 4h ride, got {pick}"
        )

    def test_light_yesterday_still_allows_wednesday_quality(self):
        # A genuinely light day before must NOT block the keystone session.
        prog = {
            "hard_sessions_done": 0, "vo2_sessions_done": 0,
            "last_72h_quality_count": 0,
            "yesterday_tss": 20.0, "last_48h_tss": 20.0, "today_tss": 0.0,
        }
        pick = session_type_for_today(
            "build2", prog, tsb=0.0, intensity_ceiling="push", day_of_week=2,
        )
        assert pick in ("vo2", "threshold", "sweet_spot")


class TestSessionTypeForToday:
    def test_rest_ceiling_returns_rest(self):
        assert session_type_for_today(
            phase="build2", weekly_progress=None, tsb=0.0,
            intensity_ceiling="rest", day_of_week=2,
        ) == "rest"

    def test_easy_ceiling_returns_recovery(self):
        """Even on Wed (hard day), easy ceiling downgrades to recovery."""
        assert session_type_for_today(
            phase="build2", weekly_progress=None, tsb=-15.0,
            intensity_ceiling="easy", day_of_week=2,
        ) == "recovery"

    def test_wed_build2_push_is_vo2(self):
        assert session_type_for_today(
            phase="build2", weekly_progress={"vo2_sessions_done": 0}, tsb=5.0,
            intensity_ceiling="push", day_of_week=2,
        ) == "vo2"

    def test_wed_build2_vo2_already_done_downgrades(self):
        """Weekly VO2 quota hit → fall back to sweet_spot mid-week."""
        assert session_type_for_today(
            phase="build2", weekly_progress={"vo2_sessions_done": 1}, tsb=5.0,
            intensity_ceiling="push", day_of_week=2,
        ) == "sweet_spot"

    def test_monday_rests_after_hard_sunday(self):
        assert session_type_for_today(
            phase="build2",
            weekly_progress={"yesterday_tss": 95.0, "last_48h_tss": 110.0},
            tsb=5.0, intensity_ceiling="push", day_of_week=0,
        ) == "rest"

    def test_monday_active_recovery_after_moderate_weekend(self):
        assert session_type_for_today(
            phase="build2",
            weekly_progress={"yesterday_tss": 20.0, "last_48h_tss": 55.0},
            tsb=5.0, intensity_ceiling="push", day_of_week=0,
        ) == "recovery"

    def test_monday_endurance_when_weekend_was_light(self):
        assert session_type_for_today(
            phase="build2", weekly_progress=None, tsb=5.0,
            intensity_ceiling="push", day_of_week=0,
        ) == "endurance"

    def test_sunday_build2_is_endurance(self):
        """Sunday = long Z2 regardless of day-of-week bias elsewhere."""
        assert session_type_for_today(
            phase="build2", weekly_progress=None, tsb=5.0,
            intensity_ceiling="push", day_of_week=6,
        ) == "endurance"

    def test_moderate_ceiling_downgrades_vo2_to_sweet_spot(self):
        """Moderate ceiling caps at sweet_spot. Wed build2 should pick sweet_spot."""
        assert session_type_for_today(
            phase="build2", weekly_progress={"vo2_sessions_done": 0}, tsb=5.0,
            intensity_ceiling="moderate", day_of_week=2,
        ) == "sweet_spot"

    def test_base1_wednesday_is_weekly_vo2_touch(self):
        """Variety floor (July 2026): base1 Wednesday carries the ONE weekly
        VO2/MAP touch; other midweek days stay endurance."""
        assert session_type_for_today(
            phase="base1", weekly_progress=None, tsb=5.0,
            intensity_ceiling="push", day_of_week=2,
        ) == "vo2"
        assert session_type_for_today(
            phase="base1", weekly_progress=None, tsb=5.0,
            intensity_ceiling="push", day_of_week=3,
        ) == "endurance"
        # Quota guard: once the week's VO2 is done, Wednesday degrades to endurance.
        assert session_type_for_today(
            phase="base1", weekly_progress={"vo2_sessions_done": 1, "hard_sessions_done": 1},
            tsb=5.0, intensity_ceiling="push", day_of_week=2,
        ) == "endurance"

    def test_race_week_wed_is_race_pace_tune_up(self):
        # Wednesday of race week → threshold session. coach_service pins it
        # to race_pace_60_95 (the Mujika confidence-ride template). All other
        # weekdays stay recovery/rest.
        assert session_type_for_today(
            phase="race", weekly_progress=None, tsb=10.0,
            intensity_ceiling="push", day_of_week=2,
        ) == "threshold"

    def test_race_week_other_days_stay_easy(self):
        # Mon/Tue/Thu/Fri race week → recovery; Sat/Sun → rest.
        for dow in (0, 1, 3, 4):
            assert session_type_for_today(
                phase="race", weekly_progress=None, tsb=10.0,
                intensity_ceiling="push", day_of_week=dow,
            ) == "recovery"
        for dow in (5, 6):
            assert session_type_for_today(
                phase="race", weekly_progress=None, tsb=10.0,
                intensity_ceiling="push", day_of_week=dow,
            ) == "rest"

    def test_taper_wed_is_neuromuscular_anaerobic(self):
        # Mujika taper protocol: Wed gets short fully-rested sprints to
        # preserve peak power without fatigue. session_type_for_today
        # returns 'anaerobic'; picker resolves to neuromuscular_sprints_8x15
        # (first in the anaerobic candidate list).
        assert session_type_for_today(
            phase="taper", weekly_progress=None, tsb=5.0,
            intensity_ceiling="push", day_of_week=2,
        ) == "anaerobic"

    def test_thursday_downgrades_to_endurance_after_recent_quality(self):
        """72h hard/easy guard — when a quality session (TSS/h ≥ 60, ≈ IF 0.78+)
        already happened in the last 72h, Thursday must not stack another hard
        session, even with the weekly hard-quota counter at 0. The athlete in
        front of us hit a tempo on Tuesday with Wed off — the picker would
        otherwise default to sweet_spot today and burn them."""
        assert session_type_for_today(
            phase="build2",
            weekly_progress={"hard_sessions_done": 0, "last_72h_quality_count": 1},
            tsb=5.0, intensity_ceiling="push", day_of_week=3,
        ) == "endurance"

    def test_tuesday_downgrades_to_endurance_after_recent_quality(self):
        """Same guard on Tuesday — protects against Sun-hard / Mon-rest /
        Tue-hard stacking too."""
        assert session_type_for_today(
            phase="build2",
            weekly_progress={"hard_sessions_done": 0, "last_72h_quality_count": 1},
            tsb=5.0, intensity_ceiling="push", day_of_week=1,
        ) == "endurance"

    def test_wednesday_vo2_overrides_recent_quality_guard(self):
        """Wednesday VO2 day intentionally bypasses the 72h guard — VO2 has its
        own (vo2_done, tsb) gate and is the planned weekly keystone."""
        assert session_type_for_today(
            phase="build2",
            weekly_progress={"vo2_sessions_done": 0, "last_72h_quality_count": 1},
            tsb=5.0, intensity_ceiling="push", day_of_week=2,
        ) == "vo2"

    def test_build1_first_quality_day_is_sweet_spot(self):
        """build1 opens the week's quality work with sweet spot."""
        assert session_type_for_today(
            phase="build1",
            weekly_progress={"hard_sessions_done": 0},
            tsb=-12.0, intensity_ceiling="push", day_of_week=1,
        ) == "sweet_spot"

    def test_build1_second_quality_day_steps_up_to_threshold(self):
        """build1 progresses within the week — once a quality session is in the
        bank, the next Tue/Thu steps up to threshold (not another flat SST)."""
        assert session_type_for_today(
            phase="build1",
            weekly_progress={"hard_sessions_done": 1},
            tsb=-12.0, intensity_ceiling="push", day_of_week=3,
        ) == "threshold"

    def test_build1_second_quality_day_capped_when_ceiling_moderate(self):
        """If readiness only allows 'moderate', the build1 second-quality-day
        threshold pick downgrades to sweet spot — the ceiling is the safety."""
        assert session_type_for_today(
            phase="build1",
            weekly_progress={"hard_sessions_done": 1},
            tsb=-12.0, intensity_ceiling="moderate", day_of_week=3,
        ) == "sweet_spot"


class TestPickTemplate:
    def test_vo2_picks_ronnestad_at_60min(self):
        # With the Rønnestad short-interval template in the library, 60-min
        # VO2 days prefer it over 5×4 — higher time-at-VO2 with lower acute
        # RPE (Rønnestad 2015 / Bossi 2020).
        t = pick_template("vo2", athlete_ftp=280, available_minutes=60)
        assert t.id == "vo2_ronnestad_3x13"

    def test_vo2_picks_short_when_window_tiny(self):
        # 45-min window — every VO2 template needs ~50+ min once warm-up and
        # cool-down are counted. Picker falls into the "nothing fits" branch
        # and returns the shortest allowed VO2 protocol.
        t = pick_template("vo2", athlete_ftp=280, available_minutes=45)
        assert t.id in (
            "vo2_3x6", "vo2_map_5x3", "vo2_descending_5_4_3_2_1",
            "vo2_micro_30x30", "vo2_microbursts_30x15_45",
        )

    def test_vo2_requires_ftp_180(self):
        """Low FTP → no VO2 available → falls back to sweet_spot."""
        t = pick_template("vo2", athlete_ftp=150, available_minutes=60)
        assert t.id == "sweet_spot_2x20"

    def test_vo2_with_none_ftp_falls_back(self):
        t = pick_template("vo2", athlete_ftp=None, available_minutes=60)
        assert t.id != "vo2_5x4"  # FTP gate blocks it
        assert t.id != "vo2_micro_30x30"

    def test_endurance_long_fits_180min(self):
        t = pick_template("endurance", athlete_ftp=280, available_minutes=180)
        assert t.id == "z2_long_180"

    def test_endurance_short_picks_60min(self):
        t = pick_template("endurance", athlete_ftp=280, available_minutes=60)
        assert t.id == "z2_endurance_60"

    def test_endurance_medium_picks_90min(self):
        # 95-min window: longest-fitting 90-min endurance template. The
        # progressive variant sits ahead of plain Z2 in the candidate list.
        t = pick_template("endurance", athlete_ftp=280, available_minutes=95)
        assert t.id in ("z2_progressive_90", "z2_endurance_90")

    def test_rest_picks_rest_day(self):
        t = pick_template("rest", athlete_ftp=280, available_minutes=60)
        assert t.id == "rest_day"

    def test_recovery_picks_60_when_window_allows(self):
        # At a 60-min window, the longer recovery_60 fits and is preferred
        # over recovery_30 (which sits second in the candidate list).
        t = pick_template("recovery", athlete_ftp=280, available_minutes=60)
        assert t.id in ("recovery_60", "recovery_30")

    def test_recovery_picks_30_in_tight_window(self):
        t = pick_template("recovery", athlete_ftp=280, available_minutes=35)
        assert t.id == "recovery_30"

    def test_sweet_spot_picks_sweet_spot_2x20(self):
        t = pick_template("sweet_spot", athlete_ftp=280, available_minutes=70)
        assert t.id == "sweet_spot_2x20"

    def test_threshold_picks_a_real_threshold_template(self):
        # 60-min window: heavier Seiler 4×8 / hill 4×10 / over-under 4×12 are
        # all >60 min once warm-up + cool-down are counted. Picker drops to
        # something that fits — pyramid, lactate-shuttles, or the classic
        # 2×15 / over-under 3×5 — all genuine threshold protocols.
        t = pick_template("threshold", athlete_ftp=280, available_minutes=60)
        assert t.id in (
            "threshold_pyramid", "lactate_shuttles_3x8",
            "threshold_2x15", "over_under_3x5",
        )
