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
        # z2_endurance_60 → 60 min, 42.3 TSS (block-derived)
        tpl = TEMPLATES["z2_endurance_60"]
        act = _activity(duration_minutes=62, tss=44)  # +3%, +4%
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="endurance")
        assert rc.grade == "perfect"
        assert rc.duration.band == "match"
        assert rc.tss.band == "match"

    def test_strong_one_tight_one_loose(self):
        tpl = TEMPLATES["z2_endurance_60"]
        # duration +5%, TSS +21% — strong (one <=10, other <=25)
        act = _activity(duration_minutes=63, tss=51)
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
        act = _activity(duration_minutes=66, tss=46.5)  # +10%, +10% of 42.3
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
        """Absorb-and-replan invariant (P1.4): an unplanned ride on a rest day
        is a FREE ride graded on the absolute band — never 'overcooked' against
        a zero target (the guilt mechanic the product kills). 40 TSS sits in
        the maintenance good band → strong/perfect territory, not a failure."""
        tpl = TEMPLATES["rest_day"]
        act = _activity(duration_minutes=60, tss=40)
        rc = score_ride(act, tpl, ftp=280, phase="build1", session_type="rest")
        assert rc.grade in ("perfect", "strong", "okay")


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


# ======================================================================
# Recommendation-aware score() — Phase 4 plumbing (today-runthrough Step 4)
# ======================================================================
#
# We don't spin up a real DB here; we use AsyncMock to stand in for the
# AsyncSession. The two paths we care about:
#   1. No recommendation row → falls back to supplied target_template,
#      returns the same grade as score_ride() would have.
#   2. Recommendation row present → grades against the rec's blocks and
#      writes evaluated_at / eval_grade / eval_payload back.

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.services.ride_compliance import score


def _activity_with_date(
    *,
    duration_minutes: float = 60.0,
    tss: float | None = 45.0,
    sport: str = "cycling",
    started_at: datetime | None = None,
):
    a = _activity(duration_minutes=duration_minutes, tss=tss)
    a.started_at = started_at or datetime(2026, 5, 3, 8, 30, tzinfo=timezone.utc)
    a.sport = sport
    return a


def _mock_session_with_rec(rec):
    """Build an AsyncSession-like mock whose .execute(...) returns a result
    object whose .scalar_one_or_none() yields `rec`."""
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=rec)
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_score_falls_back_to_template_when_no_recommendation():
    tpl = TEMPLATES["z2_endurance_60"]
    act = _activity_with_date(duration_minutes=62, tss=44)
    session = _mock_session_with_rec(None)

    rc = await score(
        db=session,
        user_id=1,
        actual_activity=act,
        target_template=tpl,
        ftp=280,
        phase="build1",
        session_type="endurance",
    )
    # Same result as the legacy path.
    assert rc.grade == "perfect"
    assert rc.template_id == "z2_endurance_60"
    # No write-back when there's no rec to update.
    session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_score_uses_recommendation_and_writes_back_eval():
    # The rec is preferred when the LIVE pick is rest-like (post-training the
    # picker flips to rest) but the persisted recommendation carries the real
    # session the athlete was shown.
    tpl = TEMPLATES["rest_day"]
    # Build a stand-in recommendation row whose blocks reproduce the same
    # 60-min Z2 template — grading should produce "perfect" for a 62-min/47-TSS ride.
    rec = SimpleNamespace(
        id=99,
        user_id=1,
        target_date=datetime(2026, 5, 3).date(),
        template_id="z2_endurance_60",
        title="Z2 Endurance 60",
        framework_cited="Coggan Z2",
        predicted_tss=45,
        blocks=[
            {"name": "Warm-up", "duration_s": 600, "target_pct_ftp": 0.55, "zone": 1, "rpe": 3},
            {"name": "Main",    "duration_s": 2400, "target_pct_ftp": 0.70, "zone": 2, "rpe": 4},
            {"name": "Cool-down","duration_s": 600, "target_pct_ftp": 0.50, "zone": 1, "rpe": 2},
        ],
        evaluated_at=None,
        eval_grade=None,
        eval_payload=None,
    )
    act = _activity_with_date(duration_minutes=60, tss=45)
    session = _mock_session_with_rec(rec)

    rc = await score(
        db=session,
        user_id=1,
        actual_activity=act,
        target_template=tpl,
        ftp=280,
        phase="build1",
        session_type="endurance",
    )
    assert rc.grade in ("perfect", "strong")
    # Eval was written back onto the rec.
    assert rec.evaluated_at is not None
    assert rec.eval_grade == rc.grade
    assert rec.eval_payload is not None
    session.commit.assert_awaited()


