from copy import deepcopy
from datetime import date
from types import SimpleNamespace as Obj
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.api.plan import router, plan_history, plan_history_detail
from app.models.plan_journey import PlanJourney
from app.services.plan_history import finish_journey, preserve_schedule, target_tss, summed


def test_history_requires_auth():
    app=FastAPI();app.include_router(router);client=TestClient(app)
    assert client.get('/plan/history').status_code in (401,403)
    assert client.get('/plan/history/private').status_code in (401,403)
    assert client.post('/plan/history/refresh').status_code in (401,403)

@pytest.mark.asyncio
async def test_private_detail_is_owner_scoped_and_read_only():
    db=AsyncMock();res=MagicMock();res.scalar_one_or_none.return_value=None;db.execute.return_value=res
    with pytest.raises(HTTPException) as err:await plan_history_detail('private',Obj(id=7),db)
    assert err.value.status_code==404
    params=db.execute.call_args.args[0].compile().params
    assert params['user_id_1']==7 and params['id_1']=='private'
    db.commit.assert_not_awaited()

@pytest.mark.asyncio
async def test_list_is_scoped_paginated_and_excludes_active():
    db=AsyncMock();res=MagicMock();res.scalars.return_value.all.return_value=[];db.execute.return_value=res
    assert await plan_history(Obj(id=7),db,3,3)=={'plans':[],'next_offset':None}
    params=db.execute.call_args.args[0].compile().params
    assert params['user_id_1']==7 and params['status_1']=='active'
    db.commit.assert_not_awaited()

def test_load_uses_full_structure_and_keeps_missing_values():
    row=lambda blocks,duration:Obj(interval_structure={'intervals':blocks},duration_seconds_target=duration,template_id='steady')
    assert target_tss(row([{'duration_seconds':3600,'power_target_pct_ftp':.7}],3600))==49
    assert target_tss(row([{'duration_seconds':3600,'power_target_pct_ftp':None}],3600)) is None
    assert target_tss(row([{'duration_seconds':1800,'power_target_pct_ftp':.7}],3600)) is None
    assert summed([Obj(tss=20),Obj(tss=None)],'tss') is None
    assert summed([],'tss')==0

@pytest.fixture
async def store():
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as c:
        await c.execute(text('CREATE TABLE users (id INTEGER PRIMARY KEY)'))
        await c.run_sync(PlanJourney.__table__.create)
        await c.execute(text('INSERT INTO users VALUES (7)'))
    async with async_sessionmaker(engine,expire_on_commit=False)() as db:yield db
    await engine.dispose()

def journey():
    return PlanJourney(id='old-plan',user_id=7,title='Ausdauer',started_on=date(2026,7,1),planned_end=date(2026,8,31),status='active',goal={'focuses':['endurance']},baseline={'ftp':{'date':'2026-07-01','value':240},'vo2':None},revisions=[{'saved_at':'2026-07-01','schedule':{'days':[{'date':'2026-07-01','title':'Grundlage'}],'blocks':[]}}])

@pytest.mark.asyncio
async def test_archived_plan_and_measurements_survive_new_plan(store):
    old=journey();store.add(old);await store.commit()
    outcome={'totals':{'tss':1234,'km':987},'progress':{'ftp':{'current':258}}}
    with patch('app.services.plan_history.preserve_schedule',AsyncMock(return_value=old)),patch('app.services.plan_history.observed_outcome',AsyncMock(return_value=outcome)) as measure,patch('app.services.plan_history.today_local',return_value=date(2026,9,22)):
        await finish_journey(store,7,Obj(goals={}))
        await store.commit()
        assert old.status=='completed' and old.ended_on==date(2026,8,31)
        await finish_journey(store,7,Obj(goals={'custom_goal':{'name':'New FTP'}}))
        measure.assert_awaited_once()
    store.expire_all()
    saved=(await store.execute(select(PlanJourney).where(PlanJourney.id=='old-plan'))).scalar_one()
    assert saved.outcome==outcome and saved.baseline['ftp']['value']==240
    assert saved.revisions[0]['schedule']['days'][0]['title']=='Grundlage'

