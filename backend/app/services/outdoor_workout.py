"""Conservative terrain-only placement of an unchanged workout on an owned route.

No traffic or surface inference from GPS. Candidate placements preserve every
prescribed second, including recovery; only the approach may be extended.
"""
from dataclasses import asdict
import math
import numpy as np

from app.services.workout_export import Block
from app.services.rehearsal.route_profile import build_segments
from app.services.rehearsal.physics import speed_for_power


class WorkoutUnavailable(ValueError):
    pass


def expand_intervals(intervals, ftp: int) -> list[Block]:
    if not ftp or ftp < 50:
        raise WorkoutUnavailable("Für Leistungsziele fehlt eine gültige FTP im Profil.")
    result = []
    def add(name, seconds, pct, row, recovery=False):
        if not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds <= 0:
            raise WorkoutUnavailable("Die Einheit enthält einen ungültigen Zeitblock.")
        if pct is None or not math.isfinite(pct) or not 0 < pct <= 3:
            raise WorkoutUnavailable("Für diese Einheit fehlen genaue Leistungsziele.")
        watts = round(ftp * pct)
        lo = row.get('target_watts_low') if not recovery else None
        hi = row.get('target_watts_high') if not recovery else None
        result.append(Block(name, round(seconds), lo or watts, hi or watts, pct,
                            row.get('cadence_low'), row.get('cadence_high')))
    for index, source in enumerate(intervals):
        r = source.model_dump() if hasattr(source, 'model_dump') else source
        total = r.get('duration_seconds', 0)
        pct = r.get('power_target_pct_ftp')
        reps, on, off = r.get('reps'), r.get('on_s'), r.get('off_s')
        if reps and on:
            if not 1 <= reps <= 200 or not off or r.get('off_pct_ftp') is None:
                raise WorkoutUnavailable("Die Wiederholungen sind nicht vollständig beschrieben.")
            # Both common prescriptions are valid: rest after every rep, or
            # after all but the last. Never silently invent the last recovery.
            full, no_last = reps * (on + off), reps * on + (reps - 1) * off
            if abs(total - full) > 1 and abs(total - no_last) > 1:
                raise WorkoutUnavailable("Dauer und Wiederholungen stimmen nicht überein.")
            for rep in range(reps):
                add(f'Intervall {rep+1}', on, pct, r)
                if rep < reps - 1 or abs(total - full) <= 1:
                    add('Recovery', off, r['off_pct_ftp'], r, True)
        else:
            name = ('Warmup' if index == 0 and (pct or 0) < .8 else
                    'Cooldown' if index == len(intervals)-1 and (pct or 0) < .8 else
                    'Recovery' if (pct or 0) < .6 else 'Belastung')
            add(name, total, pct, r)
    if not result or len(result) > 500 or sum(b.duration_s for b in result) > 24*3600:
        raise WorkoutUnavailable("Diese Einheit lässt sich nicht als Radtraining exportieren.")
    return result


