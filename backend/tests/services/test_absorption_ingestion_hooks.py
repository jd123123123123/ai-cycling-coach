from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

@pytest.mark.asyncio
@pytest.mark.parametrize('created',[True,False])
async def test_wahoo_webhook_checks_week_after_commit_only_for_new_activity(created):
    from app.services.wahoo_service import ingest_workout
    order=[]
    async def commit(): order.append('commit')
    async def absorb(db,uid): order.append(('absorb',uid)); return []
    db=NS(commit=commit)
    with patch('app.services.wahoo_service._load_profile',new_callable=AsyncMock,return_value=NS()),patch('app.services.wahoo_service._persist_workout',new_callable=AsyncMock,return_value=created),patch('app.services.plan_absorption.absorb_new_activities',side_effect=absorb):
        assert await ingest_workout(db,7,{}) == int(created)
    assert order==(['commit',('absorb',7)] if created else ['commit'])

@pytest.mark.asyncio
async def test_manual_activity_checks_week_automatically_after_persisting_response():
    from app.api.activities import create_activity
    order=[]
    async def commit(): order.append('commit')
    async def absorb(db,uid): order.append(('absorb',uid)); return []
    db=NS(commit=commit)
    response=NS(id=88)
    with patch('app.api.activities.get_or_create_profile',new_callable=AsyncMock),patch('app.api.activities.activity_service.create_activity',new_callable=AsyncMock),patch('app.api.activities.ActivityRead.model_validate',return_value=response),patch('app.services.plan_absorption.absorb_new_activities',side_effect=absorb):
        assert await create_activity(NS(),NS(id=7),db) is response
    assert order==['commit',('absorb',7)]

@pytest.mark.asyncio
async def test_hourly_retry_covers_all_active_plan_users_before_signal_engine():
    from app.scheduler import run_hourly_plan_adaptation
    order=[]
    db=NS(execute=AsyncMock(return_value=NS(all=lambda:[(7,),(8,)])))
    session=MagicMock();session.__aenter__=AsyncMock(return_value=db);session.__aexit__=AsyncMock(return_value=False)
    async def absorb(db,uid): order.append(('absorb',uid));return []
    async def signals(db,uid): order.append(('signals',uid));return {'changes':[]}
    with patch('app.scheduler.async_session_maker',return_value=session),patch('app.services.plan_absorption.absorb_new_activities',side_effect=absorb),patch('app.services.plan_adaptation_engine.run_for_user',side_effect=signals):
        await run_hourly_plan_adaptation()
    assert order==[('absorb',7),('signals',7),('absorb',8),('signals',8)]
