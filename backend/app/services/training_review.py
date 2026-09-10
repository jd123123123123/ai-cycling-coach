"""Deterministic review against a PRE-RIDE prescription, never a fresh re-pick.

Power zones describe external dose, not minutes at measured VO2max. The score
is a product heuristic, not a validated physiological outcome. Missing channels
remain missing. Plan changes are only attributed via a persisted activity id.
"""
from __future__ import annotations
from math import isfinite
from app.schemas.training_review import TrainingReview, ReviewChange

ZONE_NAMES = ['Erholung', 'Ausdauer', 'Tempo', 'Schwelle', 'VO₂-Bereich', 'Anaerob', 'Sprint']
LIMITS = [.55, .75, .90, 1.05, 1.20, 1.50]

def number(value):
    if isinstance(value, bool):
        return None
    try:
        n = float(value)
        return n if isfinite(n) and n >= 0 else None
    except (ValueError, TypeError):
        return None

def zone(pct):
    return next((i for i, ceiling in enumerate(LIMITS) if pct <= ceiling), 6)

def planned_trace(blocks):
    """Expand only recorded structure; reject malformed/open/composite guesses."""
    trace = []
    for block in blocks or []:
        if not isinstance(block, dict) or block.get('open_effort'):
            return []
        duration = number(block.get('duration_s', block.get('duration_seconds')))
        pct = number(block.get('target_pct_ftp', block.get('power_target_pct_ftp')))
        if duration is None or pct is None or duration <= 0 or not duration.is_integer() or pct > 3 or len(trace) + duration > 43200:
            return []
        reps = number(block.get('reps'))
        if reps is not None:
            on, off, off_pct = number(block.get('on_s')), number(block.get('off_s')), number(block.get('off_pct_ftp'))
            if reps <= 0 or not reps.is_integer() or on is None or off is None or off_pct is None or not on.is_integer() or not off.is_integer() or off_pct > 3 or reps * (on + off) != duration:
                return []
            trace.extend(([pct] * int(on) + [off_pct] * int(off)) * int(reps))
        else:
            # A composite block stored only as prose cannot be reconstructed.
            if block.get('tss_pct_ftp') is not None or '×' in str(block.get('name', '')) or 'x' in str(block.get('name', '')).lower() and '/' in str(block.get('name', '')):
                return []
            trace.extend([pct] * int(duration))
    return trace

def fit(actual, target):
    if target <= 0:
        return 1.0 if actual <= 0 else 0.0
    return max(0.0, 1 - abs(actual - target) / target)

