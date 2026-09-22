from datetime import datetime, timezone
from types import SimpleNamespace as Obj
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app.api.activities import get_ride_chart, router
from app.services.ride_chart import chart_samples, ftp_context, zone_seconds, best_efforts, contributions


def test_aligned_1hz_chart_does_not_invent_channels_or_stretch_time():
    data = chart_samples({'power': [100, 300, None, 200], 'speed': [10, 10], 'altitude': [-5, 0, 5, 10]})
    assert [p['seconds'] for p in data] == [0, 1, 2, 3]
    assert data[0]['speed'] == 36 and data[2]['speed'] is None
    assert data[2]['power'] is None and data[0]['altitude'] == -5
    assert all(p['distance'] is None and p['grade'] is None and p['cadence'] is None for p in data)
    assert set(data[0]) == {'seconds', 'distance', 'grade', 'cadence', 'power', 'heart_rate', 'altitude', 'speed'}
    assert len(chart_samples({'power': [100, 300]*1000})) == 360


def test_zone_minutes_use_full_resolution_not_averaged_chart():
    raw = {'power': [0, 300]*300}
    zones = zone_seconds(raw, 200)
    assert zones[0] == 300 and zones[5] == 300 and sum(zones) == 600
    assert zone_seconds({'power': [None, -4, True]}, 200) == [None]*7
    assert zone_seconds(raw, None) == [None]*7


def test_only_ftp_at_or_before_ride_can_define_historical_zones():
    ride = Obj(started_at=datetime(2026, 9, 21, tzinfo=timezone.utc), ftp_watts_at_scoring=None)
    profile = Obj(ftp_watts=999, timezone='Europe/Berlin', ftp_history=[
        {'measured_at': '2026-09-01T12:00:00Z', 'ftp_watts': 250},
        {'measured_at': '2026-10-01T12:00:00Z', 'ftp_watts': 300},
        {'measured_at': 'bad', 'ftp_watts': 400},
    ])
    ftp, history = ftp_context(ride, profile)
    assert ftp == 250 and len(history) == 1
    ride.ftp_watts_at_scoring = 255
    assert ftp_context(ride, profile)[0] == 255
    ride.ftp_watts_at_scoring = None
    assert ftp_context(ride, Obj(ftp_watts=999, ftp_history=[])) == (None, [])


def test_best_efforts_never_invent_short_duration_records():
    efforts = best_efforts({'1': 800, '5': 600, '1200': 240, '1800': 220}, [{'1': 850, '5': 550}, None])
    assert [e['seconds'] for e in efforts] == [1, 5, 1200]
    assert efforts[0]['previous'] == 850 and efforts[-1]['previous'] is None


def test_contributions_unknown_is_not_zero():
    ride = Obj(started_at=datetime(2026, 9, 21, tzinfo=timezone.utc), distance_meters=100000, duration_seconds=12000, elevation_gain_m=1000)
    before = Obj(started_at=datetime(2026, 8, 1, tzinfo=timezone.utc), distance_meters=20000, duration_seconds=3600, elevation_gain_m=None)
    data = contributions(ride, [before], timezone.utc)
    assert data['metrics'][0]['before'] == 20 and data['metrics'][0]['added'] == 100
    assert data['metrics'][2]['before'] is None


def test_chart_requires_authentication():
    app = FastAPI(); app.include_router(router)
    assert TestClient(app).get('/activities/307/ride-chart').status_code in (401, 403)


@pytest.mark.asyncio
async def test_ownership_checked_before_reading_any_chart():
    db = AsyncMock()
    with patch('app.api.activities.activity_service.get_activity', AsyncMock(return_value=None)) as owned:
        with pytest.raises(HTTPException) as error:
            await get_ride_chart(307, Obj(id=42), db)
    assert error.value.status_code == 404
    owned.assert_awaited_once_with(db=db, user_id=42, activity_id=307)
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_all_history_queries_are_owner_and_past_scoped():
    at = datetime(2026, 9, 21, tzinfo=timezone.utc)
    activity = Obj(started_at=at, ftp_watts_at_scoring=250, distance_meters=1000, duration_seconds=120, elevation_gain_m=10)
    db = AsyncMock()
    stream = MagicMock(); stream.one_or_none.return_value = Obj(streams={'power':[100, 200]}, mmp_curve={'1':200})
    profile = MagicMock(); profile.one_or_none.return_value = None
    prior = MagicMock(); prior.all.return_value = []
    curves = MagicMock(); curves.scalars.return_value.all.return_value = []
    db.execute.side_effect = [stream, profile, prior, curves]
    with patch('app.api.activities.activity_service.get_activity', AsyncMock(return_value=activity)):
        result = await get_ride_chart(307, Obj(id=42), db)
    assert result['ftp_at_ride'] == 250
    for call in db.execute.await_args_list:
        params = call.args[0].compile().params
        assert params['user_id_1'] == 42
    for call in db.execute.await_args_list[2:]:
        stmt = str(call.args[0])
        assert 'activities.started_at < ' in stmt and 'activities.id != ' in stmt
    assert 'LIMIT' not in str(db.execute.await_args_list[2].args[0])
