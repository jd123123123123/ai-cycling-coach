import pytest
from app.services.outdoor_workout import expand_intervals,place_workout,WorkoutUnavailable
from app.services.rehearsal.route_source import RehearsalRoute,RoutePoint

def route(km=40,grade=0):
    return RehearsalRoute([RoutePoint(i*150,100+i*150*grade/100,48+i*.00135,8) for i in range(int(km*1000/150)+1)],int(km*1000/150)*150,0,'Test',None)

def blocks():
    return expand_intervals([dict(duration_seconds=600,power_target_pct_ftp=.5),dict(duration_seconds=900,power_target_pct_ftp=1.1,reps=3,on_s=180,off_s=120,off_pct_ftp=.5),dict(duration_seconds=300,power_target_pct_ftp=.5)],240)

def test_repetitions_preserve_last_recovery_and_total():
    b=blocks();assert len(b)==8;assert sum(x.duration_s for x in b)==1800
    assert [x.watts_low for x in b[1:7]]==[264,120,264,120,264,120]

def test_no_last_recovery_and_incomplete_set():
    r=dict(duration_seconds=780,power_target_pct_ftp=1.1,reps=3,on_s=180,off_s=120,off_pct_ftp=.5)
    assert len(expand_intervals([r],240))==5
    with pytest.raises(WorkoutUnavailable):expand_intervals([{**r,'duration_seconds':777}],240)

def test_fit_preserves_work_and_includes_home():
    r=place_workout(route(),blocks(),240,75)
    assert r['status']=='terrain_fit'
    assert len(r['placements'])==8
    assert r['total_seconds']>1800
    assert r['extra_seconds']==r['total_seconds']-1800
    assert r['main_start_m']>0
    for a,b in zip(r['placements'],r['placements'][1:]):assert a['end_m']<=b['start_m']+.001

def test_short_and_downhill_refuse():
    assert place_workout(route(2),blocks(),240,75)['status']=='no_fit'
    assert place_workout(route(40,-4),blocks(),240,75)['status']=='no_fit'

def test_missing_measurements_are_not_defaults():
    with pytest.raises(WorkoutUnavailable):expand_intervals([dict(duration_seconds=30,power_target_pct_ftp=None)],240)
    with pytest.raises(WorkoutUnavailable):place_workout(route(),blocks(),240,None)

def test_fit_adds_only_one_open_step():
    from app.services.workout_export import to_fit
    from fit_tool.fit_file import FitFile
    from fit_tool.profile.messages.workout_step_message import WorkoutStepMessage
    from fit_tool.profile.profile_type import WorkoutStepDuration
    data=to_fit(title='Real workout',description='',blocks=blocks(),ftp=240,lap_start=True)
    decoded=FitFile.from_bytes(data)
    steps=[r.message for r in decoded.records if isinstance(r.message,WorkoutStepMessage)]
    assert len(steps)==9
    assert [s.message_index for s in steps]==list(range(9))
    assert sum(s.duration_type==WorkoutStepDuration.OPEN.value for s in steps)==1
    assert sum((s.duration_time or 0) for s in steps)==1800*1000


def test_route_gaps_and_unbounded_distance_refused():
    bad=RehearsalRoute([RoutePoint(0,100,48,8),RoutePoint(3000,200,48.03,8)],3000,100,'Gap',None)
    with pytest.raises(WorkoutUnavailable):place_workout(bad,blocks(),240,75)
    bad=RehearsalRoute([],float('inf'),0,'Invalid',None)
    with pytest.raises(WorkoutUnavailable):place_workout(bad,blocks(),240,75)


def test_cadence_does_not_overwrite_fit_power_range():
    from app.services.workout_export import Block,to_fit,to_zwo
    from fit_tool.fit_file import FitFile
    from fit_tool.profile.messages.workout_step_message import WorkoutStepMessage
    block=Block('Intervall 1',180,250,270,1.08,85,95)
    out=to_fit(title='Power + cadence',description='',blocks=[block],ftp=240)
    step=next(r.message for r in FitFile.from_bytes(out).records if isinstance(r.message,WorkoutStepMessage))
    assert step.custom_target_power_low==1250
    assert step.custom_target_power_high==1270
    assert 'SteadyState' in to_zwo(title='Power',description='',blocks=[block],ftp=240)
