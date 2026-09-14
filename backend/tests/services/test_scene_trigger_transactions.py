"""Real async savepoints for optional scenes; provider work stays caller-owned.

SQLite verifies ORM rollback/flush ownership, not PostgreSQL RLS behavior.
"""
from datetime import datetime, timezone
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.models.garage import RiderBackdrop
from app.services import ride_economy, stage_unlock, garmin_sync_service as gss
from app.services.earn_modifiers import RideFacts
from test_garmin_stream_ingest import detail_payload, FakeClient, PROFILE

START = datetime(2026, 9, 14, 9, tzinfo=timezone.utc)


def ride():
    return NS(id=200, user_id=1, sport='cycling', started_at=START,
              distance_meters=200000, duration_seconds=28800,
              elevation_gain_m=0, average_power=None, tss=None, raw_data={})


@pytest.fixture
async def db(monkeypatch):
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as connection:
        await connection.run_sync(RiderBackdrop.__table__.create)
        await connection.execute(text('CREATE TABLE import_markers (id INTEGER PRIMARY KEY)'))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        # A real outer DML transaction before the savepoint (SQLite caveat).
        await session.execute(text('INSERT INTO import_markers VALUES (1)'))
        monkeypatch.setattr(stage_unlock, 'warm', Mock())
        monkeypatch.setattr(ride_economy, '_ride_facts', AsyncMock(return_value=RideFacts(distance_m=200000, duration_s=28800)))
        yield session
    await engine.dispose()


async def test_scene_insert_failure_rolls_back_only_optional_savepoint(db, monkeypatch):
    async def fail(session, *args, **kwargs):
        session.add(RiderBackdrop(user_id=1, backdrop=None, activity_id=200))
        await session.flush()  # Real IntegrityError, leaves ORM rollback pending without savepoint.
    monkeypatch.setattr(ride_economy, '_open_backdrops', fail)
    assert await ride_economy.check_backdrops(db, 1, ride(), commit=False) == []
    assert (await db.execute(text('SELECT id FROM import_markers'))).scalar_one() == 1
    await db.commit()  # Import can still complete after the reward failed.


async def test_commit_false_preserves_outer_rollback_and_does_not_warm(db):
    assert await ride_economy.check_backdrops(db, 1, ride(), commit=False) == ['coast_road', 'startrampe']
    stage_unlock.warm.assert_not_called()
    await db.rollback()
    assert (await db.execute(select(RiderBackdrop))).scalars().all() == []
    assert (await db.execute(text('SELECT id FROM import_markers'))).all() == []


async def test_repeat_is_insert_idempotent_and_commit_true_warms_once(db):
    for _ in range(2):
        await ride_economy.check_backdrops(db, 1, ride(), commit=True)
    assert len((await db.execute(select(RiderBackdrop))).scalars().all()) == 2
    stage_unlock.warm.assert_called_once_with(1, ['coast_road', 'startrampe'])


async def test_short_ride_checks_challenges_before_odometer_minimum(db, monkeypatch):
    activity = ride()
    activity.distance_meters = 500
    check = AsyncMock(return_value=[])
    monkeypatch.setattr(ride_economy, 'check_backdrops', check)
    result = await ride_economy.settle(db, 1, activity, 0)
    check.assert_awaited_once_with(db, 1, activity)
    assert result['km_accrued'] == 0


async def test_zero_coin_does_not_need_gear_lookup_to_unlock(db, monkeypatch):
    from app.services import gear
    lookup = AsyncMock(side_effect=RuntimeError('equipment unavailable'))
    monkeypatch.setattr(gear, 'equipped_ids', lookup)
    result = await ride_economy._pay_gear(db, 1, ride(), 0, 0,
                                        facts=RideFacts(distance_m=200000, duration_s=28800))
    assert result == 0
    assert len((await db.execute(select(RiderBackdrop))).scalars().all()) == 2
    lookup.assert_not_awaited()


