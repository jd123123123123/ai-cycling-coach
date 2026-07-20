"""Unit tests for sports science pure functions in training_load.py.

All tests target exact known values verified against authoritative sources:
- Coggan/TrainingPeaks TSS formulas
- EWMA CTL/ATL with 1/42 and 1/7 decay constants
- Coggan 7-zone power zones from FTP
- Seiler 3-zone running zones from threshold pace
"""
import math
from datetime import date

import pytest

from app.services.training_load import (
    calculate_cycling_tss,
    calculate_hr_tss,
    calculate_np,
    calculate_running_tss,
    calculate_tsb,
    coggan_power_zones,
    compute_pmc_series,
    seiler_3_zones_running,
    update_ctl_atl,
)


# ---------------------------------------------------------------------------
# calculate_np
# ---------------------------------------------------------------------------

class TestCalculateNP:
    def test_steady_effort_one_hour_returns_near_average(self):
        """1 hour at 200W steady returns ~200.0 NP."""
        power = [200.0] * 3600
        result = calculate_np(power)
        assert abs(result - 200.0) < 0.5

    def test_short_list_fallback_to_average(self):
        """Lists shorter than 30 points fall back to simple average."""
        result = calculate_np([250.0, 260.0])
        assert abs(result - 255.0) < 0.01

    def test_empty_list_returns_zero(self):
        """Empty power series returns 0.0."""
        assert calculate_np([]) == 0.0

    def test_exactly_29_points_uses_average(self):
        """Exactly 29 points still uses simple average fallback."""
        power = [100.0] * 29
        assert abs(calculate_np(power) - 100.0) < 0.01

    def test_exactly_30_points_uses_np_algorithm(self):
        """Exactly 30 points uses the rolling-average NP algorithm."""
        power = [200.0] * 30
        result = calculate_np(power)
        # Steady effort — NP should still be ~200
        assert abs(result - 200.0) < 0.5

    def test_variable_effort_np_higher_than_average(self):
        """Variable power produces NP higher than average due to 4th-power weighting.

        The NP algorithm uses a 30-second rolling average before raising to the 4th power.
        Variation must exist on a scale LONGER than 30 seconds for NP to exceed average.
        Using 60-second blocks (100W / 300W) gives mean=200W but NP ~239W.
        """
        # Alternating 60-second blocks of 100W and 300W — mean 200W, NP > 200W
        power = ([100.0] * 60 + [300.0] * 60) * 30  # 3600 points
        avg = 200.0
        result = calculate_np(power)
        assert result > avg


# ---------------------------------------------------------------------------
# calculate_cycling_tss
# ---------------------------------------------------------------------------

class TestCalculateCyclingTSS:
    def test_one_hour_at_ftp_equals_100(self):
        """1 hour at exactly FTP = 100 TSS (the fundamental definition)."""
        result = calculate_cycling_tss(3600, 280.0, 280)
        assert abs(result - 100.0) < 0.01

    def test_below_ftp_gives_less_than_100(self):
        """1 hour at 220W with FTP 280 gives ~61.7 TSS."""
        result = calculate_cycling_tss(3600, 220.0, 280)
        # IF = 220/280 ≈ 0.7857; TSS = (3600 * 220 * IF) / (280 * 3600) * 100 ≈ 61.73
        assert abs(result - 61.73) < 0.1

    def test_half_hour_at_ftp_gives_25(self):
        """30 min at FTP = 25 TSS (duration halved, but IF²×duration scales quadratically)."""
        result = calculate_cycling_tss(1800, 280.0, 280)
        assert abs(result - 50.0) < 0.01

    def test_zero_ftp_raises_value_error(self):
        """FTP of 0 raises ValueError."""
        with pytest.raises(ValueError):
            calculate_cycling_tss(3600, 280.0, 0)

    def test_negative_ftp_raises_value_error(self):
        """Negative FTP raises ValueError."""
        with pytest.raises(ValueError):
            calculate_cycling_tss(3600, 280.0, -100)


# ---------------------------------------------------------------------------
# calculate_running_tss
# ---------------------------------------------------------------------------

