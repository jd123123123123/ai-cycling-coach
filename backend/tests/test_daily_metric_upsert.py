"""Regression tests for upsert_daily_metric — Garmin's daily summary fills
in progressively through the day, so the function must update existing rows
when fresh values arrive, not lock in whichever stub was first written."""
from datetime import date, datetime, timezone
from unittest.mock import MagicMock

import pytest

from app.models.daily_metric import DailyMetric
from app.services.daily_metric_service import upsert_daily_metric


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class _FakeDB:
    """Minimal AsyncSession stand-in: tracks add/flush, returns whichever row
    we pre-stage for the scalar_one_or_none lookup."""

    def __init__(self, existing: DailyMetric | None = None):
        self.existing = existing
        self.added: list = []
        self.flushes = 0

    async def execute(self, _stmt):
        return _FakeResult(self.existing)

    def add(self, obj):
        self.added.append(obj)
        # Mimic SQLAlchemy: once added it becomes the "existing" row for any
        # subsequent select in the same session.
        if isinstance(obj, DailyMetric) and self.existing is None:
            self.existing = obj

    async def flush(self):
        self.flushes += 1


@pytest.mark.asyncio
async def test_insert_when_no_row_exists():
    db = _FakeDB(existing=None)
    out = await upsert_daily_metric(
        db, user_id=1, for_date=date(2026, 5, 11),
        data={"sleep_score": 81, "hrv_status": 72, "raw_data": {"v": 1}},
    )
    assert out is not None
    assert out.sleep_score == 81
    assert out.hrv_status == 72
    assert len(db.added) == 1


@pytest.mark.asyncio
async def test_update_fills_null_fields_on_second_sync():
    """First sync (10am): row has steps only, every other field NULL.
    Second sync (4pm): Garmin returns sleep + HRV + body battery.
    The function must fill in the NULL fields, not skip."""
    existing = DailyMetric(
        user_id=1, date=date(2026, 5, 11),
        sleep_score=None, hrv_status=None, body_battery=None,
        resting_hr=None, stress_level=None, steps=200,
        source="garmin", raw_data={"v": 1},
    )
    db = _FakeDB(existing=existing)
    out = await upsert_daily_metric(
        db, user_id=1, for_date=date(2026, 5, 11),
        data={
            "sleep_score": 81,
            "hrv_status": 72,
            "body_battery": 39,
            "resting_hr": 46,
            "stress_level": 25,
            "steps": 1959,
            "raw_data": {"v": 2},
        },
    )
    assert out is existing  # same row, updated in place
    assert out.sleep_score == 81
    assert out.hrv_status == 72
    assert out.body_battery == 39
    assert out.resting_hr == 46
    assert out.stress_level == 25
    # steps was non-null on existing row — we must NOT overwrite real data
    assert out.steps == 200
    assert out.raw_data == {"v": 2}  # raw_data always refreshes


@pytest.mark.asyncio
async def test_partial_sync_does_not_clobber_real_data():
    """The morning sync wrote sleep_score=81 + steps=1959. A later partial
    sync that only returned steps (and got null sleep) must not wipe sleep."""
    existing = DailyMetric(
        user_id=1, date=date(2026, 5, 11),
        sleep_score=81, hrv_status=72, body_battery=None,
        resting_hr=46, stress_level=None, steps=1959,
        source="garmin", raw_data={"v": 1},
    )
    db = _FakeDB(existing=existing)
    await upsert_daily_metric(
        db, user_id=1, for_date=date(2026, 5, 11),
        data={
            "sleep_score": None,  # later sync got nothing for sleep
            "hrv_status": None,
            "body_battery": 50,   # new value
            "resting_hr": None,
            "stress_level": None,
            "steps": 2400,        # incremental update
            "raw_data": {"v": 2},
        },
    )
    # Existing non-null values preserved
    assert existing.sleep_score == 81
    assert existing.hrv_status == 72
    assert existing.resting_hr == 46
    # NULL → 50 backfill applied
    assert existing.body_battery == 50
    # steps was non-null; do not overwrite even with newer value
    assert existing.steps == 1959


@pytest.mark.asyncio
async def test_update_preserves_recorded_at_partition_key():
    """Regression: daily_metrics is a TimescaleDB hypertable partitioned by
    recorded_at. Bumping recorded_at to now() on an in-place update moves the
    row across chunk boundaries whenever a previously-synced *past* day is
    re-synced after the weekly chunk boundary has advanced — TimescaleDB
    rejects the cross-chunk UPDATE (CheckViolationError) and aborts the whole
    sync. The upsert must NOT mutate recorded_at on an existing row."""
    original = datetime(2026, 6, 5, 23, 3, 12, tzinfo=timezone.utc)
    existing = DailyMetric(
        user_id=1, date=date(2026, 6, 5),
        recorded_at=original,
        sleep_score=None, hrv_status=None, body_battery=None,
        resting_hr=None, stress_level=None, steps=200,
        source="garmin", raw_data={"v": 1},
    )
    db = _FakeDB(existing=existing)
    await upsert_daily_metric(
        db, user_id=1, for_date=date(2026, 6, 5),
        data={"sleep_score": 81, "raw_data": {"v": 2}},
    )
    # Real data updated...
    assert existing.sleep_score == 81
    assert existing.raw_data == {"v": 2}
    # ...but the partition key stays put so the row never crosses chunks.
    assert existing.recorded_at == original


@pytest.mark.asyncio
async def test_existing_row_no_new_data_is_noop():
    existing = DailyMetric(
        user_id=1, date=date(2026, 5, 11),
        sleep_score=81, hrv_status=72, body_battery=39,
        resting_hr=46, stress_level=25, steps=1959,
        source="garmin", raw_data=None,
    )
    db = _FakeDB(existing=existing)
    flushes_before = db.flushes
    out = await upsert_daily_metric(
        db, user_id=1, for_date=date(2026, 5, 11),
        data={"sleep_score": None, "raw_data": None},
    )
    assert out is existing
    # No fields changed → no flush issued
    assert db.flushes == flushes_before