def place_workout(route, blocks: list[Block], ftp: int, weight_kg: float) -> dict:
    if not weight_kg or not 25 <= weight_kg <= 250:
        raise WorkoutUnavailable("Für die Zeitschätzung fehlt dein Körpergewicht im Profil.")
    if not math.isfinite(route.total_distance_m) or not 200 <= route.total_distance_m <= 1_000_000:
        raise WorkoutUnavailable("Bitte wähle eine Strecke zwischen 200 m und 1.000 km.")
    if any(not all(math.isfinite(v) for v in (p.distance_m,p.elevation_m,p.lat,p.lng)) or not -90 <= p.lat <= 90 or not -180 <= p.lng <= 180 for p in route.points):
        raise WorkoutUnavailable("Die Strecke enthält ungültige Koordinaten oder Höhenwerte.")
    if any(b.distance_m-a.distance_m>1000 for a,b in zip(route.points,route.points[1:])):
        raise WorkoutUnavailable("Der Track hat Lücken über 1 km. Bitte lade einen genaueren Track hoch.")
    segments = build_segments(route, segment_length_m=150)
    if len(segments) > 7000:
        raise WorkoutUnavailable("Bitte wähle eine Strecke unter 1.000 km.")
    grades = np.array([s.gradient_pct for s in segments])
    # Explicit road-bike assumptions, not secretly personalised parameters.
    powers = {round((b.watts_low+b.watts_high)/2) for b in blocks} | {round(ftp*.55)}
    speeds = {p: speed_for_power(power_w=p, gradient_pct=grades, mass_kg=weight_kg+9,
                cda_m2=.32, crr=.005) for p in powers}
    first_work = next((i for i,b in enumerate(blocks) if b.pct_ftp >= .75), 0)
    if first_work == 0 and len(blocks)>1 and blocks[0].name == 'Warmup':
        first_work = 1

    def traverse(start, seconds, power, demanding=False):
        cursor, remaining = start, seconds
        while remaining > .001:
            i = min(len(segments)-1, int(cursor/150))
            s = segments[i]
            room = s.start_m+s.length_m-cursor
            if room <= .0001:
                return None
            # Product heuristics only, deliberately labelled terrain review.
            if demanding and (s.gradient_pct < -2 or s.gradient_pct > 10):
                return None
            velocity = float(speeds[power][i])
            if demanding and velocity > 15:
                return None
            if not demanding and power <= ftp*.6 and (s.gradient_pct > 6 or velocity < 2):
                return None
            seconds_here = room/velocity
            used = min(remaining, seconds_here)
            cursor += used*velocity
            remaining -= used
        return cursor

    warm_end = 0.
    warm_placements = []
    for i,b in enumerate(blocks[:first_work]):
        end = traverse(warm_end, b.duration_s, round((b.watts_low+b.watts_high)/2))
        if end is None:
            warm_end = route.total_distance_m
            break
        warm_placements.append(dict(index=i, name=b.name, start_m=warm_end, end_m=end,
                                    duration_s=b.duration_s, pct_ftp=b.pct_ftp))
        warm_end=end
    solution = None
    # Earliest feasible continuous set. Scan at 150 m; no splitting recoveries.
    candidates = [warm_end] + [s.start_m for s in segments if s.start_m > warm_end]
    for start in candidates[:201]:
        cursor = start
        placements = list(warm_placements)
        for i,b in enumerate(blocks[first_work:], start=first_work):
            end=traverse(cursor,b.duration_s,round((b.watts_low+b.watts_high)/2),b.pct_ftp>=.75)
            if end is None:
                break
            placements.append(dict(index=i,name=b.name,start_m=cursor,end_m=end,
                                   duration_s=b.duration_s,pct_ftp=b.pct_ftp))
            cursor=end
        else:
            solution=(start,cursor,placements)
            break
    profile=[dict(distance_m=s.start_m,elevation_m=s.elevation_m,gradient_pct=s.gradient_pct)
             for s in segments]
    profile.append(dict(distance_m=route.total_distance_m,elevation_m=route.points[-1].elevation_m,gradient_pct=0))
    base=dict(profile=profile, distance_m=route.total_distance_m, name=route.name,
              assumptions='Schätzung: windstill, Rennrad 9 kg, CdA 0,32 m², Crr 0,005. Verkehr, Belag und Kreuzungen sind nicht geprüft.',
              workout_seconds=sum(b.duration_s for b in blocks), placements=[])
    if solution is None:
        return {**base,'status':'no_fit','headline':'Kein passender Start gefunden',
                'message':'Die Route ist zu kurz oder der Hauptteil trifft auf ungeeignete Gefälle bzw. Steigungen. Wähle eine andere Strecke; die Intervalle bleiben unverändert.'}
    start,end,placements=solution
    def easy_time(a,b):
        return sum(max(0,min(b,s.start_m+s.length_m)-max(a,s.start_m))/float(speeds[round(ftp*.55)][i])
                   for i,s in enumerate(segments))
    extra=easy_time(warm_end,start)+easy_time(end,route.total_distance_m)
    total=base['workout_seconds']+extra
    # Dose approximation, not measured Normalized Power / exact TSS.
    dose=sum(b.duration_s/3600*b.pct_ftp**2*100 for b in blocks)+extra/3600*.55**2*100
    return {**base,'status':'terrain_fit','headline':'Deine Intervalle haben Platz',
            'message':'Starte den Hauptteil am markierten Abschnitt per Lap-Taste. Prüfe vor Ort, ob die Straße frei und übersichtlich ist.',
            'placements':placements,'main_start_m':start,'extra_seconds':round(extra),
            'total_seconds':round(total),'estimated_tss':round(dose),
            'duration_range_seconds':[round(total*.8),round(total*1.25)]}