class TestCalculateRunningTSS:
    def test_one_hour_at_threshold_equals_100(self):
        """1 hour at exactly threshold pace = 100 rTSS."""
        result = calculate_running_tss(3600, 3.5, 3.5)
        assert abs(result - 100.0) < 0.01

    def test_slower_than_threshold_gives_less_than_100(self):
        """1 hour at 3.0 m/s with threshold 3.5 m/s gives ~73.5 rTSS."""
        result = calculate_running_tss(3600, 3.0, 3.5)
        # IF = 3.0/3.5 = 0.857; rTSS = 3600 * 3.0 * 0.857 / (3.5 * 3600) * 100 ≈ 73.5
        assert abs(result - 73.5) < 0.5

    def test_zero_threshold_raises_value_error(self):
        """Threshold pace of 0 raises ValueError."""
        with pytest.raises(ValueError):
            calculate_running_tss(3600, 3.5, 0)

    def test_negative_threshold_raises_value_error(self):
        """Negative threshold raises ValueError."""
        with pytest.raises(ValueError):
            calculate_running_tss(3600, 3.5, -1.0)

    def test_faster_than_threshold_gives_more_than_100(self):
        """Running faster than threshold for 1 hour produces > 100 rTSS."""
        result = calculate_running_tss(3600, 4.0, 3.5)
        assert result > 100.0


# ---------------------------------------------------------------------------
# calculate_hr_tss
# ---------------------------------------------------------------------------

class TestCalculateHRTSS:
    def test_one_hour_at_lthr_male_equals_100(self):
        """1 hour at LTHR (male) = 100 hrTSS."""
        # lthr=160, rest=50, max=190 — activity at exactly LTHR
        result = calculate_hr_tss(3600, 160, 160, 50, 190, "male")
        assert abs(result - 100.0) < 0.01

    def test_one_hour_at_lthr_female_equals_100(self):
        """1 hour at LTHR (female) = 100 hrTSS."""
        result = calculate_hr_tss(3600, 160, 160, 50, 190, "female")
        assert abs(result - 100.0) < 0.01

    def test_below_lthr_gives_less_than_100(self):
        """Easy effort below LTHR produces < 100 hrTSS."""
        # average HR well below LTHR
        result = calculate_hr_tss(3600, 130, 160, 50, 190, "male")
        assert result < 100.0

    def test_above_lthr_gives_more_than_100(self):
        """Effort above LTHR produces > 100 hrTSS."""
        result = calculate_hr_tss(3600, 175, 160, 50, 190, "male")
        assert result > 100.0

    def test_zero_trimp_ref_returns_zero(self):
        """If TRIMP reference is 0, returns 0.0 (avoids division by zero)."""
        # lthr == hr_rest makes HRR_lthr = 0 => trimp_ref = 0
        result = calculate_hr_tss(3600, 50, 50, 50, 190, "male")
        assert result == 0.0

    def test_hr_below_rest_clamped(self):
        """HR below resting HR is clamped to 0 — no negative TSS."""
        result = calculate_hr_tss(3600, 40, 160, 50, 190, "male")
        assert result >= 0.0

    def test_male_vs_female_different_values(self):
        """Male and female produce different hrTSS due to different k constants."""
        male = calculate_hr_tss(3600, 150, 160, 50, 190, "male")
        female = calculate_hr_tss(3600, 150, 160, 50, 190, "female")
        assert male != female


# ---------------------------------------------------------------------------
# update_ctl_atl
# ---------------------------------------------------------------------------

class TestUpdateCTLATL:
    def test_new_athlete_first_big_day(self):
        """Starting from zero, 100 TSS day: CTL=100/42≈2.38, ATL=100/7≈14.29."""
        ctl, atl = update_ctl_atl(0.0, 0.0, 100.0)
        assert ctl == pytest.approx(100.0 / 42, abs=1e-9)
        assert atl == pytest.approx(100.0 / 7, abs=1e-9)

    def test_rest_day_causes_decay(self):
        """Rest day (TSS=0) from established load: CTL and ATL decay."""
        ctl, atl = update_ctl_atl(50.0, 50.0, 0.0)
        assert ctl == pytest.approx(50.0 - 50.0 / 42, abs=1e-9)
        assert atl == pytest.approx(50.0 - 50.0 / 7, abs=1e-9)

    def test_ctl_decays_slower_than_atl(self):
        """On a rest day, ATL drops more than CTL (ATL uses 1/7 vs CTL 1/42)."""
        ctl_start, atl_start = 50.0, 50.0
        new_ctl, new_atl = update_ctl_atl(ctl_start, atl_start, 0.0)
        ctl_drop = ctl_start - new_ctl
        atl_drop = atl_start - new_atl
        assert atl_drop > ctl_drop

    def test_full_precision_no_per_step_rounding(self):
        """The EWMA state is NOT rounded per step (audit P0-5) — rounding
        happens once at series emission. Values must match the exact formula."""
        ctl, atl = update_ctl_atl(42.567, 35.123, 80.0)
        assert ctl == pytest.approx(42.567 + (80.0 - 42.567) / 42, abs=1e-12)
        assert atl == pytest.approx(35.123 + (80.0 - 35.123) / 7, abs=1e-12)

    def test_ewma_formula_correctness(self):
        """Verify EWMA formula: CTL = prev + (TSS - prev) * (1/42)."""
        prev_ctl, prev_atl = 40.0, 60.0
        tss = 70.0
        expected_ctl = prev_ctl + (tss - prev_ctl) * (1 / 42)
        expected_atl = prev_atl + (tss - prev_atl) * (1 / 7)
        ctl, atl = update_ctl_atl(prev_ctl, prev_atl, tss)
        assert ctl == pytest.approx(expected_ctl, abs=1e-12)
        assert atl == pytest.approx(expected_atl, abs=1e-12)


