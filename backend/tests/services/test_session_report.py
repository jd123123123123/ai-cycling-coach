"""Session-report sport gate + athlete-local day attribution (audit P0-2).

- A gym session on a bike-Z2 day is LOGGED (grade None, kind='logged',
  strength facts only) — never graded against the bike template.
- The prescription lookup and the report date use the athlete-LOCAL calendar
  day (a 00:30 Berlin ride belongs to that local day, not the UTC-previous).
- No grade is ever emitted when the underlying duration/TSS inputs are absent
  (the audit's "dashes with a B").
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.session_report import build_session_report


def _profile(tz: str = "Europe/Berlin"):
    return SimpleNamespace(
        ftp_watts=280,
        timezone=tz,
        goals={},
        target_event_date=None,
        running_threshold_pace_ms=None,
        lthr_running=None,
        max_heart_rate=None,
        date_of_birth=None,
    )


def _activity(
    *,
    sport: str = "cycling",
    started_at: datetime | None = None,
    duration_minutes: float = 60.0,
    tss: float | None = 45.0,
    average_hr: int | None = 132,
):
    return SimpleNamespace(
        id=7,
        user_id=1,
        sport=sport,
        title=None,
        started_at=started_at or datetime(2026, 5, 3, 8, 30, tzinfo=timezone.utc),
        duration_seconds=int(duration_minutes * 60),
        tss=tss,
        distance_meters=None,
        normalized_power=182,
        average_power=175,
        average_hr=average_hr,
        raw_data=None,
    )


def _bike_rec():
    return SimpleNamespace(
        id=1,
        user_id=1,
        target_date=datetime(2026, 5, 3).date(),
        template_id="z2_endurance_60",
        title="Z2 Endurance 60",
        duration_minutes=60,
        predicted_tss=45,
        framework_cited="Coggan Z2",
        sport=None,  # legacy NULL → cycling
        blocks=[
            {"name": "Main", "duration_s": 3600, "target_pct_ftp": 0.70, "zone": 2, "rpe": 4},
        ],
        evaluated_at=None,
        eval_grade=None,
        eval_payload=None,
    )


def _db(act, profile, rec):
    """Dispatch db.execute on the statement's table; db.get returns None
    (no stream row)."""
    db = MagicMock()

    async def execute(stmt):  # noqa: ANN001
        text = str(stmt).lower()
        result = MagicMock()
        if "from activities" in text:
            scalars = MagicMock()
            scalars.first.return_value = act
            result.scalars.return_value = scalars
        elif "athlete_profiles" in text:
            result.scalar_one_or_none.return_value = profile
        elif "coach_recommendations" in text:
            result.scalar_one_or_none.return_value = rec
        return result

    db.execute = AsyncMock(side_effect=execute)
    db.get = AsyncMock(return_value=None)
    db.commit = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_gym_session_is_logged_not_graded_against_bike_rec():
    """The audit case: a gym session must never carry a compliance grade
    against the day's Z2 bike prescription."""
    act = _activity(sport="gym", duration_minutes=42, tss=20.0)
    db = _db(act, _profile(), _bike_rec())

    report = await build_session_report(db, 1, 7)
    assert report is not None
    assert report.kind == "logged"
    assert report.grade is None
    assert report.next_session is None
    assert report.prescribed_title is None
    # Strength facts only — duration + HR, never bike KPIs.
    keys = {k.key for k in report.kpis}
    assert "duration" in keys and "hr" in keys
    assert "load" not in keys and "intensity" not in keys
    assert all(k.sentiment == "neutral" for k in report.kpis)
    assert all("%" not in k.delta_display for k in report.kpis)


@pytest.mark.asyncio
async def test_cycling_report_uses_athlete_local_date():
    """22:30 UTC = 00:30 Berlin next day — the report (and rec lookup) must
    attribute the session to the athlete-local day."""
    act = _activity(started_at=datetime(2026, 5, 3, 22, 30, tzinfo=timezone.utc))
    db = _db(act, _profile(), None)

    report = await build_session_report(db, 1, 7)
    assert report is not None
    assert report.date == "2026-05-04"  # local day, not the UTC 2026-05-03


@pytest.mark.asyncio
async def test_cycling_grades_normally_against_bike_rec():
    act = _activity(duration_minutes=60, tss=45.0)
    db = _db(act, _profile(), _bike_rec())

    report = await build_session_report(db, 1, 7)
    assert report is not None
    assert report.kind == "graded"
    assert report.grade is not None
    assert report.next_session is not None


@pytest.mark.asyncio
async def test_no_grade_when_tss_input_missing():
    """Dashes must never carry a grade: absent TSS → grade None, logged."""
    act = _activity(duration_minutes=60, tss=None)
    db = _db(act, _profile(), _bike_rec())

    report = await build_session_report(db, 1, 7)
    assert report is not None
    assert report.grade is None
    assert report.kind == "logged"
    assert report.next_session is None