def assemble_review(*, activity_id, title, duration, tss, ftp, power, prescription=None,
                    same_sport=True, changes=None, multiple_rides=False):
    duration, tss, ftp = number(duration), number(tss), number(ftp)
    p = prescription if isinstance(prescription, dict) else {}
    target_duration = number(p.get('duration_minutes'))
    target_duration = target_duration * 60 if target_duration is not None else None
    target_tss = number(p.get('predicted_tss'))
    if not same_sport:
        target_duration, target_tss = None, None
    planned = planned_trace(p.get('blocks')) if same_sport else []
    if planned and target_duration is not None and abs(len(planned) - target_duration) > 30:
        planned = []  # Reject partial structure; duration_minutes may only round by 30s.
    samples = [number(v) for v in (power or [])]
    valid = [v for v in samples if v is not None]
    # Stored streams are 1 Hz. Never stretch a downsampled recording to fill a ride.
    coverage = min(1., len(valid) / duration) if duration and samples else None
    usable = bool(ftp and valid and duration and coverage is not None and coverage >= .9 and len(samples) <= duration * 1.1)
    actual_zones = [0.] * 7 if usable else None
    if actual_zones is not None:
        for value in valid:
            actual_zones[zone(value / ftp)] += 1
    planned_zones = [0.] * 7 if planned else None
    if planned_zones is not None:
        for value in planned:
            planned_zones[zone(value)] += 1
    limitations = ['Ein Trainingsreiz ist kein nachgewiesener FTP- oder VO₂max-Zuwachs. Fortschritt braucht vergleichbare Folgemessungen.']
    if not usable:
        limitations.append('Für eine Bewertung der Intensität fehlen ausreichend vollständige Leistungsdaten oder die FTP dieser Fahrt.')
    if not p:
        limitations.append('Keine verlässlich vor der Fahrt gespeicherte Empfehlung verfügbar.')
    if p and not same_sport:
        limitations.append('Andere Sportart als empfohlen: kein Vergleich mit den Belastungszielen des Radtrainings.')
    if p and not planned:
        limitations.append('Die gespeicherte Intervallstruktur lässt keinen vollständigen Zonenvergleich zu.')
    if multiple_rides:
        limitations.append('Mehrere Einheiten an diesem Tag: der Tagesplan wird keiner einzelnen Fahrt vollständig zugerechnet.')
    score = None
    if usable and planned_zones and target_duration and target_tss and same_sport and not multiple_rides and tss is not None:
        # Absolute dose error penalizes both missing stimulus and excess work.
        dose_fit = max(0., 1 - sum(abs(a-b) for a,b in zip(actual_zones, planned_zones)) / sum(planned_zones))
        score = round(100 * (.55 * dose_fit + .25 * fit(duration, target_duration) + .2 * fit(tss, target_tss)))
    extra = target_tss is not None and tss is not None and tss > max(target_tss * 1.3, target_tss + 20)
    status = 'unplanned' if not p else 'limited' if score is None else 'matched' if score >= 80 else 'different'
    if extra and same_sport and not multiple_rides:
        status = 'extra'
    # Surface a meaningful high-intensity dose before the longer warm-up.
    # This is time in a power band, never time at measured oxygen uptake.
    hard = [i for i in range(3, 7) if actual_zones and actual_zones[i] >= (30 if i >= 5 else 120)]
    dominant = max(hard) if hard else max(range(1, 7), key=lambda i: actual_zones[i]) if actual_zones and sum(actual_zones[1:]) > 0 else 0
    stimulus = ZONE_NAMES[dominant] if usable else 'Fahrt erfasst'
    minutes = round(actual_zones[dominant] / 60) if actual_zones else None
    stimulus_detail = (f'{minutes} Minuten im {stimulus.lower()}-Leistungsbereich. Gemessen relativ zur FTP dieser Fahrt.' if usable else 'Dauer und vorhandene Belastungsdaten zählen; der genaue Trainingsreiz bleibt offen.')
    headlines = {'matched':'Deinen Reiz getroffen.', 'different':'Anders gefahren. Auch das zählt.', 'extra':'Mehr geleistet. Mehr zu erholen.', 'unplanned':'Deine Fahrt zählt.', 'limited':'Deine Fahrt, ehrlich eingeordnet.'}
    summaries = {'matched':'Die Belastungsverteilung passt gut zu deiner Empfehlung.', 'different':'Deine Fahrt setzt einen anderen Reiz als geplant.', 'extra':'Die Belastung liegt deutlich über der Empfehlung. Das verdient Erholung, keine Extra-Härte.', 'unplanned':'Wir zeigen den gefahrenen Reiz, ohne eine Planerfüllung zu erfinden.', 'limited':'Die vorhandenen Daten reichen für Fakten, aber nicht für eine vollständige Planbewertung.'}
    action = 'Orientiere dich an der nächsten geplanten Einheit und der aktuellen Bereitschaft.'
    if status == 'different':
        action = 'Die ausgefallenen Intervalle nicht zusätzlich anhängen. Prüfe die nächste Qualitätseinheit im Plan.'
    elif status == 'extra':
        action = 'Plane keine Zusatzintervalle. Prüfe vor der nächsten intensiven Einheit deine Erholung und den aktualisierten Plan.'
    elif status == 'matched':
        action = 'Reiz gesetzt. Jetzt erholen und mit der nächsten geplanten Einheit weitermachen.'
    if changes:
        action = 'Dein Plan wurde angepasst. Öffne die geänderte Einheit vor deiner nächsten Fahrt.'
    impact = []
    basis = None
    # Difference vs prescribed load, not an invented pre-ride CTL or an FTP gain.
    if tss is not None and target_tss is not None and same_sport and not multiple_rides:
        delta = tss-target_tss
        basis = 'Modellabweichung gegenüber der empfohlenen Einheit; ab morgen gleicher weiterer Trainingsplan.'
        for day in range(7):
            ctl, atl = delta/42*(41/42)**day, delta/7*(6/7)**day
            impact.append(dict(day=day, fitness=round(ctl,2),fatigue=round(atl,2),form=round(ctl-atl,2)))
    trace = []
    if usable:
        length = max(len(samples),len(planned))
        step = max(1, (length+79)//80)
        for start in range(0,length,step):
            chunk = [v for v in samples[start:start+step] if v is not None]
            target_chunk = planned[start:start+step]
            trace.append(dict(at_s=start,actual_pct=round(sum(chunk)/len(chunk)/ftp*100,1) if chunk else None,planned_pct=round(sum(target_chunk)/len(target_chunk)*100,1) if target_chunk else None))
    return TrainingReview(activity_id=activity_id,headline=headlines[status],summary=summaries[status],score=score,status=status,
        planned_title=p.get('title'),actual_title=title or 'Deine Fahrt',coverage=coverage,stimulus=stimulus,stimulus_detail=stimulus_detail,
        pairs=[dict(label='Dauer',actual=round(duration/60,1) if duration is not None else None,planned=round(target_duration/60,1) if target_duration is not None else None,unit='min'),dict(label='Belastung',actual=tss,planned=target_tss,unit='TSS')],
        zones=[dict(label=name,actual_seconds=actual_zones[i] if actual_zones else None,planned_seconds=planned_zones[i] if planned_zones else None) for i,name in enumerate(ZONE_NAMES)],
        trace=trace,impact=impact,impact_basis=basis,changes=changes or [],action=action,limitations=limitations)

async def load_review(db, user_id, activity):
    from sqlalchemy import select, func
    from app.models.activity import Activity
    from app.models.activity_stream import ActivityStream
    from app.models.athlete_profile import AthleteProfile
    from app.models.coach_recommendation import CoachRecommendation
    from app.models.coach_brief import CoachBrief
    from app.models.plan_adaptation import PlanAdaptation
    from app.services.athlete_time import set_athlete_tz_from_profile, local_date_of, day_local_window
    from app.services.sport import same_sport_family
    from app.services.workout_templates import TEMPLATES
    profile = (await db.execute(select(AthleteProfile).where(AthleteProfile.user_id == user_id))).scalar_one_or_none()
    set_athlete_tz_from_profile(profile)
    day = local_date_of(activity.started_at)
    start, end = day_local_window(day)
    stream = (await db.execute(select(ActivityStream).where(ActivityStream.activity_id == activity.id, ActivityStream.user_id == user_id))).scalar_one_or_none()
    rec = (await db.execute(select(CoachRecommendation).where(CoachRecommendation.user_id == user_id, CoachRecommendation.target_date == day, CoachRecommendation.created_at <= activity.started_at))).scalar_one_or_none()
    prescription = None
    rec_sport = 'cycling'
    # Mutable daily recommendation rows are unsafe after a post-ride rewrite.
    if rec and (rec.updated_at is None or rec.updated_at <= activity.started_at):
        prescription = dict(title=rec.title, duration_minutes=rec.duration_minutes,predicted_tss=rec.predicted_tss,blocks=rec.blocks)
        rec_sport = rec.sport or 'cycling'
    else:
        brief = (await db.execute(select(CoachBrief).where(CoachBrief.user_id == user_id,CoachBrief.generated_at >= start,CoachBrief.generated_at <= activity.started_at,CoachBrief.prescribed_workout.isnot(None)).order_by(CoachBrief.generated_at.desc()).limit(1))).scalars().first()
        if brief:
            prescription = brief.prescribed_workout
            tid = str(prescription.get('template_id',''))
            rec_sport = 'running' if tid.startswith('run_') else 'gym' if tid.startswith(('gym','strength')) else 'cycling'
    count = await db.scalar(select(func.count()).select_from(Activity).where(Activity.user_id == user_id,Activity.started_at >= start,Activity.started_at < end))
    # Attribution is explicit, never "this event happened after your ride".
    rows = (await db.execute(select(PlanAdaptation).where(PlanAdaptation.user_id == user_id,PlanAdaptation.source == 'post_workout',PlanAdaptation.evidence['absorption']['activity_id'].astext == str(activity.id)).order_by(PlanAdaptation.created_at))).scalars().all()
    changes = []
    for row in rows:
        if not row.before or not row.after:
            continue
        def title(payload):
            t = TEMPLATES.get(payload.get('template_id',''))
            return payload.get('title') or (t.name if t else 'Einheit angepasst')
        changes.append(ReviewChange(date=row.target_date.isoformat(),before=title(row.before),after=title(row.after),reason=row.message_de))
    report = assemble_review(activity_id=activity.id,title=activity.title,duration=activity.duration_seconds,tss=activity.tss,
        ftp=activity.ftp_watts_at_scoring,power=(stream.streams or {}).get('power') if stream and same_sport_family(activity.sport, 'cycling') else None,
        prescription=prescription,same_sport=same_sport_family(activity.sport,rec_sport),changes=changes,multiple_rides=(count or 0)>1)

    from app.schemas.training_review import ReviewAdaptation
    decisions = [(row.evidence or {}).get('absorption', {}).get('decision') for row in rows]
    decision = next((d for d in reversed(decisions) if isinstance(d, dict)), None)
    if decision:
        report.adaptation = ReviewAdaptation(state=decision['state'], reason=decision['reason'], automatic=True)
        report.action = decision['reason']
    elif changes:
        report.adaptation = ReviewAdaptation(state='adapted', reason='Die zusätzliche Belastung wurde automatisch in deiner Trainingswoche berücksichtigt.', automatic=True)
        report.action = 'Deine Trainingswoche wurde automatisch angepasst. Du musst nichts nachtragen.'
    elif rows:
        report.adaptation = ReviewAdaptation(state='unchanged', reason='Deine Fahrt wurde automatisch berücksichtigt. Die verbleibende Woche passt weiterhin.', automatic=True)
        report.action = report.adaptation.reason
    else:
        report.adaptation = ReviewAdaptation(state='limited' if report.score is None else 'pending', reason='Für eine automatische Bewertung des Trainingsreizes fehlen verlässliche Vergleichsdaten.' if report.score is None else 'Die automatische Wochenprüfung ist noch nicht als abgeschlossen gespeichert.', automatic=False)
    return report