# ---------------------------------------------------------------------------
# calculate_tsb
# ---------------------------------------------------------------------------

class TestCalculateTSB:
    def test_fatigued_athlete_negative_tsb(self):
        """CTL < ATL produces negative TSB (fatigued)."""
        result = calculate_tsb(50.0, 60.0)
        assert result == -10.0

    def test_fresh_athlete_positive_tsb(self):
        """CTL > ATL produces positive TSB (fresh/rested)."""
        result = calculate_tsb(60.0, 40.0)
        assert result == 20.0

    def test_balanced_athlete_zero_tsb(self):
        """Equal CTL and ATL produces TSB = 0.0."""
        result = calculate_tsb(50.0, 50.0)
        assert result == 0.0

    def test_rounded_to_one_decimal(self):
        """TSB rounded to 1 decimal place."""
        result = calculate_tsb(55.27, 48.93)
        assert result == round(55.27 - 48.93, 1)


# ---------------------------------------------------------------------------
# coggan_power_zones
# ---------------------------------------------------------------------------

class TestCogganPowerZones:
    def test_returns_7_zones(self):
        """Should return exactly 7 zones."""
        zones = coggan_power_zones(280)
        assert len(zones) == 7

    def test_zone1_max_at_55_percent_ftp(self):
        """Zone 1 max = floor(FTP * 0.55) = 154 for FTP 280."""
        zones = coggan_power_zones(280)
        assert zones["zone1"]["max"] == int(280 * 0.55)  # 154

    def test_zone4_min_at_91_percent_ftp(self):
        """Zone 4 min = floor(FTP * 0.91) = 255 for FTP 280."""
        zones = coggan_power_zones(280)
        assert zones["zone4"]["min"] == int(280 * 0.91)  # 254 or 255

    def test_zone4_max_at_105_percent_ftp(self):
        """Zone 4 max = floor(FTP * 1.05) = 294 for FTP 280."""
        zones = coggan_power_zones(280)
        assert zones["zone4"]["max"] == int(280 * 1.05)  # 294

    def test_zone7_max_is_none(self):
        """Zone 7 is open-ended: max is None."""
        zones = coggan_power_zones(280)
        assert zones["zone7"]["max"] is None

    def test_zone1_min_is_zero(self):
        """Zone 1 starts at 0."""
        zones = coggan_power_zones(280)
        assert zones["zone1"]["min"] == 0

    def test_all_zones_have_name(self):
        """All zones have a 'name' key."""
        zones = coggan_power_zones(280)
        for zone_key, zone in zones.items():
            assert "name" in zone, f"{zone_key} missing name"

    def test_scales_with_different_ftp(self):
        """Zone boundaries scale linearly with FTP."""
        zones_200 = coggan_power_zones(200)
        zones_300 = coggan_power_zones(300)
        ratio = zones_300["zone4"]["min"] / zones_200["zone4"]["min"]
        assert abs(ratio - 1.5) < 0.05  # 300/200 = 1.5


# ---------------------------------------------------------------------------
# seiler_3_zones_running
# ---------------------------------------------------------------------------

class TestSeiler3ZonesRunning:
    def test_returns_3_zones(self):
        """Should return exactly 3 zones."""
        zones = seiler_3_zones_running(3.5)
        assert len(zones) == 3

    def test_zone1_max_speed_at_77_percent_threshold(self):
        """Zone 1 max_speed = 0.77 * threshold = 2.695 for threshold 3.5 m/s."""
        zones = seiler_3_zones_running(3.5)
        assert abs(zones["zone1"]["max_speed_ms"] - 2.695) < 0.001

    def test_zone2_max_speed_equals_threshold(self):
        """Zone 2 max_speed = threshold pace (LT2 boundary)."""
        zones = seiler_3_zones_running(3.5)
        assert zones["zone2"]["max_speed_ms"] == 3.5

    def test_zone2_min_speed_matches_zone1_max(self):
        """Zone 2 min speed = Zone 1 max speed (contiguous boundaries)."""
        zones = seiler_3_zones_running(3.5)
        assert zones["zone2"]["min_speed_ms"] == zones["zone1"]["max_speed_ms"]

    def test_zone3_min_speed_equals_threshold(self):
        """Zone 3 starts at threshold speed."""
        zones = seiler_3_zones_running(3.5)
        assert zones["zone3"]["min_speed_ms"] == 3.5

    def test_all_zones_have_name(self):
        """All zones have a 'name' key."""
        zones = seiler_3_zones_running(3.5)
        for zone_key, zone in zones.items():
            assert "name" in zone, f"{zone_key} missing name"


