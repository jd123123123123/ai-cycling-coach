"""Unit tests for biometrics_snapshot.compute_today_snapshot.

Mocks the AsyncSession's execute() so nothing hits a real database — same
pattern as test_chat_multi_turn.py. Verifies:
    1. Wake pair = first sample at-or-after wake_at, now pair = latest sample.
    2. Sleep end timestamp from raw_data overrides the 04:00 UTC fallback.
    3. Missing sleep timestamp falls back to 04:00 UTC.
    4. hrv_overnight_avg / training_readiness / recovery_time_hours pass through.
    5. Cache helpers expire after SNAPSHOT_TTL.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import biometrics_snapshot
from app.services.biometrics_snapshot import (
    SNAPSHOT_TTL,
    TodaySnapshot,
    _resolve_wake_time,
    compute_today_snapshot,
    get_cached_snapshot,
    invalidate_cached_snapshot,
    store_cached_snapshot,
)


TARGET = date(2026, 5, 3)
USER_ID = 7


def _sample(metric_type: str, value: float, hour: int, minute: int = 0) -> SimpleNamespace:
    return SimpleNamespace(
        metric_type=metric_type,
        value=value,
        recorded_at=datetime(2026, 5, 3, hour, minute, tzinfo=timezone.utc),
    )


def _mock_db(daily_metric, samples):
    """Build an AsyncSession stub whose execute() returns canned scalars()."""
    db = SimpleNamespace()

    call_count = {"i": 0}

    async def _execute(_query):
        # Two calls per compute_today_snapshot: (1) DailyMetric, (2) samples.
        call_count["i"] += 1
        if call_count["i"] == 1:
            scalars = SimpleNamespace(
                first=lambda: daily_metric,
                all=lambda: ([daily_metric] if daily_metric else []),
            )
        else:
            scalars = SimpleNamespace(
                first=lambda: (samples[0] if samples else None),
                all=lambda: list(samples),
            )
        return SimpleNamespace(scalars=lambda: scalars)

    db.execute = AsyncMock(side_effect=_execute)
    return db


# ----------------------------------------------------------------------
# _resolve_wake_time
# ----------------------------------------------------------------------

class TestResolveWakeTime:
    def test_falls_back_to_06_utc_when_metric_missing(self):
        # No sleep_end_timestamp + no tz → 06:00 UTC (was 04:00 UTC; bumped
        # because Garmin's overnight HRV syncs commonly land 02–04 UTC and
        # were being filed as "wake" values).
        wake = _resolve_wake_time(None, TARGET)
        assert wake == datetime(2026, 5, 3, 6, 0, tzinfo=timezone.utc)

    def test_falls_back_when_raw_data_empty(self):
        dm = SimpleNamespace(raw_data=None)
        wake = _resolve_wake_time(dm, TARGET)
        assert wake == datetime(2026, 5, 3, 6, 0, tzinfo=timezone.utc)

    def test_athlete_tz_anchors_fallback_to_06_local(self):
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("Europe/Berlin")
        wake = _resolve_wake_time(None, TARGET, tz)
        # 06:00 Berlin on 2026-05-03 (CEST = +02:00) → 04:00 UTC
        assert wake == datetime(2026, 5, 3, 4, 0, tzinfo=timezone.utc)

    def test_uses_iso_string_sleep_end_timestamp(self):
        dm = SimpleNamespace(
            raw_data={"sleep": {"sleep_end_timestamp": "2026-05-03T06:30:00+00:00"}}
        )
        wake = _resolve_wake_time(dm, TARGET)
        assert wake == datetime(2026, 5, 3, 6, 30, tzinfo=timezone.utc)

    def test_uses_naive_iso_string_as_utc(self):
        dm = SimpleNamespace(
            raw_data={"sleep": {"sleepEndTimestampGMT": "2026-05-03T07:15:00"}}
        )
        wake = _resolve_wake_time(dm, TARGET)
        assert wake == datetime(2026, 5, 3, 7, 15, tzinfo=timezone.utc)

    def test_uses_ms_epoch(self):
        # 2026-05-03T05:00:00Z = 1777867200000 ms
        epoch_ms = int(datetime(2026, 5, 3, 5, 0, tzinfo=timezone.utc).timestamp() * 1000)
        dm = SimpleNamespace(raw_data={"sleep": {"sleep_end_timestamp": epoch_ms}})
        wake = _resolve_wake_time(dm, TARGET)
        assert wake == datetime(2026, 5, 3, 5, 0, tzinfo=timezone.utc)


# ----------------------------------------------------------------------
# compute_today_snapshot
# ----------------------------------------------------------------------

class TestComputeTodaySnapshot:
    @pytest.mark.asyncio
    async def test_pairs_wake_and_now_from_samples(self):
        # Wake at 06:30; samples span 03:00 → 18:00.
        dm = SimpleNamespace(
            raw_data={"sleep": {"sleep_end_timestamp": "2026-05-03T06:30:00Z"}},
            hrv_overnight_avg=58,
            training_readiness=72,
            recovery_time_hours=12,
        )
        samples = [
            _sample("body_battery", 40, 3),   # before wake — ignored for wake pair
            _sample("body_battery", 82, 7),   # first ≥ wake
            _sample("body_battery", 64, 18),  # latest = now
            _sample("stress", 25, 7),
            _sample("stress", 41, 18),
        ]
        db = _mock_db(dm, samples)

        snap = await compute_today_snapshot(db, USER_ID, TARGET)

        assert isinstance(snap, TodaySnapshot)
        assert snap.body_battery.wake == 82
        assert snap.body_battery.now == 64
        assert snap.body_battery.now_at == datetime(2026, 5, 3, 18, 0, tzinfo=timezone.utc)
        assert snap.stress.wake == 25
        assert snap.stress.now == 41
        assert snap.hrv_overnight_avg == 58
        assert snap.training_readiness == 72
        assert snap.recovery_time_hours == 12

    @pytest.mark.asyncio
    async def test_empty_samples_yield_none_pairs(self):
        db = _mock_db(None, [])
        snap = await compute_today_snapshot(db, USER_ID, TARGET)
        assert snap.body_battery.wake is None
        assert snap.body_battery.now is None
        assert snap.stress.wake is None
        assert snap.hrv_overnight_avg is None

    @pytest.mark.asyncio
    async def test_pre_wake_only_samples_yield_none_now(self):
        # All samples are *before* the 06:00-UTC wake fallback (overnight Garmin
        # HRV sync at ~02:00). Wake still falls back to the latest pre-wake
        # sample so we have some baseline, but `now` is None — showing a 2am
        # reading as "current" is misleading ("AS OF 02:00").
        dm = SimpleNamespace(
            raw_data=None,
            hrv_overnight_avg=None,
            training_readiness=None,
            recovery_time_hours=None,
        )
        samples = [
            _sample("body_battery", 50, 1),
            _sample("body_battery", 55, 2),
        ]
        db = _mock_db(dm, samples)
        snap = await compute_today_snapshot(db, USER_ID, TARGET)
        assert snap.body_battery.wake == 55  # latest pre-wake = baseline
        assert snap.body_battery.now is None
        assert snap.body_battery.now_at is None


# ----------------------------------------------------------------------
# Cache helpers
# ----------------------------------------------------------------------

class TestSnapshotCache:
    def setup_method(self):
        biometrics_snapshot._snapshot_cache.clear()

    def test_store_then_get_returns_snapshot(self):
        snap = TodaySnapshot(
            body_battery=biometrics_snapshot.WakeNowPair(80, 60, None),
            stress=biometrics_snapshot.WakeNowPair(20, 30, None),
            hrv_overnight_avg=55,
            training_readiness=70,
            recovery_time_hours=10,
            generated_at=datetime.now(tz=timezone.utc),
        )
        store_cached_snapshot(USER_ID, snap)
        assert get_cached_snapshot(USER_ID) is snap

    def test_expired_entry_returns_none(self):
        snap = TodaySnapshot(
            body_battery=biometrics_snapshot.WakeNowPair(80, 60, None),
            stress=biometrics_snapshot.WakeNowPair(20, 30, None),
            hrv_overnight_avg=None,
            training_readiness=None,
            recovery_time_hours=None,
            generated_at=datetime.now(tz=timezone.utc),
        )
        # Inject an artificially-old computed_at to force expiry.
        old_at = datetime.now(tz=timezone.utc) - SNAPSHOT_TTL - timedelta(seconds=1)
        biometrics_snapshot._snapshot_cache[USER_ID] = (snap, old_at)
        assert get_cached_snapshot(USER_ID) is None
        # Expired entry is also evicted.
        assert USER_ID not in biometrics_snapshot._snapshot_cache

    def test_invalidate_drops_entry(self):
        snap = TodaySnapshot(
            body_battery=biometrics_snapshot.WakeNowPair(80, 60, None),
            stress=biometrics_snapshot.WakeNowPair(20, 30, None),
            hrv_overnight_avg=None,
            training_readiness=None,
            recovery_time_hours=None,
            generated_at=datetime.now(tz=timezone.utc),
        )
        store_cached_snapshot(USER_ID, snap)
        invalidate_cached_snapshot(USER_ID)
        assert get_cached_snapshot(USER_ID) is None