@pytest.mark.asyncio
async def test_failed_new_plan_rolls_back_archive_transition(store):
    old=journey();store.add(old);await store.commit()
    with patch('app.services.plan_history.preserve_schedule',AsyncMock(return_value=old)),patch('app.services.plan_history.observed_outcome',AsyncMock(return_value={'totals':{}})),patch('app.services.plan_history.today_local',return_value=date(2026,7,20)):
        await finish_journey(store,7,Obj(goals={}));await store.flush();await store.rollback()
    saved=(await store.execute(select(PlanJourney).where(PlanJourney.id=='old-plan'))).scalar_one()
    assert saved.status=='active' and saved.outcome is None

@pytest.mark.asyncio
async def test_adaptations_preserve_original_and_deduplicate_identical_revisions(store):
    old=journey();store.add(old);await store.commit();original=deepcopy(old.revisions)
    updated={'days':[{'date':'2026-07-01','title':'Erholung'}],'blocks':[]}
    with patch('app.services.plan_history.ensure_journey',AsyncMock(return_value=old)),patch('app.services.plan_history.schedule',AsyncMock(return_value=updated)):
        await preserve_schedule(store,7,Obj());await preserve_schedule(store,7,Obj());await store.commit()
    assert len(old.revisions)==2 and old.revisions[0]==original[0]
    assert old.revisions[-1]['schedule']==updated

@pytest.mark.asyncio
async def test_existing_chosen_plan_is_saved_once_without_inventing_baseline(store):
    from app.services.plan_history import ensure_journey
    await store.execute(text('CREATE TABLE athlete_profiles (id INTEGER PRIMARY KEY, user_id INTEGER)'))
    await store.execute(text('INSERT INTO athlete_profiles VALUES (1,7)'))
    profile=Obj(goals={'custom_goal_started':'2026-07-01','custom_goal_block_end_date':'2026-08-31','custom_goal':{'focus':'vo2'},'custom_goal_recommendation':{'focus_label':'VO₂max'}},target_event_date=None,ftp_watts=999,weekly_hours_available=6,days_available=None,timezone='Europe/Berlin')
    progress=Obj(model_dump=lambda **kw:{'ftp':{'baseline':None,'points':[],'current':999},'vo2':{'baseline':None,'points':[]}})
    with patch('app.services.plan_history.load_progress',AsyncMock(return_value=progress)),patch('app.services.plan_history.today_local',return_value=date(2026,9,22)):
        first=await ensure_journey(store,7,profile)
        second=await ensure_journey(store,7,profile)
        await store.commit()
    assert first.id==second.id and first.title=='VO₂max'
    assert first.baseline=={'ftp':None,'vo2':None}
    assert len((await store.execute(select(PlanJourney))).scalars().all())==1


@pytest.mark.asyncio
async def test_archive_uses_dated_observations_not_undated_current_profile():
    from app.services.plan_history import observed_outcome
    db=AsyncMock();result=MagicMock();result.scalars.return_value.all.return_value=[];db.execute.return_value=result
    progress={'ftp':{'baseline':None,'points':[],'current':999,'target':1000}, 'vo2':{'baseline':None,'points':[{'date':'2026-07-15','value':52}],'current':999}}
    data=Obj(model_dump=lambda **kw:deepcopy(progress))
    with patch('app.services.plan_history.load_progress',AsyncMock(return_value=data)) as load:
        outcome=await observed_outcome(db,7,journey(),date(2026,8,31))
    assert outcome['progress']['ftp']['current'] is None
    assert outcome['progress']['ftp']['baseline']['value']==240
    assert outcome['progress']['ftp']['target'] is None
    assert outcome['progress']['vo2']['current']==52
    assert load.call_args.kwargs['plan_start_override']==date(2026,7,1)
