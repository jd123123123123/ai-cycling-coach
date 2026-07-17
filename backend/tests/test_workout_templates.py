"""Unit tests for workout_templates — the precise interval library.

Covers:
    - Every template in TEMPLATES parametrises cleanly at typical FTP values
    - ResolvedBlock watts are the correct ±tolerance band around ftp × pct_ftp
    - duration_scale only stretches main blocks, never warm-up / cool-down
    - duration_scale clamps to [0.7, 1.15] (no triple-long VO2 from a rogue caller)
    - TSS scales proportionally to main-block seconds
    - parametrize_template raises on ftp <= 0
    - prescribed_workout_to_dict round-trips cleanly
"""
from __future__ import annotations

import pytest

from app.services.workout_templates import (
    TEMPLATES,
    PrescribedWorkout,
    ResolvedBlock,
    get_template,
    parametrize_template,
    prescribed_workout_to_dict,
)


class TestTemplateLibrary:
    def test_all_templates_registered(self):
        # 50-template library: 13 originals + 7 first-batch + 30 second-batch.
        # Categories: rest/recovery (3), endurance (10), tempo (4),
        # sweet_spot (4), threshold (10), vo2 (9), anaerobic (6).
        expected = {
            # Originals
            "rest_day", "recovery_30",
            "z2_endurance_60", "z2_endurance_90", "z2_long_120", "z2_long_180",
            "z2_climbing_long",
            "tempo_3x10", "sweet_spot_2x20", "threshold_2x15", "over_under_3x5",
            "vo2_5x4", "vo2_micro_30x30",
            # First-batch additions
            "vo2_ronnestad_3x13", "vo2_map_5x3", "threshold_seiler_4x8",
            "sweet_spot_4x15", "neuromuscular_sprints_8x15",
            "anaerobic_tabata_8x20_10", "polarized_long_z2_4x4",
            # Second-batch additions — endurance (4)
            "maf_aerobic_90", "z2_progressive_90", "z2_long_240", "z2_fasted_60",
            # Within-Z2 texture variants (3)
            "z2_endurance_low_100", "z2_endurance_upper_75",
            "z2_endurance_tempo_touch_75",
            # recovery
            "recovery_60",
            # tempo (3)
            "tempo_2x30", "tempo_4x15", "tempo_progression_60",
            # sweet-spot (2)
            "sub_threshold_2x40", "sweet_spot_3x20",
            # threshold (5)
            "threshold_pyramid", "threshold_hill_4x10", "over_under_4x12",
            "threshold_descending", "lactate_shuttles_3x8",
            # vo2 (4)
            "vo2_hill_6x3", "vo2_microbursts_30x15_45", "vo2_3x6",
            "vo2_descending_5_4_3_2_1",
            # anaerobic (4)
            "anaerobic_capacity_5x3_130", "anaerobic_8x90s",
            "neuromuscular_spinup_6x30", "neuromuscular_standing_6x10",
            # specialty + tests (5)
            "cadence_high_fsr_6x3", "cadence_low_lcf_4x6",
            "crit_simulation_stochastic", "group_ride_variable",
            "ftp_test_20min", "ftp_ramp_test", "race_pace_60_95",
        }
        assert set(TEMPLATES.keys()) == expected

    def test_get_template_known(self):
        t = get_template("vo2_5x4")
        assert t is not None
        assert t.id == "vo2_5x4"
        assert t.category == "vo2"

    def test_get_template_unknown(self):
        assert get_template("does_not_exist") is None

    def test_vo2_has_min_ftp_gate(self):
        assert TEMPLATES["vo2_5x4"].min_ftp_required == 180
        assert TEMPLATES["vo2_micro_30x30"].min_ftp_required == 180

    def test_rest_day_has_zero_blocks(self):
        assert TEMPLATES["rest_day"].blocks == []
        assert TEMPLATES["rest_day"].base_tss == 0.0


