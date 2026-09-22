"""Saved plan identity, prescriptions and observations, never causal promises.

Call before replacing goals or deleting generated rows; the caller owns the
transaction. Finished snapshots are immutable and never use the next plan's
profile, targets or dates. Read-only retrieval is scoped to the signed-in rider.
"""
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from math import isfinite
from uuid import uuid4
from sqlalchemy import select
from app.models.plan_journey import PlanJourney
from app.models.athlete_profile import AthleteProfile
from app.models.mesocycle_plan import MesocyclePlan
from app.models.planned_workout import PlannedWorkout
from app.models.activity import Activity
from app.services.athlete_time import today_local, local_date_of, day_local_window, set_athlete_tz_from_profile
from app.services.progress_explorer import load_progress
from app.services.plan_intervals import week_interval

KEY = 'plan_history_id'
SPORTS = ('cycling', 'indoor_cycling', 'virtual_ride', 'road_biking', 'mountain_biking')

def parsed(value):
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None

def num(value):
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value) and value >= 0 else None

def target_tss(row):
    blocks = (row.interval_structure or {}).get('intervals', [])
    if row.template_id == 'rest_day':
        return 0
    total = seconds = 0
    if not blocks:
        return None
    for b in blocks:
        b = week_interval(b)
        duration, power = num(b.get('duration_seconds')), num(b.get('power_target_pct_ftp'))
        if duration is None or power is None:
            return None
        reps = b.get('reps')
        if reps:
            on, off, low = num(b.get('on_s')), num(b.get('off_s')), num(b.get('off_pct_ftp'))
            if num(reps) is None or None in (on, off, low) or abs(reps * (on + off) - duration) > 1:
                return None
            total += reps * (on * power ** 2 + off * low ** 2) / 36
        else:
            total += duration * power ** 2 / 36
        seconds += duration
    if row.duration_seconds_target is not None and abs(seconds - row.duration_seconds_target) > 30:
        return None
    return round(total, 1)

async def schedule(db, user_id, start, end):
    workouts = (await db.execute(select(PlannedWorkout).where(PlannedWorkout.user_id == user_id, PlannedWorkout.date >= start, PlannedWorkout.date <= end, PlannedWorkout.sport.in_(SPORTS)).order_by(PlannedWorkout.date, PlannedWorkout.id))).scalars().all()
    blocks = (await db.execute(select(MesocyclePlan).where(MesocyclePlan.user_id == user_id, MesocyclePlan.plan_end_date >= start, MesocyclePlan.plan_start_date <= end).order_by(MesocyclePlan.plan_start_date))).scalars().all()
    return dict(days=[dict(date=w.date.isoformat(), title=w.title, sport=w.sport, duration=w.duration_seconds_target, tss=target_tss(w), intervals=deepcopy(w.interval_structure), source=w.blocks_source) for w in workouts], blocks=[dict(start=b.plan_start_date.isoformat(), end=b.plan_end_date.isoformat(), phase=b.phase, weekly_tss=list(b.weekly_tss_targets or [])) for b in blocks])

def metric_anchor(metric, start):
    points = [p for p in ([metric.get('baseline')] + metric.get('points', [])) if p and p['date'] <= start.isoformat()]
    return max(points, key=lambda p:p['date']) if points else None

async def ensure_journey(db, user_id, profile):
    set_athlete_tz_from_profile(profile)
    # Serialize lifecycle writes even when several tabs rebuild simultaneously.
    await db.execute(select(AthleteProfile.id).where(AthleteProfile.user_id == user_id).with_for_update())
    goals = dict(profile.goals or {})
    current = (await db.execute(select(PlanJourney).where(PlanJourney.user_id == user_id, PlanJourney.id == str(goals.get(KEY, ''))))).scalar_one_or_none()
    if current is not None:
        return current
    start, end = parsed(goals.get('custom_goal_started')), parsed(goals.get('custom_goal_block_end_date'))
    if start is None and profile.target_event_date:
        # A chosen event is evidence; an incidental auto-generated block is not.
        meso = (await db.execute(select(MesocyclePlan).where(MesocyclePlan.user_id == user_id, MesocyclePlan.plan_start_date <= today_local()).order_by(MesocyclePlan.plan_start_date.desc()).limit(1))).scalar_one_or_none()
        if meso:
            start, end = meso.plan_start_date, profile.target_event_date
    if start is None or end is None or start > today_local() or end < start:
        return None
    data = (await load_progress(db, user_id, 'plan', plan_end=start, plan_start_override=start)).model_dump(mode='json')
    baseline = {k:metric_anchor(data[k], start) for k in ('ftp', 'vo2')}
    # Only a new plan today may anchor an undated current FTP, labelled as saved.
    if start == today_local() and baseline['ftp'] is None and num(profile.ftp_watts):
        baseline['ftp'] = dict(date=start.isoformat(), value=profile.ftp_watts, source='FTP bei Planstart gespeichert')
    goal = deepcopy(goals.get('custom_goal') or {})
    recommendation = goals.get('custom_goal_recommendation') or {}
    title = goal.get('name') or recommendation.get('focus_label') or goals.get('target_event_name') or 'Dein Trainingsplan'
    current = PlanJourney(id=str(uuid4()), user_id=user_id, title=str(title)[:200], started_on=start, planned_end=end, status='active', goal={**goal, 'weekly_hours':profile.weekly_hours_available, 'days_available':deepcopy(profile.days_available), 'focuses':recommendation.get('focuses', [])}, baseline=baseline, revisions=[])
    db.add(current)
    profile.goals = {**goals, KEY:current.id}
    await db.flush()
    return current

