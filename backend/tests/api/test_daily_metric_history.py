"""Contract checks for the existing history API used by the Today metric sheet."""
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.daily_metrics import get_daily_metrics, router, _enrich
from app.models.daily_metric import DailyMetric
from app.services.daily_metric_service import get_daily_metrics as load_history


@pytest.mark.asyncio
@pytest.mark.parametrize('start,end', [(date(2026,9,10),date(2026,9,9)), (date(2025,1,1),date(2026,9,10))])
async def test_invalid_range_rejected_before_loading(start,end):
    db=AsyncMock()
    with pytest.raises(HTTPException) as error:
        await get_daily_metrics(start,end,SimpleNamespace(id=42),db)
    assert error.value.status_code==400
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_history_passes_authenticated_identity_and_exact_inclusive_window():
    start,end=date(2026,6,13),date(2026,9,10)
    with patch('app.api.daily_metrics.daily_metric_service.get_daily_metrics',new_callable=AsyncMock,return_value=[]) as load:
        db=AsyncMock()
        result=await get_daily_metrics(start,end,SimpleNamespace(id=42),db)
    load.assert_awaited_once_with(db,42,start,end)
    assert result.metrics==[]
    assert result.count==0


@pytest.mark.asyncio
async def test_database_query_filters_owner_and_both_date_edges():
    result=MagicMock()
    result.scalars.return_value.all.return_value=[]
    db=AsyncMock()
    db.execute.return_value=result
    start,end=date(2026,9,4),date(2026,9,10)
    assert await load_history(db,42,start,end)==[]
    query=db.execute.await_args.args[0]
    compiled=query.compile()
    sql=str(compiled)
    assert 'daily_metrics.user_id =' in sql
    assert 'daily_metrics.date >=' in sql and 'daily_metrics.date <=' in sql
    assert 'ORDER BY daily_metrics.date ASC' in sql
    assert compiled.params['user_id_1']==42
    assert compiled.params['date_1']==start
    assert compiled.params['date_2']==end


def test_history_preserves_real_sleep_stages_and_missing_measurements():
    metric=DailyMetric(id=1,user_id=42,date=date(2026,9,9),recorded_at=datetime(2026,9,10,tzinfo=timezone.utc),hrv_status=None,resting_hr=45,sleep_score=79,raw_data={'sleep':{'dailySleepDTO':{'sleepTimeSeconds':25200,'deepSleepSeconds':3600}}})
    read=_enrich(metric)
    assert read.date==date(2026,9,9)  # Never substitute the later sync date.
    assert read.hrv_status is None
    assert read.resting_hr==45
    assert read.sleep_detail.total_s==25200
    assert read.sleep_detail.deep_s==3600
    assert read.sleep_detail.rem_s is None
    metric.raw_data={}
    assert _enrich(metric).sleep_detail is None


def test_history_requires_authentication():
    app=FastAPI()
    app.include_router(router)
    response=TestClient(app).get('/daily-metrics',params={'start_date':'2026-09-04','end_date':'2026-09-10'})
    assert response.status_code in (401,403)