class TestParametrize:
    def test_vo2_5x4_at_ftp_250(self):
        """Plan's canonical example: vo2_5x4 at FTP=250 → 5×4min at 288W ±14W."""
        pw = parametrize_template(TEMPLATES["vo2_5x4"], ftp=250)
        vo2_blocks = [b for b in pw.blocks if b.name.startswith("VO2")]
        assert len(vo2_blocks) == 5
        for b in vo2_blocks:
            # 115% × 250 = 287.5W center, ±5% tolerance (zone 5)
            # Low = 287.5 × 0.95 = 273, High = 287.5 × 1.05 = 302
            assert 270 <= b.target_watts_low <= 275
            assert 300 <= b.target_watts_high <= 305
            assert b.zone == 5
            assert b.duration_s == 240

    def test_vo2_5x4_at_ftp_280(self):
        """FTP=280 → 115% = 322W ±5% = 306-338W (matches task 1 smoke)."""
        pw = parametrize_template(TEMPLATES["vo2_5x4"], ftp=280)
        vo2_blocks = [b for b in pw.blocks if b.name.startswith("VO2")]
        assert all(305 <= b.target_watts_low <= 310 for b in vo2_blocks)
        assert all(335 <= b.target_watts_high <= 340 for b in vo2_blocks)

    def test_z2_endurance_watts_band(self):
        """Z2 @ 65% FTP gets a wider ±8% tolerance band."""
        pw = parametrize_template(TEMPLATES["z2_endurance_90"], ftp=250)
        b = pw.blocks[0]
        # 65% × 250 = 162.5W center, ±8% = 150-176
        assert 148 <= b.target_watts_low <= 152
        assert 174 <= b.target_watts_high <= 178
        assert b.zone == 2

    def test_threshold_watts_at_100_pct(self):
        pw = parametrize_template(TEMPLATES["threshold_2x15"], ftp=300)
        threshold_blocks = [b for b in pw.blocks if b.name.startswith("Threshold")]
        assert len(threshold_blocks) == 2
        for b in threshold_blocks:
            # 100% × 300 = 300W, ±5% = 285-315
            assert 283 <= b.target_watts_low <= 287
            assert 313 <= b.target_watts_high <= 317
            assert b.zone == 4

    def test_sweet_spot_at_88_pct(self):
        pw = parametrize_template(TEMPLATES["sweet_spot_2x20"], ftp=250)
        ss_blocks = [b for b in pw.blocks if b.name.startswith("Sweet spot")]
        for b in ss_blocks:
            # 88% × 250 = 220W, ±6% (zone 3) = 207-233
            assert 205 <= b.target_watts_low <= 210
            assert 230 <= b.target_watts_high <= 235

    def test_recovery_at_50_pct(self):
        pw = parametrize_template(TEMPLATES["recovery_30"], ftp=300)
        assert len(pw.blocks) == 1
        b = pw.blocks[0]
        # 50% × 300 = 150W, ±10% (zone 1) = 135-165
        assert 133 <= b.target_watts_low <= 137
        assert 163 <= b.target_watts_high <= 167

    def test_rest_day_produces_no_blocks(self):
        pw = parametrize_template(TEMPLATES["rest_day"], ftp=280)
        assert pw.blocks == []
        assert pw.total_duration_s == 0
        assert pw.predicted_tss == 0.0

    def test_warmup_cooldown_not_scaled(self):
        """duration_scale=1.15 stretches main blocks but leaves WU/CD alone."""
        pw = parametrize_template(TEMPLATES["sweet_spot_2x20"], ftp=250, duration_scale=1.15)
        wu = next(b for b in pw.blocks if b.name == "Warm-up")
        cd = next(b for b in pw.blocks if b.name == "Cool-down")
        assert wu.duration_s == 900   # unchanged 15 min
        assert cd.duration_s == 600   # unchanged 10 min
        ss = [b for b in pw.blocks if b.name.startswith("Sweet spot")]
        for b in ss:
            assert b.duration_s == int(round(20 * 60 * 1.15))  # 20 min × 1.15

    def test_duration_scale_clamped_upper(self):
        """duration_scale=2.0 gets clamped to 1.15 — cannot triple the ride."""
        pw_clamped = parametrize_template(TEMPLATES["vo2_5x4"], ftp=250, duration_scale=2.0)
        pw_max = parametrize_template(TEMPLATES["vo2_5x4"], ftp=250, duration_scale=1.15)
        assert pw_clamped.total_duration_s == pw_max.total_duration_s

    def test_duration_scale_clamped_lower(self):
        """duration_scale=0.3 gets clamped to 0.7 — cannot drop below minimum."""
        pw_clamped = parametrize_template(TEMPLATES["vo2_5x4"], ftp=250, duration_scale=0.3)
        pw_min = parametrize_template(TEMPLATES["vo2_5x4"], ftp=250, duration_scale=0.7)
        assert pw_clamped.total_duration_s == pw_min.total_duration_s

    def test_tss_scales_with_duration(self):
        """TSS scales proportionally to main-block seconds."""
        pw_base = parametrize_template(TEMPLATES["vo2_5x4"], ftp=250, duration_scale=1.0)
        pw_long = parametrize_template(TEMPLATES["vo2_5x4"], ftp=250, duration_scale=1.15)
        pw_short = parametrize_template(TEMPLATES["vo2_5x4"], ftp=250, duration_scale=0.85)
        # Base = 72.0 TSS at scale=1.0
        assert pw_base.predicted_tss == 72.0
        assert pw_long.predicted_tss > pw_base.predicted_tss
        assert pw_short.predicted_tss < pw_base.predicted_tss

    def test_ftp_zero_raises(self):
        with pytest.raises(ValueError):
            parametrize_template(TEMPLATES["vo2_5x4"], ftp=0)

    def test_ftp_negative_raises(self):
        with pytest.raises(ValueError):
            parametrize_template(TEMPLATES["z2_endurance_60"], ftp=-50)

    def test_duration_minutes_property(self):
        pw = parametrize_template(TEMPLATES["vo2_5x4"], ftp=250)
        # 15 + 5×4 + 4×3 + 10 = 15+20+12+10 = 57 min
        assert pw.duration_minutes == 57


class TestPrescribedWorkoutSerialiser:
    def test_roundtrip_preserves_blocks(self):
        pw = parametrize_template(TEMPLATES["vo2_5x4"], ftp=280)
        d = prescribed_workout_to_dict(pw)
        assert d["template_id"] == "vo2_5x4"
        assert d["duration_minutes"] == pw.duration_minutes
        assert len(d["blocks"]) == len(pw.blocks)
        assert d["blocks"][0]["name"] == pw.blocks[0].name
        assert d["blocks"][0]["target_watts_low"] == pw.blocks[0].target_watts_low

    def test_ef_range_is_list(self):
        pw = parametrize_template(TEMPLATES["z2_endurance_60"], ftp=250)
        d = prescribed_workout_to_dict(pw)
        assert isinstance(d["predicted_ef_range"], list)
        assert len(d["predicted_ef_range"]) == 2

    def test_why_this_workout_slot_exists(self):
        pw = parametrize_template(TEMPLATES["z2_endurance_60"], ftp=250)
        d = prescribed_workout_to_dict(pw)
        assert "why_this_workout" in d
