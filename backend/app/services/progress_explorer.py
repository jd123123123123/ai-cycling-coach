"""Dated observations and period-specific power envelopes for Today.

Never turn monthly aggregates into daily samples. Period records are clipped
by the same corroborated all-time envelope as the existing power-profile UI.
"""
from datetime import date, datetime, timedelta, timezone
from math import isfinite
from app.schemas.progress_explorer import ProgressExplorer, ProgressMetric, ProgressPoint, ProgressRecord
from app.services.athlete_power_profile import build_sanitized_envelope

DURATIONS = (1, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600)

def period_start(period, today, plan_start=None):
    if period == 'week': return today - timedelta(days=today.weekday())
    if period == 'month': return today.replace(day=1)
    if period == 'year': return today.replace(month=1,day=1)
    if period == 'plan': return plan_start if plan_start and plan_start <= today else None
    raise ValueError('Unsupported progress period')

def period_bounds(period, today, reference_date=None, plan_start=None):
    reference = reference_date or today
    if reference < date(1970, 1, 1) or reference > today:
        raise ValueError('reference_date must be between 1970-01-01 and today')
    if period == 'plan':
        return period_start(period, today, plan_start), today
    start = period_start(period, reference)
    if period == 'week': end = start + timedelta(days=6)
    elif period == 'month':
        next_month = date(start.year + (start.month == 12), start.month % 12 + 1, 1)
        end = next_month - timedelta(days=1)
    else: end = date(start.year, 12, 31)
    return start, min(end, today)

def finite(value):
    try:
        v = float(value)
        return v if isfinite(v) and v > 0 else None
    except (ValueError, TypeError): return None

def metric(points, start, end, current=None, target=None):
    ordered = sorted({p.date:p for p in points}.values(),key=lambda p:p.date)
    before = [p for p in ordered if start and p.date < start.isoformat()]
    inside = [p for p in ordered if start and start.isoformat() <= p.date <= end.isoformat()]
    return ProgressMetric(points=inside,baseline=before[-1] if before else None,current=finite(current),target=finite(target))

def record_envelopes(rides, start, end):
    # Sanitization applies to the complete observed record, not a sparse week
    # that could otherwise promote a one-off sensor spike into a personal best.
    all_rows = [(day, aid, {str(k): v for k,v in (curve or {}).items() if str(k).isdigit() and finite(v) is not None}) for day,aid,curve in rides if day <= end]
    best = build_sanitized_envelope([curve for _,_,curve in all_rows])
    selected = [(day,aid,curve) for day,aid,curve in all_rows if start and day >= start]
    span = (end-start).days+1 if start else 0
    previous = [(day,aid,curve) for day,aid,curve in all_rows if start and start-timedelta(days=span) <= day < start]
    out = []
    for seconds in DURATIONS:
        ceiling = best.get(seconds)
        def observed(rows):
            values = [(float(curve[str(seconds)]),day,aid) for day,aid,curve in rows if str(seconds) in curve and ceiling is not None and float(curve[str(seconds)]) <= ceiling+1e-6]
            return max(values,key=lambda v:(v[0],v[1])) if values else None
        now, prev, historical = observed(selected), observed(previous), observed(all_rows)
        out.append(ProgressRecord(seconds=seconds,watts=now[0] if now else None,all_time_watts=historical[0] if historical else None,previous_watts=prev[0] if prev else None,date=now[1].isoformat() if now else None,activity_id=now[2] if now else None))
    return out

async def load_progress(db,user_id,period,reference_date=None,plan_end=None):
    from sqlalchemy import select
    from app.models.athlete_profile import AthleteProfile
    from app.models.daily_metric import DailyMetric
    from app.models.activity import Activity
    from app.models.activity_stream import ActivityStream
    from app.models.mesocycle_plan import MesocyclePlan
    from app.services.athlete_time import set_athlete_tz_from_profile,today_local,local_date_of,day_local_window
    from app.services.crew_score import _extract_vo2max
    profile=(await db.execute(select(AthleteProfile).where(AthleteProfile.user_id==user_id))).scalar_one_or_none()
    set_athlete_tz_from_profile(profile)
    today=today_local()
    if plan_end and (period != 'plan' or plan_end > today or plan_end < date(1970,1,1)):
        raise ValueError('plan_end requires a past or current plan date')
    plan_day=plan_end or today
    plan=(await db.execute(select(MesocyclePlan).where(MesocyclePlan.user_id==user_id,MesocyclePlan.plan_start_date<=plan_day,MesocyclePlan.plan_end_date>=plan_day).order_by(MesocyclePlan.plan_start_date.desc()).limit(1))).scalars().first()
    anchor=plan.plan_start_date if plan else None
    custom_start=(profile.goals or {}).get('custom_goal_started') if profile else None
    if custom_start:
        try:
            recorded_start=date.fromisoformat(custom_start)
            if recorded_start <= plan_day:
                anchor=recorded_start
        except (TypeError,ValueError):
            pass
    start,end=period_bounds(period,plan_day if plan_end else today,reference_date,anchor)
    ftp_points=[]
    for item in (profile.ftp_history or []) if profile else []:
        try:
            dt=datetime.fromisoformat(item['measured_at'].replace('Z','+00:00'))
            if dt.tzinfo is None: dt=dt.replace(tzinfo=timezone.utc)
            value=finite(item.get('ftp_watts'))
            if value is not None: ftp_points.append((dt, ProgressPoint(date=local_date_of(dt).isoformat(),value=value,source=str(item.get('source','manual')))))
        except (KeyError,TypeError,ValueError): continue
    # Latest sample per athlete-local date, preserving actual dates and gaps.
    raw=(await db.execute(select(DailyMetric.date,DailyMetric.raw_data).where(DailyMetric.user_id==user_id,DailyMetric.date<=end).order_by(DailyMetric.date,DailyMetric.recorded_at))).all()
    vo2={}
    for day,payload in raw:
        value=finite(_extract_vo2max(payload))
        if day and value is not None: vo2[day]=value
    vo2_points=[ProgressPoint(date=d.isoformat(),value=v,source='Garmin-Schätzung') for d,v in vo2.items()]
    _,end_utc=day_local_window(end)
    rows=(await db.execute(select(Activity.started_at,Activity.id,ActivityStream.mmp_curve).join(ActivityStream,Activity.id==ActivityStream.activity_id).where(Activity.user_id==user_id,ActivityStream.user_id==user_id,Activity.sport.in_(['cycling','indoor_cycling','virtual_ride','road_biking','mountain_biking']),Activity.started_at<end_utc,ActivityStream.mmp_curve.isnot(None)))).all()
    records=record_envelopes([(local_date_of(dt),aid,curve) for dt,aid,curve in rows],start,end)
    goals=profile.goals or {} if profile else {}
    ordered_ftp = [p for _,p in sorted(ftp_points,key=lambda row:row[0]) if p.date <= end.isoformat()]
    ftp_current = (profile.ftp_watts if profile else None) if end == today else (ordered_ftp[-1].value if ordered_ftp else None)
    return ProgressExplorer(period=period,start=start.isoformat() if start else None,end=end.isoformat(),today=today.isoformat(),plan_start=anchor.isoformat() if anchor else None,
        plan_note='Seit Beginn deines gespeicherten Trainingsplans.' if anchor else 'Kein aktiver Trainingsplan.',
        ftp=metric(ordered_ftp,start,end,ftp_current,goals.get('target_ftp') if end == today else None),
        vo2=metric(vo2_points,start,end,vo2[max(vo2)] if vo2 else None),records=records)