@pytest.mark.parametrize('commit', [False, True])
async def test_garmin_rechecks_after_streams_and_weather_are_stored(db, monkeypatch, commit):
    activity = ride()
    weather = {'hourly': {'precipitation': [2], 'temperature_2m': [16]}}
    state = {'stored': False}
    async def ingest(*args, **kwargs):
        assert kwargs['weather'] == weather
        assert kwargs['commit'] is commit
        state['stored'] = True
        if commit:
            await db.commit()
        return NS(np_watts=0, cp=None)
    async def facts(*args, **kwargs):
        assert state['stored'], 'challenge facts must see the newly stored stream'
        return RideFacts(distance_m=60000, duration_s=10800, was_wet=True)
    monkeypatch.setattr(gss, 'ingest_activity_streams', ingest)
    monkeypatch.setattr(gss, 'fetch_ride_weather', AsyncMock(return_value=weather))
    monkeypatch.setattr(ride_economy, '_ride_facts', facts)
    # Use real earned_by rules with newly available wetness.
    client = FakeClient({42: detail_payload(60, directLatitude=47, directLongitude=8, directHeartRate=140)})
    assert await gss._fetch_and_store_streams(db, 1, client, activity, 42, PROFILE, commit=commit)
    opened = (await db.execute(select(RiderBackdrop.backdrop))).scalars().all()
    assert 'waschanlage' in opened
    if commit:
        stage_unlock.warm.assert_called_once()
    else:
        stage_unlock.warm.assert_not_called()
        await db.rollback()
        assert (await db.execute(select(RiderBackdrop))).scalars().all() == []


async def test_garmin_scene_failure_keeps_completed_stream_import(db, monkeypatch):
    async def ingest(*args, **kwargs):
        await db.execute(text('INSERT INTO import_markers VALUES (2)'))
        return NS(np_watts=0, cp=None)
    async def fail(session, *args, **kwargs):
        session.add(RiderBackdrop(user_id=1, backdrop=None, activity_id=200))
        await session.flush()
    monkeypatch.setattr(gss, 'ingest_activity_streams', ingest)
    monkeypatch.setattr(ride_economy, '_open_backdrops', fail)
    client = FakeClient({42: detail_payload(60, directHeartRate=140)})
    assert await gss._fetch_and_store_streams(db, 1, client, ride(), 42, PROFILE, commit=False)
    assert (await db.execute(text('SELECT id FROM import_markers ORDER BY id'))).scalars().all() == [1, 2]
    await db.commit()


@pytest.mark.parametrize('award_result', [None, {'total': 0}, RuntimeError('coin ledger unavailable')])
async def test_activity_creation_settles_independently_of_coin_award(monkeypatch, award_result):
    from unittest.mock import MagicMock
    from app.models.athlete_profile import AthleteProfile
    from app.schemas.activity import ActivityCreate
    from app.services import activity_service, rewards, streak
    from app.services.rehearsal import retro_match
    session = MagicMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.add.side_effect = lambda activity: setattr(activity, 'id', 200)
    monkeypatch.setattr(streak, 'build_streak', AsyncMock(return_value={'streak': 1}))
    award = AsyncMock(side_effect=award_result) if isinstance(award_result, Exception) else AsyncMock(return_value=award_result)
    monkeypatch.setattr(rewards, 'award_ride', award)
    monkeypatch.setattr(retro_match, 'attach_actual_if_matching', AsyncMock())
    settle = AsyncMock()
    monkeypatch.setattr(ride_economy, 'settle', settle)
    activity = await activity_service.create_activity(
        session, 1, ActivityCreate(sport='cycling', started_at=START, duration_seconds=28800, distance_meters=200000),
        AthleteProfile(user_id=1, ftp_watts=250, timezone='Europe/Berlin'),
    )
    assert activity.id == 200
    settle.assert_awaited_once_with(session, 1, activity, 0)
    assert session.begin_nested.called


async def test_gear_lookup_failure_cannot_prevent_measured_unlock(db, monkeypatch):
    from app.services import gear
    monkeypatch.setattr(gear, 'equipped_ids', AsyncMock(side_effect=RuntimeError('equipment unavailable')))
    with pytest.raises(RuntimeError, match='equipment unavailable'):
        await ride_economy._pay_gear(db, 1, ride(), 100, 0,
                                    facts=RideFacts(distance_m=200000, duration_s=28800))
    assert (await db.execute(select(RiderBackdrop.backdrop))).scalars().all() == ['coast_road', 'startrampe']


