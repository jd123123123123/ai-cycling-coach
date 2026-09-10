from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
import math
import pytest
from fastapi import HTTPException, FastAPI
from fastapi.testclient import TestClient
from app.api.crew_chat import get_ride_telemetry, router
from app.services.crew_ride_telemetry import chart_samples

def test_samples_keep_alignment_gaps_and_strip_unrelated_fields():
    raw={'power':[100,None,200,300], 'heart_rate':[120,125,None,130], 'altitude':[-5,0,10,20], 'latitude':[1,2,3,4]}
    points=chart_samples(raw)
    assert points[1]['power'] is None and points[1]['heart_rate']==125
    assert points[2]['heart_rate'] is None and points[2]['power']==200
    assert points[0]['altitude']==-5
    assert set(points[0])=={'position','power','heart_rate','altitude','cadence','distance','grade_pct'}

def test_downsampling_is_bounded_and_averages_real_measurements_only():
    points=chart_samples({'power':[100,300]*500,'heart_rate':[None]*1000},max_points=100)
    assert len(points)==100
    assert all(p['power']==200 and p['heart_rate'] is None for p in points)
    assert chart_samples({'power':[True,math.inf,math.nan,-2]})[0]['power'] is None

@pytest.mark.asyncio
async def test_membership_and_ride_scope_precede_stream_access():
    db=AsyncMock()
    with patch('app.api.crew_chat.require_membership',AsyncMock(return_value=SimpleNamespace(crew_id=9))) as membership, patch('app.api.crew_chat._crew_ride_or_404',AsyncMock(side_effect=HTTPException(404))) as scoped:
        with pytest.raises(HTTPException):
            await get_ride_telemetry(7,SimpleNamespace(id=42),db)
    membership.assert_awaited_once_with(db,42)
    scoped.assert_awaited_once_with(db,activity_id=7,crew_id=9)
    db.execute.assert_not_awaited()

@pytest.mark.asyncio
async def test_stream_lookup_matches_authorized_owner_and_ride():
    db=AsyncMock();result=MagicMock();result.scalar_one_or_none.return_value={'power':[150,200]};profile_result=MagicMock();profile_result.one_or_none.return_value=None;db.execute.side_effect=[result,profile_result]
    with patch('app.api.crew_chat.require_membership',AsyncMock(return_value=SimpleNamespace(crew_id=9))), patch('app.api.crew_chat._crew_ride_or_404',AsyncMock(return_value=SimpleNamespace(user_id=81,started_at=None,sport='cycling'))):
        response=await get_ride_telemetry(7,SimpleNamespace(id=42),db)
    query=db.execute.await_args_list[0].args[0].compile()
    profile_query=db.execute.await_args_list[1].args[0].compile()
    assert profile_query.params['user_id_1']==81
    assert query.params['activity_id_1']==7 and query.params['user_id_1']==81
    assert response['activity_id']==7 and len(response['samples'])==2

def test_telemetry_requires_authentication():
    app=FastAPI();app.include_router(router)
    response=TestClient(app).get('/crews/me/rides/7/telemetry')
    assert response.status_code in (401,403)


def test_grade_uses_distance_and_not_sample_index():
    points=chart_samples({'altitude':[0,5,10,5], 'distance':[0,100,200,300]})
    assert [p['grade_pct'] for p in points]==[5,5,0,-5]
    assert all(p['grade_pct'] is None for p in chart_samples({'altitude':[0,10,20]}))
    assert all(p['grade_pct'] is None for p in chart_samples({'altitude':[0,10,20], 'distance':[0,0,1]}))
    assert chart_samples({'altitude':[0,10,None,30], 'distance':[0,100,200,300]})[1]['grade_pct'] is None
    assert chart_samples({'altitude':[0,10,20], 'distance':[100,200,0]})[1]['grade_pct'] is None


def test_zones_use_riders_ftp_at_ride_date_and_stored_pulse_threshold():
    from datetime import datetime, timezone
    from app.services.crew_ride_telemetry import ride_zones
    profile=SimpleNamespace(ftp_watts=300,ftp_history=[
        {'ftp_watts':240,'measured_at':'2026-08-01T00:00:00Z'},
        {'ftp_watts':300,'measured_at':'2026-10-01T00:00:00Z'},
        {'ftp_watts':999,'measured_at':'invalid'},
    ],lthr_cycling=160,max_heart_rate=190)
    zones=ride_zones(profile,datetime(2026,9,10,tzinfo=timezone.utc))
    assert zones['power']['reference']==240
    assert zones['power']['basis']=='ftp_history'
    assert zones['power']['bands'][0]['upper']==132
    assert zones['heart_rate']['reference']==160
    assert zones['heart_rate']['basis']=='lthr_current'
    assert zones['heart_rate']['bands'][-1]['upper'] is None
    profile.lthr_cycling=None
    assert ride_zones(profile,None)['heart_rate']['basis']=='hrmax_current'
    assert ride_zones(profile,None)['power']['basis']=='ftp_current'
    assert 'power' not in ride_zones(profile,None,'running')
    assert ride_zones(None,None)=={}
    assert ride_zones(SimpleNamespace(ftp_watts=-1,max_heart_rate=None),None)=={}
