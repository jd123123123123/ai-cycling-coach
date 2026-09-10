from datetime import date, timedelta, datetime, timezone
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch
from copy import deepcopy
import pytest
from app.services.plan_stimulus_adaptation import adapt_stimulus, decide_stimulus, category
from app.services.training_review import assemble_review
from app.services.plan_absorption import absorb_new_activities
from app.services.workout_templates import TEMPLATES
from tests.services.test_plan_absorption import _db

MON=date(2026,9,7)

def row(offset, tid='z2_endurance_60', source='ai_prescribed', **kw):
    return NS(date=MON+timedelta(days=offset),template_id=tid,title=tid,blocks_source=source,sport='cycling',duration_seconds_target=3600,interval_structure={'intervals':[{'name':tid}]},description=None,indoor=False,**kw)

VO2=next(k for k,t in TEMPLATES.items() if t.category=='vo2')

def report(power, blocks=None):
    blocks=blocks or [dict(duration_s=1800,target_pct_ftp=1.15)]
    return assemble_review(activity_id=1,title='Fahrt',duration=1800,tss=40,ftp=250,power=power,prescription=dict(title='VO2',duration_minutes=30,predicted_tss=40,blocks=blocks))


def test_same_tss_different_stimulus_is_detected():
    r=report([162.5]*1800)
    assert r.pairs[1].actual==r.pairs[1].planned
    assert decide_stimulus(r)=='quality_replaced_by_endurance'
    assert decide_stimulus(report([287.5]*1800)) is None
    assert decide_stimulus(report([])) is None


def test_unexpected_hard_minutes_distinct_from_extra_tss():
    r=report([287.5]*1800,[dict(duration_s=1800,target_pct_ftp=.65)])
    assert decide_stimulus(r)=='unexpected_intensity'


def test_swap_reuses_existing_quality_preserves_volume_and_count():
    filler,quality=row(2),row(4,VO2)
    rows=[filler,quality]
    before=sorted((r.template_id,r.duration_seconds_target) for r in rows)
    changes,decision=adapt_stimulus(rows,ride_date=MON,today=MON,kind='quality_replaced_by_endurance',readiness_allows_reflow=True)
    assert decision['state']=='adapted' and len(changes)==2
    assert filler.template_id==VO2 and quality.template_id=='z2_endurance_60'
    assert sorted((r.template_id,r.duration_seconds_target) for r in rows)==before
    assert changes[0]['before']['template_id']=='z2_endurance_60'
    assert changes[1]['after']['template_id']=='z2_endurance_60'
    assert sum(category(r)=='vo2' for r in rows)==1


@pytest.mark.parametrize('source',['user_plan','user_modified','coach_absorbed','coach_adapted'])
def test_protected_or_previously_adapted_days_are_not_rewritten(source):
    rows=[row(2,source=source),row(4,VO2,source)]
    before=deepcopy([vars(r) for r in rows])
    changes,decision=adapt_stimulus(rows,ride_date=MON,today=MON,kind='quality_replaced_by_endurance',readiness_allows_reflow=True)
    assert changes==[] and decision['state']=='protected'
    assert [vars(r) for r in rows]==before


@pytest.mark.parametrize('guard',['not_recovered','adjacent_quality','short_slot','indoor','same_day_double','too_soon','already_past'])
def test_quality_reflow_obeys_constraints(guard):
    rows=[row(2),row(4,VO2)]
    ready=True; today=MON
    if guard=='not_recovered': ready=False
    elif guard=='adjacent_quality': rows.append(row(1,VO2))
    elif guard=='short_slot': rows[0].duration_seconds_target=1800
    elif guard=='indoor': rows[0].indoor=True
    elif guard=='same_day_double': rows.append(row(2,'rest_day'))
    elif guard=='too_soon': rows[0].date=MON+timedelta(days=1)
    elif guard=='already_past': today=MON+timedelta(days=2)
    before=deepcopy([vars(r) for r in rows])
    changes,decision=adapt_stimulus(rows,ride_date=MON,today=today,kind='quality_replaced_by_endurance',readiness_allows_reflow=ready)
    assert changes==[] and decision['state']=='unchanged'
    assert [vars(r) for r in rows]==before


def test_unexpected_intensity_eases_near_quality_and_never_adds_work():
    near,far=row(1,VO2),row(4,VO2)
    changes,decision=adapt_stimulus([near,far],ride_date=MON,today=MON,kind='unexpected_intensity')
    assert near.template_id=='rest_day' and near.duration_seconds_target==0
    assert far.template_id==VO2 and len(changes)==1 and decision['state']=='adapted'
    again,_=adapt_stimulus([near,far],ride_date=MON,today=MON,kind='unexpected_intensity')
    assert again==[]


def test_rest_never_becomes_makeup_quality():
    rows=[row(2,'rest_day'),row(4,VO2)]
    changes,_=adapt_stimulus(rows,ride_date=MON,today=MON,kind='quality_replaced_by_endurance',readiness_allows_reflow=True)
    assert changes==[] and rows[0].template_id=='rest_day'


@pytest.mark.asyncio
async def test_sync_path_automatically_reflows_and_repeated_sync_is_idempotent():
    # Keep local day deterministic; no interactive plan mutation is involved.
    activity=NS(id=1,sport='cycling',tss=40,started_at=datetime(2026,9,7,9,tzinfo=timezone.utc),duration_seconds=1800)
    today_plan=row(0,VO2)
    filler,quality=row(2),row(4,VO2)
    week=[today_plan,filler,quality]
    db=_db([activity],[],[today_plan],week,[(40,)])
    with patch('app.services.training_review.load_review',new_callable=AsyncMock,return_value=report([162.5]*1800)), patch('app.services.adaptive_readiness.build_adaptive_directive',new_callable=AsyncMock,return_value=NS(hrv_state='in',intensity_ceiling='push',directive='push')), patch('app.services.plan_absorption.today_local',return_value=MON):
        out=await absorb_new_activities(db,7)
    assert out[0]['kind']=='quality_replaced_by_endurance'
    assert out[0]['decision']['state']=='adapted'
    feeds=[c.args[0] for c in db.add.call_args_list if type(c.args[0]).__name__=='PlanAdaptation']
    assert len(feeds)==2 and all(f.source=='post_workout' for f in feeds)
    assert all(f.evidence['absorption']['activity_id']==1 for f in feeds)
    second=_db([activity],[],[today_plan],week,[(40,)],adaptation_audits=[f.evidence for f in feeds])
    assert await absorb_new_activities(second,7)==[]
    second.add.assert_not_called()


@pytest.mark.parametrize('tid,sport',[('run_vo2_400s','running'),('custom_strength','gym')])
def test_real_running_quality_or_unknown_other_sport_blocks_adjacent_swap(tid,sport):
    other=row(1,tid); other.sport=sport
    rows=[row(2),row(4,VO2),other]
    changes,decision=adapt_stimulus(rows,ride_date=MON,today=MON,kind='quality_replaced_by_endurance',readiness_allows_reflow=True)
    assert changes==[] and decision['state']=='unchanged'


def test_hourly_upgrade_cannot_undo_absorbed_endurance_swap():
    from app.services.plan_adaptation_engine import _is_filler_endurance
    absorbed=row(2,source='coach_absorbed')
    assert not _is_filler_endurance(absorbed,sunday=MON+timedelta(days=6))
