"""Coach-brief 4-trigger refresh policy (July 2026).

The brief regenerates on exactly four triggers and nothing else:
  1. Morning   — scheduler sweep, once in the athlete's local morning.
  2. Workout   — a Garmin sync that lands a NEW activity busts the cache;
                 a metrics-only sync does NOT.
  3. Missed    — scheduler sweep, once when a planned session's window passed
                 unridden.
  4. Evening   — scheduler sweep, once in the athlete's local evening.
Plus force=True (manual refresh), which always regenerates.

These tests are mock-based (the suite has no live DB): get_or_generate_brief
is patched to a spy so we assert ONLY the refresh policy, not LLM output.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import app.services.coach_service as cs
import app.services.garmin_sync_service as sync_mod
from app.models.athlete_profile import AthleteProfile

# Europe/Berlin in July = UTC+2. Pick UTC instants that land the athlete-local
# clock squarely inside each window.
BERLIN_MORNING_UTC = datetime(2026, 7, 20, 5, 0, tzinfo=timezone.utc)   # 07:00 local
BERLIN_MIDDAY_UTC = datetime(2026, 7, 20, 10, 0, tzinfo=timezone.utc)   # 12:00 local
BERLIN_EVENING_UTC = datetime(2026, 7, 20, 17, 0, tzinfo=timezone.utc)  # 19:00 local
BERLIN_NIGHT_UTC = datetime(2026, 7, 20, 20, 0, tzinfo=timezone.utc)    # 22:00 local
BERLIN_PREDAWN_UTC = datetime(2026, 7, 20, 2, 0, tzinfo=timezone.utc)   # 04:00 local


def _profile(goals=None):
    return AthleteProfile(user_id=1, timezone="Europe/Berlin", goals=goals or {})


def _spy_brief():
    """Patch get_or_generate_brief with an AsyncMock spy."""
    return patch.object(cs, "get_or_generate_brief", new=AsyncMock())


# ─── Morning trigger ────────────────────────────────────────────────────────


async def test_morning_fires_once_in_local_morning():
    profile = _profile()
    db = AsyncMock()
    with _spy_brief() as _g, patch.object(
        cs, "_has_missed_session_today", new=AsyncMock(return_value=False)
    ):
        fired = await cs.refresh_brief_scheduled_triggers(
            db, profile, now_utc=BERLIN_MORNING_UTC
        )
        assert fired == ["morning"]
        assert cs.get_or_generate_brief.await_count == 1
        assert cs.get_or_generate_brief.await_args.kwargs.get("force") is True
        # Marker persisted → a second sweep the same morning is a no-op.
        again = await cs.refresh_brief_scheduled_triggers(
            db, profile, now_utc=BERLIN_MORNING_UTC + timedelta(hours=1)
        )
        assert again == []
        assert cs.get_or_generate_brief.await_count == 1


async def test_no_refresh_before_local_morning():
    profile = _profile()
    db = AsyncMock()
    with _spy_brief(), patch.object(
        cs, "_has_missed_session_today", new=AsyncMock(return_value=False)
    ):
        fired = await cs.refresh_brief_scheduled_triggers(
            db, profile, now_utc=BERLIN_PREDAWN_UTC
        )
        assert fired == []
        assert cs.get_or_generate_brief.await_count == 0


# ─── Evening trigger ────────────────────────────────────────────────────────


async def test_evening_fires_once_after_morning_already_fired():
    # Morning already fired today; the same day's evening sweep fires once more.
    profile = _profile(goals={"brief_refresh": {"morning": "2026-07-20"}})
    db = AsyncMock()
    with _spy_brief(), patch.object(
        cs, "_has_missed_session_today", new=AsyncMock(return_value=False)
    ):
        fired = await cs.refresh_brief_scheduled_triggers(
            db, profile, now_utc=BERLIN_EVENING_UTC
        )
        assert fired == ["evening"]
        # Deduped — a later evening sweep the same day does nothing.
        again = await cs.refresh_brief_scheduled_triggers(
            db, profile, now_utc=BERLIN_NIGHT_UTC
        )
        assert "evening" not in again


# ─── Missed trigger ─────────────────────────────────────────────────────────


async def test_missed_fires_once_when_session_missed():
    # Morning + evening already fired; only the missed trigger is eligible.
    profile = _profile(
        goals={"brief_refresh": {"morning": "2026-07-20", "evening": "2026-07-20"}}
    )
    db = AsyncMock()
    with _spy_brief(), patch.object(
        cs, "_has_missed_session_today", new=AsyncMock(return_value=True)
    ):
        fired = await cs.refresh_brief_scheduled_triggers(
            db, profile, now_utc=BERLIN_NIGHT_UTC
        )
        assert fired == ["missed"]
        assert cs.get_or_generate_brief.await_count == 1
        # Not twice — the marker dedups a second night sweep.
        again = await cs.refresh_brief_scheduled_triggers(
            db, profile, now_utc=BERLIN_NIGHT_UTC + timedelta(hours=1)
        )
        assert again == []
        assert cs.get_or_generate_brief.await_count == 1


async def test_missed_does_not_fire_when_athlete_trained():
    profile = _profile(
        goals={"brief_refresh": {"morning": "2026-07-20", "evening": "2026-07-20"}}
    )
    db = AsyncMock()
    with _spy_brief(), patch.object(
        cs, "_has_missed_session_today", new=AsyncMock(return_value=False)
    ):
        fired = await cs.refresh_brief_scheduled_triggers(
            db, profile, now_utc=BERLIN_NIGHT_UTC
        )
        assert fired == []
        assert cs.get_or_generate_brief.await_count == 0


# ─── _has_missed_session_today signal ───────────────────────────────────────


def _missed_db(day_plans, acts):
    db = MagicMock()

    async def execute(stmt):  # noqa: ANN001
        low = str(stmt).lower()
        result = MagicMock()
        if "planned_workouts" in low:
            result.scalars.return_value.all.return_value = day_plans
        else:  # activities
            result.scalars.return_value.all.return_value = acts
        return result

    db.execute = AsyncMock(side_effect=execute)
    return db


async def test_missed_signal_true_when_planned_session_unridden():
    today = date(2026, 7, 20)
    plans = [SimpleNamespace(template_id="sweet_spot_2x20", title="Sweet Spot")]
    db = _missed_db(plans, [])  # no activities today
    assert await cs._has_missed_session_today(db, 1, today) is True


async def test_missed_signal_false_on_rest_day():
    today = date(2026, 7, 20)
    plans = [SimpleNamespace(template_id="rest_day", title="Rest Day")]
    db = _missed_db(plans, [])
    assert await cs._has_missed_session_today(db, 1, today) is False


async def test_missed_signal_false_when_ride_completed():
    today = date(2026, 7, 20)
    plans = [SimpleNamespace(template_id="sweet_spot_2x20", title="Sweet Spot")]
    ride = SimpleNamespace(tss=60.0, sport="cycling")
    db = _missed_db(plans, [ride])
    assert await cs._has_missed_session_today(db, 1, today) is False


async def test_missed_signal_false_when_no_planned_session():
    today = date(2026, 7, 20)
    db = _missed_db([], [])
    assert await cs._has_missed_session_today(db, 1, today) is False


# ─── Workout trigger (Garmin sync) ──────────────────────────────────────────


def _sync_db():
    db = MagicMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None  # no AthleteProfile → default tz
    db.execute = AsyncMock(return_value=res)
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    return db


def _sync_patches(activity_count: int):
    """Patch every sync sub-step so only the brief-invalidation policy is under
    test. Returns the invalidate spy inside the `with` via the patch object."""
    return patch.multiple(
        sync_mod,
        create_garmin_client_for_user=AsyncMock(return_value=MagicMock()),
        sync_activities=AsyncMock(return_value=activity_count),
        sync_daily_metrics=AsyncMock(return_value=3),
        _refresh_period_report_cache=AsyncMock(),
        invalidate_coach_brief_cache=AsyncMock(),
    )


async def test_new_activity_sync_busts_the_brief_cache():
    cred = SimpleNamespace(
        user_id=1,
        last_sync_at=datetime.now(timezone.utc) - timedelta(hours=1),  # incremental
        sync_status="ok",
        # The stand-in has to carry what the real credential carries: the sync
        # reads these to decide whether the biometrics and the backfills are due.
        backoff_until=None,
        metrics_synced_at=None,
        maintenance_at=None,
    )
    db = _sync_db()
    with _sync_patches(activity_count=2):
        await sync_mod.sync_user_garmin(db, cred)
        sync_mod.invalidate_coach_brief_cache.assert_awaited_once_with(db, 1)


async def test_metrics_only_sync_does_not_bust_the_brief_cache():
    cred = SimpleNamespace(
        user_id=1,
        last_sync_at=datetime.now(timezone.utc) - timedelta(hours=1),
        sync_status="ok",
        backoff_until=None,
        metrics_synced_at=None,
        maintenance_at=None,
    )
    db = _sync_db()
    with _sync_patches(activity_count=0):  # sleep/HRV/RHR only, no new ride
        await sync_mod.sync_user_garmin(db, cred)
        sync_mod.invalidate_coach_brief_cache.assert_not_awaited()


async def test_invalidate_helper_preserves_audit_rows():
    """The cache-bust deletes briefs but never absorption/modification audit
    rows (dedup + undo-window state lives there)."""
    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    await sync_mod.invalidate_coach_brief_cache(db, 1)
    db.execute.assert_awaited_once()
    sql = str(db.execute.await_args.args[0]).lower()
    assert "delete" in sql and "coach_briefs" in sql
    db.commit.assert_awaited_once()