# ======================================================================
# Sport gate (usability audit P0-2) — grade only when sport families match
# ======================================================================

from app.services.ride_compliance import _local_date_for_activity


def _bike_rec(**overrides):
    base = dict(
        id=42,
        user_id=1,
        target_date=datetime(2026, 5, 3).date(),
        template_id="z2_endurance_60",
        title="Z2 Endurance 60",
        framework_cited="Coggan Z2",
        predicted_tss=45,
        sport=None,  # legacy NULL → cycling
        blocks=[
            {"name": "Main", "duration_s": 3600, "target_pct_ftp": 0.70, "zone": 2, "rpe": 4},
        ],
        evaluated_at=None,
        eval_grade=None,
        eval_payload=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_gym_activity_vs_bike_rec_is_ungraded():
    """Yesterday's 10:21 gym session must never be graded as a Z2 bike ride:
    the sport gate returns a neutral 'logged' result — no grade, no pairs."""
    tpl = TEMPLATES["z2_endurance_60"]
    rec = _bike_rec()
    act = _activity_with_date(duration_minutes=45, tss=30, sport="gym")
    session = _mock_session_with_rec(rec)

    rc = await score(
        db=session,
        user_id=1,
        actual_activity=act,
        target_template=tpl,
        ftp=280,
        phase="build1",
        session_type="endurance",
    )
    assert rc.graded is False
    assert rc.grade is None
    assert rc.duration is None
    assert rc.tss is None
    assert rc.intensity_factor is None
    # No eval write-back for an ungraded result.
    assert rec.evaluated_at is None
    session.commit.assert_not_awaited()

    # Serialization keeps every consumer's `(d.get("tss") or {})` pattern safe.
    d = ride_compliance_to_dict(rc)
    assert d["graded"] is False
    assert d["grade"] is None
    assert d["duration"] == {}
    assert d["tss"] == {}


@pytest.mark.asyncio
async def test_run_activity_vs_run_rec_grades_normally():
    """Same-family prescription grades: a run against its run rec."""
    tpl = TEMPLATES["z2_endurance_60"]  # live pick is a bike template
    rec = _bike_rec(
        template_id="run_easy_45",
        title="Easy Run 45",
        predicted_tss=40,
        sport="running",
        blocks=[{"name": "Main", "duration_s": 2700, "target_pct_ftp": 0.0, "zone": 2, "rpe": 3}],
    )
    act = _activity_with_date(duration_minutes=45, tss=40, sport="running")
    session = _mock_session_with_rec(rec)

    rc = await score(
        db=session,
        user_id=1,
        actual_activity=act,
        target_template=tpl,
        ftp=280,
        phase="build1",
        session_type="endurance",
    )
    assert rc.graded is True
    assert rc.grade == "perfect"  # 45/45 min, 40/40 TSS
    assert rc.template_id == "run_easy_45"


@pytest.mark.asyncio
async def test_run_activity_without_run_rec_is_ungraded():
    """A run on a bike-prescription day is logged, not graded against the
    bike template (legacy NULL rec sport means cycling)."""
    tpl = TEMPLATES["z2_endurance_60"]
    rec = _bike_rec()  # sport NULL → cycling
    act = _activity_with_date(duration_minutes=45, tss=40, sport="running")
    session = _mock_session_with_rec(rec)

    rc = await score(
        db=session,
        user_id=1,
        actual_activity=act,
        target_template=tpl,
        ftp=280,
        phase="build1",
        session_type="endurance",
    )
    assert rc.graded is False
    assert rc.grade is None


def test_local_date_uses_athlete_tz_not_utc():
    """A 22:30 UTC finish is 00:30 Berlin next day — the grading lookup must
    use the athlete-local date, so a late-local-evening ride (20:30 UTC =
    22:30 Berlin) stays on its local day."""
    late_local = _activity_with_date(
        started_at=datetime(2026, 5, 3, 20, 30, tzinfo=timezone.utc)  # 22:30 Berlin
    )
    assert _local_date_for_activity(late_local) == datetime(2026, 5, 3).date()

    past_utc_midnight = _activity_with_date(
        started_at=datetime(2026, 5, 3, 22, 30, tzinfo=timezone.utc)  # 00:30 Berlin (May 4)
    )
    assert _local_date_for_activity(past_utc_midnight) == datetime(2026, 5, 4).date()
