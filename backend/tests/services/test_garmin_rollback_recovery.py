"""Real async ORM regressions: rollback expires even primary-key attributes."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import DateTime, Integer, String, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from app.config import settings
from app.database import Base
from app.models.garmin_credential import GarminCredential
from app.models.user import User
from app.services import garmin_sync_service as gss
from app.services.garmin_client import GarminAuthError, GarminRateLimitError, GarminTransientError

@pytest.fixture
async def sessions(monkeypatch):
    monkeypatch.setattr(settings, 'GARMIN_ENCRYPTION_KEY', Fernet.generate_key().decode())
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[User.__table__, GarminCredential.__table__]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        for uid in (1, 2):
            db.add(User(id=uid, email=f'rider{uid}@example.test', hashed_password='test'))
            db.add(GarminCredential(user_id=uid, encrypted_email='test', encrypted_password='test', sync_enabled=True, sync_status='ok', auth_failures=0))
        await db.commit()
    yield factory
    await engine.dispose()

@pytest.mark.parametrize('fails', [False, True])
async def test_one_rollback_cannot_abort_other_riders(sessions, monkeypatch, fails):
    import app.scheduler as jobs
    monkeypatch.setattr(jobs, 'async_session_maker', sessions)
    visits, used_sessions = [], []
    async def sync(db, cred):
        uid = cred.user_id
        visits.append(uid)
        used_sessions.append(db)
        await db.execute(select(User.id))
        if uid == 1:
            await db.rollback()
            if fails:
                raise RuntimeError('first account failed')
        return {'activities_synced': 1, 'metrics_days': 1}
    monkeypatch.setattr(jobs, 'sync_user_garmin', sync)
    await jobs.run_all_user_syncs()
    assert visits == [1, 2]
    assert used_sessions[0] is not used_sessions[1]

async def test_pending_rollback_does_not_poison_next_rider(sessions, monkeypatch):
    import app.scheduler as jobs
    monkeypatch.setattr(jobs, 'async_session_maker', sessions)
    visits = []
    async def sync(db, cred):
        uid = cred.user_id
        visits.append(uid)
        if uid == 1:
            db.add(User(email='rider1@example.test', hashed_password='duplicate'))
            await db.flush()
        cred.sync_status = 'ok'
        await db.commit()
        return {'activities_synced': 0, 'metrics_days': 1}
    monkeypatch.setattr(jobs, 'sync_user_garmin', sync)
    await jobs.run_all_user_syncs()
    assert visits == [1, 2]

@pytest.mark.parametrize('error,expected', [(GarminRateLimitError,'rate_limited'),(GarminTransientError,'unavailable'),(GarminAuthError,'auth_retry'),(RuntimeError,'error')])
async def test_original_error_and_retry_state_survive_rollback(sessions, monkeypatch, error, expected):
    monkeypatch.setattr(gss, 'create_garmin_client_for_user', AsyncMock(return_value=object()))
    monkeypatch.setattr(gss, 'sync_activities', AsyncMock(side_effect=error('original failure')))
    async with sessions() as db:
        cred = (await db.execute(select(GarminCredential).where(GarminCredential.user_id == 1))).scalar_one()
        with pytest.raises(error, match='original failure'):
            await gss.sync_user_garmin(db, cred)
    async with sessions() as db:
        cred = (await db.execute(select(GarminCredential).where(GarminCredential.user_id == 1))).scalar_one()
        assert cred.sync_status == expected
        assert cred.sync_enabled is True
        if error is GarminAuthError:
            assert cred.auth_failures == 1
        if error is not RuntimeError:
            assert cred.backoff_until is not None

async def test_manual_sync_returns_after_maintenance_rollback(sessions, monkeypatch):
    from app.api import garmin
    async def sync(db, cred):
        cred.last_sync_at = datetime.now(timezone.utc)
        cred.sync_status = 'ok'
        await db.commit()
        await db.execute(select(User.id))
        await db.rollback()
        return {'activities_synced': 1, 'metrics_days': 1}
    monkeypatch.setattr(garmin, 'sync_user_garmin', sync)
    async with sessions() as db:
        user = await db.get(User, 1)
        response = await garmin.trigger_garmin_sync(current_user=user, db=db)
        assert response.activities_synced == 1

class StreamTestBase(DeclarativeBase):
    pass
class Ride(StreamTestBase):
    __tablename__ = 'test_rides'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer)
    external_id: Mapped[str] = mapped_column(String)
    sport: Mapped[str] = mapped_column(String, default='cycling')
    source: Mapped[str] = mapped_column(String, default='garmin')
    started_at: Mapped[datetime] = mapped_column(DateTime)
class Stream(StreamTestBase):
    __tablename__ = 'test_streams'
    activity_id: Mapped[int] = mapped_column(primary_key=True)
class Profile(StreamTestBase):
    __tablename__ = 'test_profiles'
    user_id: Mapped[int] = mapped_column(primary_key=True)
    ftp: Mapped[int] = mapped_column(Integer)

async def test_bad_stream_does_not_expire_next_ride_or_profile(monkeypatch):
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(StreamTestBase.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        db.add(Profile(user_id=1, ftp=250))
        for rid in (1, 2):
            db.add(Ride(id=rid, user_id=1, external_id=str(rid), started_at=datetime(2026, 9, rid)))
        await db.commit()
    for name, value in [('Activity',Ride),('ActivityStream',Stream),('AthleteProfile',Profile),('_STREAMS_UNAVAILABLE',set()),('INTER_REQUEST_DELAY',0)]:
        monkeypatch.setattr(gss, name, value)
    visits = []
    async def store(db, user_id, client, activity, garmin_id, profile, **kwargs):
        visits.append((activity.id, profile.ftp))
        if activity.id == 2:
            raise RuntimeError('malformed stream')
        await db.commit()
        return True
    monkeypatch.setattr(gss, '_fetch_and_store_streams', store)
    async with factory() as db:
        assert await gss.backfill_missing_streams(db, 1, object()) == 1
    assert visits == [(2, 250), (1, 250)]
    assert gss._STREAMS_UNAVAILABLE == {2}
    await engine.dispose()
