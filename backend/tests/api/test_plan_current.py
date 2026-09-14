"""The plan landing read is scoped to the rider and cannot create training."""
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user

@pytest.fixture
def endpoint():
    def make(plan=None, target=None):
        user=SimpleNamespace(id=71,is_active=True)
        profile=SimpleNamespace(user_id=71,timezone='Europe/Berlin',target_event_date=target,weekly_hours_available=6, goals={})
        db=AsyncMock()
        statements=[]
        async def execute(stmt):
            statements.append(stmt)
            out=MagicMock()
            out.scalar_one_or_none.return_value=profile if 'athlete_profiles' in str(stmt) else plan
            return out
        db.execute.side_effect=execute
        app.dependency_overrides[get_current_active_user]=lambda:user
        app.dependency_overrides[get_current_user]=lambda:user
        app.dependency_overrides[get_db_for_user]=lambda:db
        return TestClient(app),db,statements
    yield make
    app.dependency_overrides.clear()

def saved():
    return SimpleNamespace(plan_start_date=date(2026,9,7),plan_end_date=date(2026,10,4),phase='build1',weekly_tss_targets=[200,240,270,160])

def test_empty_is_read_only(endpoint):
    client,db,queries=endpoint()
    response=client.get('/plan/current')
    assert response.status_code==200
    assert response.json()['status']=='empty'
    db.commit.assert_not_called()
    db.flush.assert_not_called()
    for statement in queries:
        compiled=statement.compile()
        assert 71 in compiled.params.values()

def test_returns_saved_block_not_fabricated_horizon(endpoint):
    client,db,_=endpoint(saved(),date(2099,10,1))
    response=client.get('/plan/current')
    assert response.status_code==200
    data=response.json()
    assert data['status']=='active'
    assert data['weekly_tss_targets']==[200,240,270,160]
    assert data['plan_start_date']=='2026-09-07'
    db.commit.assert_not_called()

def test_passed_target_ends_plan(endpoint):
    client,_,_=endpoint(saved(),date(2026,9,11))
    body=client.get('/plan/current').json()
    assert body['status']=='ended'
    assert body['plan_end_date']=='2026-09-11'

def test_maintenance_does_not_end_after_one_mesocycle(endpoint):
    client,_,_=endpoint(saved(),None)
    assert client.get('/plan/current').json()['status']=='active'


def test_requires_authentication():
    assert TestClient(app).get('/plan/current').status_code == 401


def test_ended_goal_survives_historical_block_removal(endpoint):
    client,db,_=endpoint(None,date(2026,9,11))
    body=client.get('/plan/current').json()
    assert body['status']=='ended'
    assert body['plan_end_date']=='2026-09-11'
    assert body['plan_start_date'] is None
    assert body['weekly_tss_targets'] is None
    db.commit.assert_not_called()
