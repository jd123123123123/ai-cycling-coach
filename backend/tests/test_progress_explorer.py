from datetime import date
from app.services.progress_explorer import period_start, metric, record_envelopes
from app.schemas.progress_explorer import ProgressPoint

def test_calendar_windows_and_no_fabricated_plan_start():
    today=date(2026,9,10)
    assert period_start('week',today)==date(2026,9,7)
    assert period_start('month',today)==date(2026,9,1)
    assert period_start('year',today)==date(2026,1,1)
    assert period_start('plan',today,None) is None
    assert period_start('plan',today,date(2026,9,21)) is None
    assert period_start('plan',today,date(2026,8,24))==date(2026,8,24)

def test_metric_preserves_observation_dates_and_separates_baseline():
    data=metric([ProgressPoint(date='2026-08-21',value=230,source='manual'),ProgressPoint(date='2026-09-05',value=240,source='test'),ProgressPoint(date='2026-09-11',value=260,source='test')],date(2026,9,1),date(2026,9,10),250,300)
    assert [p.date for p in data.points]==['2026-09-05']
    assert data.baseline.value==230
    assert data.current==250
    assert len(data.points)==1 # never create a second point from current value

def test_no_period_values_are_not_zero_or_all_time_values():
    data=record_envelopes([(date(2026,8,1),1,{'300':300})],date(2026,9,1),date(2026,9,10))
    five=next(p for p in data if p.seconds==300)
    assert five.watts is None
    assert five.all_time_watts==300
    assert five.activity_id is None

def test_record_period_filters_and_source_ride():
    data=record_envelopes([(date(2026,8,24),1,{'300':290}),(date(2026,9,5),2,{'300':300}),(date(2026,9,12),3,{'300':999})],date(2026,9,1),date(2026,9,10))
    five=next(p for p in data if p.seconds==300)
    assert five.watts==300
    assert five.all_time_watts==300
    assert five.previous_watts==290
    assert five.activity_id==2

def test_power_spike_is_not_promoted_from_a_sparse_week():
    rides=[(date(2026,8,i+1),i,{'300':300}) for i in range(8)]
    rides.append((date(2026,9,5),20,{'300':1300}))
    five=next(p for p in record_envelopes(rides,date(2026,9,1),date(2026,9,10)) if p.seconds==300)
    assert five.all_time_watts==300
    assert five.watts is None

def test_sanitized_ceiling_is_not_reported_as_a_measured_record():
    five=next(p for p in record_envelopes([(date(2026,9,5),1,{'5':200,'300':210})],date(2026,9,1),date(2026,9,10)) if p.seconds==300)
    assert five.all_time_watts is None
    assert five.watts is None

def test_daily_metrics_keep_latest_observation_not_a_vertical_jump():
    result=metric([ProgressPoint(date='2026-09-02',value=240,source='test'),ProgressPoint(date='2026-09-02',value=245,source='correction')],date(2026,9,1),date(2026,9,10))
    assert len(result.points)==1
    assert result.points[0].value==245


def test_historical_calendar_bounds_and_leap_month():
    from app.services.progress_explorer import period_bounds
    today=date(2026,9,10)
    assert period_bounds('year',today,date(2025,6,8))==(date(2025,1,1),date(2025,12,31))
    assert period_bounds('month',today,date(2024,2,8))==(date(2024,2,1),date(2024,2,29))
    assert period_bounds('week',today,date(2025,12,31))==(date(2025,12,29),date(2026,1,4))
    assert period_bounds('month',today,date(2026,9,1))==(date(2026,9,1),today)
    assert period_bounds('week',today)==(date(2026,9,7),today)


def test_future_anchor_rejected_and_since_plan_stays_current():
    import pytest
    from app.services.progress_explorer import period_bounds
    today=date(2026,9,10)
    with pytest.raises(ValueError): period_bounds('year',today,date(2027,1,1))
    assert period_bounds('plan',today,date(2025,1,1),date(2026,8,24))==(date(2026,8,24),today)


def test_historical_records_do_not_use_later_personal_bests():
    rides=[(date(2025,5,1),1,{'300':280}),(date(2026,5,1),2,{'300':310})]
    record=next(p for p in record_envelopes(rides,date(2025,1,1),date(2025,12,31)) if p.seconds==300)
    assert record.watts==280 and record.all_time_watts==280


async def test_historical_payload_keeps_current_profile_values_out_of_past_period():
    from types import SimpleNamespace
    from datetime import datetime, timezone
    from unittest.mock import AsyncMock, MagicMock, patch
    from app.services.progress_explorer import load_progress
    # Import application model registry just as a request does.
    import app.main  # noqa: F401
    profile=SimpleNamespace(timezone='Europe/Berlin',ftp_watts=280,goals={'target_ftp':320},ftp_history=[
        {'measured_at':'2025-11-03T12:00:00Z','ftp_watts':230},
        {'measured_at':'2026-03-03T12:00:00Z','ftp_watts':280},
    ])
    p=MagicMock();p.scalar_one_or_none.return_value=profile
    plan=MagicMock();plan.scalars.return_value.first.return_value=None
    daily=MagicMock();daily.all.return_value=[(date(2025,11,3),{'training_status':{'mostRecentVO2Max':{'generic':{'vo2MaxValue':51}}}})]
    rides=MagicMock();rides.all.return_value=[]
    db=AsyncMock();db.execute.side_effect=[p,plan,daily,rides]
    with patch('app.services.athlete_time.today_local',return_value=date(2026,9,10)):
        result=await load_progress(db,42,'year',date(2025,6,1))
    assert result.end=='2025-12-31' and result.today=='2026-09-10'
    assert result.ftp.current==230 and result.ftp.target is None
    assert [p.value for p in result.ftp.points]==[230]
    assert result.vo2.current==51
    metric_query=db.execute.await_args_list[2].args[0].compile()
    assert metric_query.params['user_id_1']==42
    assert date(2025,12,31) in metric_query.params.values()
    ride_query=db.execute.await_args_list[3].args[0].compile()
    assert datetime(2025,12,31,23,tzinfo=timezone.utc) in ride_query.params.values()
