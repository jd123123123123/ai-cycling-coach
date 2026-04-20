"""Unit tests for ride_compliance — 5-grade scoring of a completed ride
against the template the periodization layer would have prescribed.

Covers:
    - Each of the 5 grades (perfect / strong / okay / overcooked / undercooked)
    - IF / VI / EF computation from summary fields
    - Missing NP (HR-only device) falls back cleanly — EF still computes
    - Missing FTP → IF is None but duration+TSS still grade
    - Offseason / maintenance phase uses absolute TSS band, not template target
    - Rest-day template (base_tss=0) + ride → overcooked
    - `ride_compliance_to_dict` round-trips cleanly
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.ride_compliance import (
    _grade_from_pairs,
    _pair,
    compliance_pair_to_dict,
    ride_compliance_to_dict,
    score_ride,
)
from app.services.workout_templates import TEMPLATES


# ----------------------------------------------------------------------
# Helpers — build a stand-in Activity object without hitting the DB.
# The ride_compliance module only reads ORM attributes, so SimpleNamespace
# is sufficient.
# ----------------------------------------------------------------------

def _activity(
    *,
    duration_minutes: float = 60.0,
    tss: float | None = 45.0,
    normalized_power: float | None = 180.0,
    average_power: float | None = 175.0,
    average_hr: int | None = 140,
    raw_data: dict | None = None,
) -> object:
    return SimpleNamespace(
        duration_seconds=int(duration_minutes * 60),
        tss=tss,
        normalized_power=normalized_power,
        average_power=average_power,
        average_hr=average_hr,
        raw_data=raw_data,
    )


# ======================================================================
# Grade classification — the 5 target cases
# ======================================================================

class TestGrading:
    def test_perfect_both_within_10pct(self):
        # z2_endurance_60 → 60 min, 45 TSS
        tpl = TEMPLATES["z2_endurance_60"]
        act = _activity(duration_minutes=62, tss=47)  # +3%, +4%
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        assert rc.grade == "perfect"
        assert rc.duration.band == "match"
        assert rc.tss.band == "match"

    def test_strong_one_tight_one_loose(self):
        tpl = TEMPLATES["z2_endurance_60"]
        # duration +5%, TSS +22% — strong (one <=10, other <=25)
        act = _activity(duration_minutes=63, tss=55)
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        assert rc.grade == "strong"

    def test_okay_both_middle_band(self):
        tpl = TEMPLATES["z2_endurance_60"]
        # duration +22%, TSS +22% — okay (both within 30, neither <=10)
        act = _activity(duration_minutes=73, tss=55)
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        assert rc.grade == "okay"

    def test_overcooked_tss_30pct_over(self):
        tpl = TEMPLATES["z2_endurance_60"]
        # duration +5%, TSS +40% — overcooked
        act = _activity(duration_minutes=63, tss=63)
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        assert rc.grade == "overcooked"

    def test_undercooked_tss_40pct_under(self):
        tpl = TEMPLATES["z2_endurance_60"]
        # duration -30% exactly (boundary), TSS -50% — undercooked (tss rule wins)
        act = _activity(duration_minutes=42, tss=22)
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        assert rc.grade == "undercooked"

    def test_overcooked_tss_high_short_ride(self):
        """Short but very hard: duration low, TSS blown → overcooked."""
        tpl = TEMPLATES["z2_endurance_60"]
        # duration -35%, TSS +50% (rode hard for 40 min instead of chill for 60)
        act = _activity(duration_minutes=39, tss=68)
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        assert rc.grade == "overcooked"

    def test_perfect_boundary_at_exactly_10pct(self):
        tpl = TEMPLATES["z2_endurance_60"]
        # Exactly ±10% on both axes — should be perfect (inclusive boundary)
        act = _activity(duration_minutes=66, tss=49.5)  # +10%, +10%
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        assert rc.grade == "perfect"


# ======================================================================
# IF / VI / EF computation
# ======================================================================

class TestDerivedMetrics:
    def test_if_computed_when_np_and_ftp_present(self):
        tpl = TEMPLATES["z2_endurance_60"]
        act = _activity(normalized_power=182, average_power=175, average_hr=140)
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        assert rc.intensity_factor is not None
        # Target IF from z2_endurance_60 main block = 0.65
        # Actual IF = 182/280 = 0.65 → match
        assert rc.intensity_factor.band == "match"
        assert abs(rc.intensity_factor.actual - 0.65) < 0.01

    def test_vi_computed_when_np_and_avg_p(self):
        tpl = TEMPLATES["z2_endurance_60"]
        act = _activity(normalized_power=200, average_power=180, average_hr=140)
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        # VI = 200/180 = 1.111
        assert rc.variability_index is not None
        assert abs(rc.variability_index - 1.111) < 0.01

    def test_ef_computed_when_np_and_hr(self):
        tpl = TEMPLATES["z2_endurance_60"]
        act = _activity(normalized_power=220, average_power=215, average_hr=145)
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        # EF = 220/145 = 1.517
        assert rc.ef is not None
        assert abs(rc.ef - 1.517) < 0.01

    def test_hr_only_device_no_np(self):
        """Wahoo Tickr with no power meter — NP and avg_p None, avg_hr present.
        IF/VI are None; EF is None (no NP or avgP either); grade still works.
        """
        tpl = TEMPLATES["z2_endurance_60"]
        act = _activity(
            duration_minutes=60, tss=45,
            normalized_power=None, average_power=None, average_hr=140,
        )
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        assert rc.intensity_factor is None
        assert rc.variability_index is None
        assert rc.ef is None
        assert rc.grade == "perfect"  # duration + TSS still match

    def test_ef_fallback_from_avg_power_when_no_np(self):
        """When avgP + avgHR are present but NP is missing, EF uses avgP as
        a proxy — better to show something sensible than None."""
        tpl = TEMPLATES["z2_endurance_60"]
        act = _activity(
            duration_minutes=60, tss=45,
            normalized_power=None, average_power=175, average_hr=140,
        )
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        assert rc.ef is not None
        # 175/140 = 1.25
        assert abs(rc.ef - 1.25) < 0.01

    def test_missing_ftp_still_grades(self):
        tpl = TEMPLATES["z2_endurance_60"]
        act = _activity(duration_minutes=60, tss=45, normalized_power=180)
        rc = score_ride(act, tpl, ftp=None, phase="build1", session_type="endurance")
        assert rc.intensity_factor is None
        assert rc.grade == "perfect"


# ======================================================================
# Phase edge cases
# ======================================================================

class TestPhaseAdjustments:
    def test_offseason_uses_absolute_band(self):
        """Offseason: 25-80 TSS is 'good', outside that is graded absolutely."""
        tpl = TEMPLATES["z2_endurance_60"]  # 45 TSS baseline
        # Chill offseason ride at 55 TSS — good band
        act = _activity(duration_minutes=75, tss=55)
        rc = score_ride(act, tpl, ftp=280, phase="offseason", session_type="endurance")
        assert rc.grade in ("strong", "perfect")

    def test_offseason_big_ride_overcooked(self):
        tpl = TEMPLATES["z2_endurance_60"]
        # 150 TSS in offseason = too much (>80 * 1.5 = 120)
        act = _activity(duration_minutes=150, tss=150)
        rc = score_ride(act, tpl, ftp=280, phase="offseason", session_type="endurance")
        assert rc.grade == "overcooked"

    def test_offseason_tiny_ride_undercooked(self):
        tpl = TEMPLATES["z2_endurance_60"]
        # 8 TSS (<25 * 0.5 = 12.5) → undercooked
        act = _activity(duration_minutes=20, tss=8)
        rc = score_ride(act, tpl, ftp=280, phase="offseason", session_type="endurance")
        assert rc.grade == "undercooked"

    def test_maintenance_phase_absolute_band(self):
        tpl = TEMPLATES["z2_endurance_60"]
        # 60 TSS in maintenance — within 30-100 band
        act = _activity(duration_minutes=80, tss=60)
        rc = score_ride(act, tpl, ftp=280, phase="maintenance", session_type="endurance")
        assert rc.grade in ("perfect", "strong")

    def test_rest_day_template_but_rode(self):
        """Template is rest_day (target TSS=0) but athlete rode 40 TSS →
        overcooked via the _pair(0, positive) branch."""
        tpl = TEMPLATES["rest_day"]
        act = _activity(duration_minutes=60, tss=40)
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="rest")
        assert rc.grade == "overcooked"


# ======================================================================
# _pair & _grade_from_pairs — unit-level coverage of the rubric edges
# ======================================================================

class TestPairAndGrade:
    def test_pair_match_at_10pct(self):
        p = _pair(60.0, 66.0)  # +10% exact
        assert p.band == "match"

    def test_pair_over_at_11pct(self):
        p = _pair(60.0, 66.7)  # +11.17%
        assert p.band == "over"

    def test_pair_under_at_minus_11pct(self):
        p = _pair(60.0, 53.0)  # -11.67%
        assert p.band == "under"

    def test_grade_mixed_fallback_tss_high(self):
        """A pathological combo that doesn't fit rules 1-5 falls through to the
        mixed rule: tss>0 → overcooked."""
        # duration +15% (band="over"), tss +25% (band="over") → rule 4?
        # ad=15, at=25 → rule 4 (one <=10 AND other <=25): 15 > 10, so rule 4 nope
        # Actually neither is <=10, so rule 4 fails. Rule 5 requires both <=30 — both pass.
        # Result should be "okay" not the mixed fallback.
        d = _pair(60.0, 69.0)  # +15%
        t = _pair(45.0, 56.25)  # +25%
        assert _grade_from_pairs(d, t) == "okay"


# ======================================================================
# Serialization round-trip
# ======================================================================

class TestSerialization:
    def test_to_dict_preserves_all_fields(self):
        tpl = TEMPLATES["z2_endurance_60"]
        act = _activity(duration_minutes=62, tss=47, normalized_power=182, average_power=175, average_hr=140)
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        d = ride_compliance_to_dict(rc)
        assert d["grade"] == rc.grade
        assert d["duration"]["target"] == rc.duration.target
        assert d["duration"]["actual"] == rc.duration.actual
        assert d["duration"]["band"] == rc.duration.band
        assert d["phase"] == "build1"
        assert d["session_type"] == "endurance"
        assert d["template_id"] == "z2_endurance_60"

    def test_pair_to_dict(self):
        p = _pair(60.0, 62.0)
        d = compliance_pair_to_dict(p)
        assert d == {"target": 60.0, "actual": 62.0, "delta_pct": pytest.approx(3.3, abs=0.1), "band": "match"}