async def preserve_schedule(db, user_id, profile):
    record = await ensure_journey(db, user_id, profile)
    if record is None or record.status != 'active':
        return record
    current = await schedule(db, user_id, record.started_on, record.planned_end)
    previous = (record.revisions or [])[-1].get('schedule') if record.revisions else None
    if current != previous:
        record.revisions = [*(record.revisions or []), dict(saved_at=datetime.now(timezone.utc).isoformat(), schedule=current)]
    return record


def summed(rows, field, scale=1):
    values = [num(getattr(r, field, None)) for r in rows]
    return round(sum(values) * scale, 1) if all(v is not None for v in values) else None

async def observed_outcome(db, user_id, record, stop):
    begin_utc, _ = day_local_window(record.started_on)
    _, end_utc = day_local_window(stop)
    rides = (await db.execute(select(Activity).where(Activity.user_id == user_id, Activity.started_at >= begin_utc, Activity.started_at < end_utc, Activity.sport.in_(SPORTS)).order_by(Activity.started_at))).scalars().all()
    progress = (await load_progress(db, user_id, 'plan', plan_end=stop, plan_start_override=record.started_on)).model_dump(mode='json')
    for key in ('ftp', 'vo2'):
        progress[key]['baseline'] = deepcopy(record.baseline.get(key))
        progress[key]['target'] = None  # never inherit a later plan's target
        points = [p for p in progress[key].get('points', []) if record.started_on.isoformat() <= p['date'] <= stop.isoformat()]
        progress[key]['current'] = max(points, key=lambda p: p['date'])['value'] if points else None
    last_schedule = (record.revisions or [])[-1]['schedule'] if record.revisions else {'days':[], 'blocks':[]}
    days = last_schedule.get('days', [])
    week = record.started_on - timedelta(days=record.started_on.weekday())
    weeks = []
    while week <= stop:
        until = min(week + timedelta(days=6), stop)
        r = [a for a in rides if week <= local_date_of(a.started_at) <= until]
        p = [d for d in days if max(week,record.started_on).isoformat() <= d['date'] <= until.isoformat()]
        known = bool(p) and all(d.get('tss') is not None for d in p)
        weeks.append(dict(start=week.isoformat(), end=until.isoformat(), planned_tss=round(sum(d['tss'] for d in p),1) if known else None, actual_tss=summed(r,'tss'), rides=len(r), duration=summed(r,'duration_seconds')))
        week += timedelta(days=7)
    return dict(through=stop.isoformat(), totals=dict(rides=len(rides), km=summed(rides,'distance_meters',.001), hours=summed(rides,'duration_seconds',1/3600), ascent=summed(rides,'elevation_gain_m'), tss=summed(rides,'tss')), progress=progress, weeks=weeks, rides=[dict(id=a.id, date=local_date_of(a.started_at).isoformat(), title=a.title or 'Deine Fahrt', duration=a.duration_seconds, tss=a.tss) for a in rides], note='Gemessene Veränderung im Planzeitraum. Daraus lässt sich keine alleinige Wirkung des Plans ableiten.')

async def finish_journey(db, user_id, profile, reason='replaced'):
    record = await preserve_schedule(db, user_id, profile)
    if record is None or record.status != 'active':
        return record
    cancelled = parsed((profile.goals or {}).get('plan_cancelled_at'))
    stop = max(record.started_on, min(today_local(), record.planned_end, cancelled or today_local()))
    record.outcome = await observed_outcome(db, user_id, record, stop)
    record.ended_on = stop
    record.status = 'cancelled' if cancelled or reason == 'cancelled' else 'completed' if record.planned_end < today_local() else reason
    return record

async def refresh_journey(db, user_id, profile):
    record = await preserve_schedule(db, user_id, profile)
    if record and record.status == 'active' and (record.planned_end < today_local() or parsed((profile.goals or {}).get('plan_cancelled_at'))):
        return await finish_journey(db, user_id, profile, 'completed')
    return record

def summary(record):
    outcome = record.outcome or {}
    return dict(id=record.id, title=record.title, start=record.started_on.isoformat(), planned_end=record.planned_end.isoformat(), end=record.ended_on.isoformat() if record.ended_on else None, status=record.status, weeks=((record.planned_end-record.started_on).days+1+6)//7, totals=outcome.get('totals'), baseline=record.baseline, progress=outcome.get('progress'), version_count=len(record.revisions or []))