async def test_real_coin_flush_failure_leaves_activity_and_scene_transaction_usable(db, monkeypatch):
    from unittest.mock import MagicMock
    from app.models.activity import Activity
    from app.models.athlete_profile import AthleteProfile
    from app.schemas.activity import ActivityCreate
    from app.services import activity_service, rewards, streak
    from app.services.rehearsal import retro_match

    class IngestSession:
        """Activity storage marker; reward writes use a real async ORM session."""
        pending_activity = False
        def add(self, row):
            if isinstance(row, Activity):
                row.id = 200
                self.pending_activity = True
            else:
                db.add(row)
        async def flush(self):
            if self.pending_activity:
                self.pending_activity = False
                await db.execute(text('INSERT INTO import_markers VALUES (2)'))
            await db.flush()
        async def refresh(self, row):
            pass
        async def execute(self, stmt):
            if 'coach_briefs' in str(stmt):
                return MagicMock()
            return await db.execute(stmt)
        def begin_nested(self):
            return db.begin_nested()

    async def fail_award(session, *args):
        session.add(RiderBackdrop(user_id=1, backdrop=None, activity_id=200))
        await session.flush()
    async def settle(session, user_id, activity, base_rc):
        assert base_rc == 0
        return await ride_economy.check_backdrops(db, user_id, activity)
    monkeypatch.setattr(streak, 'build_streak', AsyncMock(return_value={'streak': 1}))
    monkeypatch.setattr(rewards, 'award_ride', fail_award)
    monkeypatch.setattr(retro_match, 'attach_actual_if_matching', AsyncMock())
    monkeypatch.setattr(ride_economy, 'settle', settle)
    await activity_service.create_activity(
        IngestSession(), 1, ActivityCreate(sport='cycling', started_at=START, duration_seconds=28800, distance_meters=200000),
        AthleteProfile(user_id=1, ftp_watts=250, timezone='Europe/Berlin'),
    )
    assert (await db.execute(text('SELECT id FROM import_markers ORDER BY id'))).scalars().all() == [1, 2]
    assert (await db.execute(select(RiderBackdrop.backdrop))).scalars().all() == ['coast_road', 'startrampe']
    await db.commit()


async def test_manual_endpoint_commits_short_ride_unlock_in_its_outer_transaction(db, monkeypatch):
    from app.api import activities
    from app.schemas.activity import ActivityCreate
    from app.services import activity_service, plan_absorption
    activity = ride()
    activity.distance_meters = 500
    activity.duration_seconds = 180
    activity.started_at = START.replace(hour=6)
    for field in ('normalized_power', 'average_hr', 'max_hr', 'calories', 'title', 'source', 'external_id'):
        setattr(activity, field, None)
    activity.created_at = START
    monkeypatch.setattr(ride_economy, '_ride_facts', AsyncMock(return_value=RideFacts(distance_m=500, duration_s=180, start_hour=6)))
    monkeypatch.setattr(activities, 'get_or_create_profile', AsyncMock(return_value=NS()))
    monkeypatch.setattr(plan_absorption, 'absorb_new_activities', AsyncMock())
    async def create(**kwargs):
        await db.execute(text('INSERT INTO import_markers VALUES (2)'))
        await ride_economy.settle(db, 1, activity, 0)
        # The service leaves both writes inside the caller's transaction.
        assert db.in_transaction()
        return activity
    monkeypatch.setattr(activity_service, 'create_activity', create)
    result = await activities.create_activity(
        ActivityCreate(sport='cycling', started_at=activity.started_at, duration_seconds=180, distance_meters=500),
        NS(id=1), db,
    )
    assert result.id == 200
    assert not db.in_transaction()  # The endpoint committed, not the nested scene check.
    await db.rollback()
    assert (await db.execute(select(RiderBackdrop.backdrop))).scalars().all() == ['dawn_road']
    assert (await db.execute(text('SELECT id FROM import_markers ORDER BY id'))).scalars().all() == [1, 2]
