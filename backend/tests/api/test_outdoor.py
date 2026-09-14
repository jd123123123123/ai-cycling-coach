from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI,HTTPException
from fastapi.testclient import TestClient
from app.api import outdoor
from app.dependencies import get_current_active_user,get_db_for_user
from app.services.workout_export import Block

@pytest.fixture
def client(monkeypatch):
    app=FastAPI();app.include_router(outdoor.router)
    app.dependency_overrides[get_current_active_user]=lambda: SimpleNamespace(id=42)
    async def db():yield AsyncMock()
    app.dependency_overrides[get_db_for_user]=db
    async def selected(day,db,user):
        assert user.id==42
        return SimpleNamespace(title=f'Workout {day}',category='threshold'),[Block('Belastung',600,240,240,1)],SimpleNamespace(ftp_watts=240)
    monkeypatch.setattr(outdoor,'selected_workout',selected)
    return TestClient(app)

@pytest.mark.parametrize('format',['fit','zwo','mrc','erg'])
def test_selected_date_export(client,format):
    r=client.get('/outdoor/export',params={'date':'2026-10-03','format':format})
    assert r.status_code==200
    assert '2026-10-03' in r.headers['content-disposition']
    assert len(r.content)>100
    if format=='zwo':assert 'Workout 2026-10-03' in r.text

def test_invalid_payloads(client):
    for body in [{'date':'2026-10-03'},{'date':'2026-10-03','activity_id':1,'gpx':'<gpx/>'},{'date':'bad','gpx':'a'},{'date':'2026-10-03','activity_id':-1}]:
        assert client.post('/outdoor/fit',json=body).status_code==422

def test_missing_selected_day_never_exports_today(client,monkeypatch):
    async def missing(*args):raise HTTPException(404,'No selected workout')
    monkeypatch.setattr(outdoor,'selected_workout',missing)
    assert client.get('/outdoor/export?date=2026-10-03').status_code==404

@pytest.mark.asyncio
async def test_route_ownership_checked_before_reading_stream():
    class Result:
        def scalar_one_or_none(self):return None
    db=AsyncMock();db.execute.return_value=Result()
    with pytest.raises(HTTPException) as err:
        await outdoor.owned_route(outdoor.RouteRequest(date=date.today(),activity_id=7),db,SimpleNamespace(id=42))
    assert err.value.status_code==404
    stmt=db.execute.call_args.args[0]
    assert stmt.compile().params['user_id_1']==42
    assert db.execute.call_count==1

@pytest.mark.asyncio
async def test_xml_entities_rejected():
    with pytest.raises(HTTPException) as err:
        await outdoor.owned_route(outdoor.RouteRequest(date=date.today(),gpx='<!DOCTYPE gpx [<!ENTITY x "unsafe">]><gpx/>'),AsyncMock(),SimpleNamespace(id=42))
    assert err.value.status_code==422


def test_changed_workout_not_silently_exported(client):
    assert client.get('/outdoor/export',params={'date':'2026-10-03','revision':'0'*64}).status_code==409
    w=client.get('/outdoor/workout?date=2026-10-03').json()
    assert client.get('/outdoor/export',params={'date':'2026-10-03','revision':w['revision']}).status_code==200
