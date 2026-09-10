"""Evidence boundaries for post-ride reviews: prescription, dose, ownership."""
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql
from app.services.training_review import assemble_review, planned_trace, load_review
from app.api.ride_details import get_training_review

PLAN = dict(title='4 × 3 min VO₂', duration_minutes=24, predicted_tss=40, blocks=[
    dict(name='Warm up', duration_s=360, target_pct_ftp=.5),
    dict(name='4 × 3/1 min', duration_s=960, target_pct_ftp=1.15, reps=4, on_s=180, off_s=60, off_pct_ftp=.5),
    dict(name='Cool down', duration_s=120, target_pct_ftp=.5),
])
POWER = [p*250 for p in planned_trace(PLAN['blocks'])]

def review(**overrides):
    args = dict(activity_id=1, title='Morning ride', duration=1440, tss=40, ftp=250, power=POWER, prescription=PLAN)
    return assemble_review(**(args | overrides))


def test_matching_vo2_workout_surfaces_quality_work_not_warmup():
    r = review()
    assert r.score == 100 and r.status == 'matched'
    assert r.stimulus == 'VO₂-Bereich'
    assert '12 Minuten' in r.stimulus_detail
    assert all(p.fitness == p.fatigue == p.form == 0 for p in r.impact)
    assert 'kein nachgewiesener' in r.limitations[0]


def test_equal_tss_but_different_zones_is_not_compliance():
    r = review(power=[162.5]*1440)
    assert r.score < 80 and r.status == 'different'
    assert r.stimulus == 'Ausdauer'
    assert r.impact[0].form == 0  # equal load is not equal stimulus


def test_extra_load_is_not_rewarded_as_better_compliance():
    r = review(tss=80)
    assert r.score < 100 and r.status == 'extra'
    assert r.impact[0].fatigue > r.impact[0].fitness > 0
    assert r.impact[0].form < r.impact[-1].form < 0


@pytest.mark.parametrize('override', [dict(ftp=None),dict(ftp=0),dict(power=[]),dict(power=[200]*300),dict(power=[None]*1440),dict(duration=0),dict(tss=None)])
def test_insufficient_evidence_withholds_score(override):
    r = review(**override)
    assert r.score is None


def test_zero_values_are_observed_not_missing():
    r = review(power=[0]*1440, tss=0)
    assert r.coverage == 1
    assert r.pairs[1].actual == 0
    assert r.zones[0].actual_seconds == 1440
    assert r.score is not None and r.score < 80


def test_other_sport_never_uses_cycling_target_or_projection():
    r = review(same_sport=False)
    assert r.score is None and r.impact == []
    assert all(p.planned is None for p in r.pairs)
    assert all(z.planned_seconds is None for z in r.zones)


def test_multiple_rides_do_not_each_receive_entire_days_target():
    r = review(multiple_rides=True)
    assert r.score is None and r.impact == []


def test_composite_expands_on_off_and_rejects_ambiguous_structure():
    assert len(planned_trace(PLAN['blocks'])) == 1440
    assert POWER.count(287.5) == 720
    assert planned_trace([dict(name='4 × 3 min',duration_s=720,target_pct_ftp=1.15)]) == []
    assert planned_trace([dict(duration_s=100,target_pct_ftp=1.2,tss_pct_ftp=.7)]) == []
    assert planned_trace([dict(duration_s=15.5,target_pct_ftp=.7)]) == []
    assert planned_trace([dict(duration_s=10,target_pct_ftp=.7,reps=1.5,on_s=2,off_s=3,off_pct_ftp=.5)]) == []


def test_repeated_reviews_are_pure_and_deterministic():
    before = repr(PLAN)
    assert review().model_dump() == review().model_dump()
    assert repr(PLAN) == before


class Result:
    def __init__(self, value): self.value = value
    def scalar_one_or_none(self): return self.value
    def scalars(self): return self
    def first(self): return self.value
    def all(self): return self.value


@pytest.mark.asyncio
async def test_endpoint_checks_ownership_before_any_review_read():
    db = NS(execute=AsyncMock(return_value=Result(None)))
    with patch('app.services.training_review.load_review',new_callable=AsyncMock) as loader:
        with pytest.raises(HTTPException) as error:
            await get_training_review(88, NS(id=7), db)
        assert error.value.status_code == 404
        loader.assert_not_called()
    stmt = db.execute.call_args.args[0].compile(dialect=postgresql.dialect())
    assert stmt.params == {'id_1':88,'user_id_1':7}


@pytest.mark.asyncio
@pytest.mark.parametrize('rewritten', [True,False])
async def test_loader_only_uses_pre_ride_evidence_and_explicit_adaptation(rewritten):
    stamp=datetime(2026,9,9,9,tzinfo=timezone.utc)
    activity=NS(id=1,title='Ride',started_at=stamp,duration_seconds=1440,tss=40,ftp_watts_at_scoring=250,sport='cycling')
    rec=NS(**PLAN,sport='cycling',updated_at=stamp+timedelta(hours=1)) if rewritten else None
    results=[Result(None),Result(NS(streams={'power':POWER})),Result(rec),Result(None),Result([])]
    db=NS(execute=AsyncMock(side_effect=results),scalar=AsyncMock(return_value=1))
    r=await load_review(db,7,activity)
    assert r.score is None and r.status == 'unplanned' and r.changes == []
    queries=[c.args[0].compile(dialect=postgresql.dialect()) for c in db.execute.call_args_list]
    rec_query=queries[2]
    assert 'created_at <=' in str(rec_query) and stamp in rec_query.params.values()
    brief_query=queries[3]
    assert 'generated_at <=' in str(brief_query) and stamp in brief_query.params.values()
    attribution=queries[-1]
    assert 'absorption' in attribution.params.values() and 'activity_id' in attribution.params.values()
    assert '1' in attribution.params.values() and 'post_workout' in attribution.params.values()
    for q in queries:
        assert 7 in q.params.values()  # all private reads owner scoped


def test_partial_prescription_is_not_treated_as_the_whole_workout():
    r = review(prescription=PLAN | {'blocks':PLAN['blocks'][:1]})
    assert r.score is None
    assert all(z.planned_seconds is None for z in r.zones)