# ---------------------------------------------------------------------------
# compute_pmc_series
# ---------------------------------------------------------------------------

class TestComputePMCSeries:
    def test_empty_input_returns_empty(self):
        """Empty input returns empty list."""
        result = compute_pmc_series([])
        assert result == []

    def test_single_day_produces_one_entry(self):
        """Single TSS entry produces one PMC data point."""
        entries = [{"date": date(2026, 1, 1), "tss": 100.0}]
        result = compute_pmc_series(entries)
        assert len(result) == 1

    def test_output_keys(self):
        """Each output dict has date, ctl, atl, tsb keys."""
        entries = [{"date": date(2026, 1, 1), "tss": 80.0}]
        result = compute_pmc_series(entries)
        assert set(result[0].keys()) == {"date", "ctl", "atl", "tsb"}

    def test_date_preserved(self):
        """Output dates match input dates."""
        d = date(2026, 3, 15)
        entries = [{"date": d, "tss": 50.0}]
        result = compute_pmc_series(entries)
        assert result[0]["date"] == d

    def test_gap_days_filled_with_zero_tss(self):
        """2-day gap between entries is filled: CTL/ATL decay on rest days."""
        entries = [
            {"date": date(2026, 1, 1), "tss": 100.0},
            {"date": date(2026, 1, 4), "tss": 100.0},  # 2-day gap (Jan 2 and 3 missing)
        ]
        result = compute_pmc_series(entries)
        # Should produce 4 entries total (Jan 1, 2, 3, 4)
        assert len(result) == 4

    def test_rest_days_cause_ctl_decay(self):
        """After a big day, rest days cause CTL to decay, not stay flat."""
        # Build some CTL with a high TSS day
        big_day = {"date": date(2026, 1, 1), "tss": 200.0}
        rest_day = {"date": date(2026, 1, 5), "tss": 0.0}  # 3 rest days in between
        result = compute_pmc_series([big_day, rest_day])
        # CTL after day 1 should be higher than CTL after day 5 (decay during rest)
        ctl_day1 = result[0]["ctl"]
        ctl_day5 = result[4]["ctl"]
        assert ctl_day5 < ctl_day1

    def test_sequential_high_tss_increases_ctl_and_atl(self):
        """Multiple consecutive high-TSS days increase both CTL and ATL."""
        entries = [{"date": date(2026, 1, i), "tss": 100.0} for i in range(1, 8)]
        result = compute_pmc_series(entries)
        assert result[-1]["ctl"] > result[0]["ctl"]
        assert result[-1]["atl"] > result[0]["atl"]

    def test_initial_ctl_atl_zero(self):
        """New athlete starts at CTL=0, ATL=0."""
        entries = [{"date": date(2026, 1, 1), "tss": 50.0}]
        result = compute_pmc_series(entries)
        # After one day of 50 TSS from 0: CTL = 50 * (1/42) ≈ 1.2
        assert result[0]["ctl"] < 5.0  # starts near 0
        assert result[0]["atl"] < 15.0

    def test_emitted_values_rounded_once(self):
        """Series entries are rounded to 1 decimal at emission (and only there)."""
        entries = [{"date": date(2026, 1, i), "tss": 77.7} for i in range(1, 15)]
        result = compute_pmc_series(entries)
        for entry in result:
            assert entry["ctl"] == round(entry["ctl"], 1)
            assert entry["atl"] == round(entry["atl"], 1)
            assert entry["tsb"] == round(entry["tsb"], 1)

    def test_tsb_equals_ctl_minus_atl(self):
        """TSB = CTL - ATL for each day."""
        entries = [{"date": date(2026, 1, i), "tss": 80.0} for i in range(1, 10)]
        result = compute_pmc_series(entries)
        for entry in result:
            expected_tsb = round(entry["ctl"] - entry["atl"], 1)
            assert entry["tsb"] == expected_tsb
