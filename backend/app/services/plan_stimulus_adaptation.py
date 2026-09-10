"""Conservative stimulus substitution inside the existing absorption pipeline.

A ride is not an excuse to add work. Reflow exchanges two existing sessions;
extra intensity can only ease an imminent quality day. Thresholds below are
explicit product guardrails, not claims of measured physiological adaptation.
"""
from copy import deepcopy
from datetime import timedelta
from app.services.workout_templates import TEMPLATES
from app.services.run_workout_templates import RUN_TEMPLATES

PROTECTED = {'user_plan', 'user_modified', 'coach_absorbed', 'coach_adapted'}
QUALITY = {'tempo', 'sweet_spot', 'threshold', 'vo2', 'anaerobic'}

def category(row):
    template = TEMPLATES.get(row.template_id or '') or RUN_TEMPLATES.get(row.template_id or '')
    return template.category if template else None

def blocks_quality_spacing(row):
    # Unknown noncycling sessions may be hard strength or running work.
    # Absence of a cycling template is not evidence of an easy day.
    return category(row) in QUALITY or (category(row) is None and row.template_id != 'rest_day')

def editable(row):
    return getattr(row, 'sport', 'cycling') == 'cycling' and (row.blocks_source or '') not in PROTECTED

def snapshot(row):
    return {'date':row.date.isoformat(), 'template_id':row.template_id, 'title':row.title}

def decide_stimulus(review):
    if review.score is None or len(review.zones) != 7:
        return None
    actual = [z.actual_seconds or 0 for z in review.zones]
    planned = [z.planned_seconds or 0 for z in review.zones]
    # Ignore a handful of spikes; compare meaningful minutes above threshold.
    hard_a, hard_p = sum(actual[4:]), sum(planned[4:])
    if hard_a >= 300 and hard_p < 60:
        return 'unexpected_intensity'
    if hard_p >= 480 and hard_a < hard_p * .5 and sum(actual[1:3]) >= sum(actual) * .6:
        return 'quality_replaced_by_endurance'
    return None

def adapt_stimulus(rows, *, ride_date, today, kind, readiness_allows_reflow=False):
    """Mutate at most one existing pair or ease one day; return real diffs.

    `rows` includes the whole week and all sports so a running quality day
    also blocks moving hard cycling next to it. Rest/user days stay put.
    """
    cutoff = max(ride_date, today)
    sunday = ride_date + timedelta(days=6-ride_date.weekday())
    future = sorted((r for r in rows if cutoff < r.date <= sunday), key=lambda r:r.date)
    eligible = [r for r in future if editable(r)]
    if not eligible:
        return [], {'state':'protected' if future else 'unchanged', 'reason':'Deine verbleibenden Einheiten bleiben geschützt.' if future else 'Diese Trainingswoche ist abgeschlossen; es wird nichts nachgeholt.'}
    if kind == 'unexpected_intensity':
        near = [r for r in eligible if category(r) in QUALITY and r.date <= ride_date+timedelta(days=2)]
        if near:
            row=near[0]
            before=snapshot(row)
            rest=TEMPLATES['rest_day']
            row.template_id=rest.id; row.title=rest.name; row.duration_seconds_target=0
            row.interval_structure={'intervals':[], 'source':'coach_absorbed'}
            row.blocks_source='coach_absorbed'
            reason='Deine Fahrt enthielt zusätzliche intensive Minuten. Die nächste Qualitätseinheit wird zum Ruhetag; die Belastung wird nicht gestapelt.'
            return [{'before':before,'after':snapshot(row)}], {'state':'adapted','reason':reason}
        return [], {'state':'unchanged','reason':'Die zusätzlichen intensiven Minuten sind berücksichtigt. Es liegt keine automatisch änderbare Qualitätseinheit innerhalb der nächsten zwei Tage; der Wochenplan bleibt bestehen.'}
    if kind != 'quality_replaced_by_endurance':
        return [], {'state':'unchanged','reason':'Der gefahrene Reiz ist berücksichtigt. Die verbleibende Woche bleibt im Plan.'}
    if not readiness_allows_reflow:
        return [], {'state':'unchanged','reason':'Deine Ausdauerfahrt zählt. Eine Qualitätseinheit wird ohne passende aktuelle Erholungssignale nicht vorgezogen; es kommt kein Nachholtraining hinzu.'}
    # Bring forward an ALREADY planned quality session, exchanging it with
    # an endurance slot. Both session durations must fit the original slots.
    # Never resurrect an omitted workout, replace rest, or extend the week.
    for quality in [r for r in eligible if category(r) in QUALITY]:
        for filler in [r for r in eligible if category(r)=='endurance' and ride_date+timedelta(days=2) <= r.date < quality.date]:
            if not quality.duration_seconds_target or quality.duration_seconds_target != filler.duration_seconds_target:
                continue
            if bool(getattr(quality,'indoor',False)) != bool(getattr(filler,'indoor',False)):
                continue
            if any(r is not quality and r is not filler and abs((r.date-filler.date).days) <= 1 and blocks_quality_spacing(r) for r in rows):
                continue
            # A second session on either day makes the swap ambiguous.
            if any(r is not quality and r is not filler and r.date in (quality.date,filler.date) for r in rows):
                continue
            before_q,before_f=snapshot(quality),snapshot(filler)
            attrs=('template_id','title','duration_seconds_target','interval_structure','description')
            old_q={a:deepcopy(getattr(quality,a,None)) for a in attrs}
            old_f={a:deepcopy(getattr(filler,a,None)) for a in attrs}
            for key in attrs:
                setattr(quality,key,old_f[key]); setattr(filler,key,old_q[key])
            quality.blocks_source=filler.blocks_source='coach_absorbed'
            for row in (quality,filler):
                if isinstance(row.interval_structure,dict): row.interval_structure['source']='coach_absorbed'
            reason=f'Deine Ausdauerfahrt zählt. {before_q["title"]} rückt auf {filler.date.isoformat()}, die dortige Ausdauer auf {quality.date.isoformat()}. Wochenumfang und Anzahl der Qualitätseinheiten steigen nicht.'
            return [{'before':before_f,'after':snapshot(filler)},{'before':before_q,'after':snapshot(quality)}], {'state':'adapted','reason':reason}
    next_quality=next((r for r in future if category(r) in QUALITY),None)
    reason=(f'Deine Ausdauerfahrt zählt. Die nächste Qualitätseinheit bleibt am {next_quality.date.isoformat()}; ein früherer Tausch passt nicht zu Erholung, Zeitfenstern oder geschützten Tagen.' if next_quality else 'Deine Ausdauerfahrt zählt. Diese Woche gibt es keinen passenden vorhandenen Qualitätsslot; ausgefallene Intervalle werden nicht zusätzlich aufgeladen.')
    return [], {'state':'unchanged','reason':reason}
