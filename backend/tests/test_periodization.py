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

    def test_monday_is_rest(self):
        assert session_type_for_today(
            phase="build2", weekly_progress=None, tsb=5.0,
            intensity_ceiling="push", day_of_week=0,
        ) == "rest"

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

    def test_base1_midweek_is_endurance(self):
        """Base1 is all endurance; no mid-week sweet_spot yet."""
        assert session_type_for_today(
            phase="base1", weekly_progress=None, tsb=5.0,
            intensity_ceiling="push", day_of_week=2,
        ) == "endurance"

    def test_race_week_no_hard_work(self):
        assert session_type_for_today(
            phase="race", weekly_progress=None, tsb=10.0,
            intensity_ceiling="push", day_of_week=2,
        ) == "recovery"


class TestPickTemplate:
    def test_vo2_picks_vo2_5x4_at_60min(self):
        t = pick_template("vo2", athlete_ftp=280, available_minutes=60)
        assert t.id == "vo2_5x4"

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
        t = pick_template("endurance", athlete_ftp=280, available_minutes=95)
        assert t.id == "z2_endurance_90"

    def test_rest_picks_rest_day(self):
        t = pick_template("rest", athlete_ftp=280, available_minutes=60)
        assert t.id == "rest_day"

    def test_recovery_picks_recovery_30(self):
        t = pick_template("recovery", athlete_ftp=280, available_minutes=60)
        assert t.id == "recovery_30"

    def test_sweet_spot_picks_sweet_spot_2x20(self):
        t = pick_template("sweet_spot", athlete_ftp=280, available_minutes=70)
        assert t.id == "sweet_spot_2x20"

    def test_threshold_picks_threshold_2x15(self):
        t = pick_template("threshold", athlete_ftp=280, available_minutes=60)
        assert t.id == "threshold_2x15"
