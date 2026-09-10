"""Small, aligned chart payload; no GPS or private analysis fields."""
import math

CHANNELS = ('power', 'heart_rate', 'altitude', 'cadence', 'distance')

def chart_samples(streams, max_points=240):
    if not isinstance(streams, dict):
        return []
    channels = {key: values for key in CHANNELS if isinstance(values := streams.get(key), list)}
    size = max((len(v) for v in channels.values()), default=0)
    if size < 2:
        return []
    count = min(size, max_points)
    samples = []
    for i in range(count):
        start, end = i * size // count, (i + 1) * size // count
        sample = {'position': round((start + end - 1) / 2 / (size - 1), 6)}
        for key in CHANNELS:
            values = channels.get(key, [])[start:end]
            valid = [v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
                     and (key == 'altitude' or v >= 0) and (key != 'heart_rate' or v > 0)]
            sample[key] = round(sum(valid) / len(valid), 1) if valid else None
        samples.append(sample)
    return add_road_grade(samples)


def _positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def ride_zones(profile, started_at, sport='cycling'):
    """Only this rider's stored anchors. Current fallbacks are explicitly dated as current."""
    from datetime import datetime, timezone
    from app.services.power_profile_view import power_zones
    from app.services.hr_zones import hr_band_for_zone

    if profile is None:
        return {}
    result = {}
    ftp, source = getattr(profile, 'ftp_watts', None), 'ftp_current'
    history = []
    if isinstance(started_at, datetime):
        at = started_at.replace(tzinfo=timezone.utc) if started_at.tzinfo is None else started_at
        for entry in getattr(profile, 'ftp_history', None) or []:
            if not isinstance(entry, dict) or not _positive(entry.get('ftp_watts')):
                continue
            try:
                stamp = datetime.fromisoformat(entry['measured_at'].replace('Z', '+00:00'))
                stamp = stamp.replace(tzinfo=timezone.utc) if stamp.tzinfo is None else stamp
                if stamp <= at:
                    history.append((stamp, entry['ftp_watts']))
            except (KeyError, ValueError, TypeError, AttributeError):
                continue
    if history:
        ftp, source = max(history, key=lambda p: p[0])[1], 'ftp_history'
    if _positive(ftp) and sport == 'cycling':
        canonical = power_zones(ftp)
        result['power'] = {'basis': source, 'reference': ftp, 'bands': [
            {'id': i + 1, 'name': z['name_de'], 'upper': z['high']} for i, z in enumerate(canonical)
        ]}
    lthr = getattr(profile, 'lthr_running' if sport == 'running' else 'lthr_cycling', None)
    maximum = getattr(profile, 'max_heart_rate', None)
    if _positive(lthr):
        result['heart_rate'] = {'basis': 'lthr_current', 'reference': lthr, 'bands': [
            {'id': i + 1, 'name': name, 'upper': hr_band_for_zone(i + 1, lthr)[1] if i < 5 else None}
            for i, name in enumerate(['Erholung', 'Grundlage', 'Tempo', 'Schwelle', 'Intensiv', 'Sehr intensiv'])
        ]}
    elif _positive(maximum):
        result['heart_rate'] = {'basis': 'hrmax_current', 'reference': maximum, 'bands': [
            {'id': i + 1, 'name': name, 'upper': round(maximum * fraction) if fraction else None}
            for i, (name, fraction) in enumerate(zip(
                ['Erholung', 'Locker', 'Ausdauer', 'Intensiv', 'Maximum'], [.6, .7, .8, .9, None]))
        ]}
    return result


def add_road_grade(samples):
    """Slope of neighbouring measured distance/elevation sections, not slope of screen pixels.

    No interpolation over missing sections, distance resets or stationary samples.
    The 30 m minimum avoids amplifying altitude noise at a stop.
    """
    for i, sample in enumerate(samples):
        sample['grade_pct'] = None
        nearby = samples[max(0, i - 1):min(len(samples), i + 2)]
        if len(nearby) < 2 or any(p.get('distance') is None or p.get('altitude') is None for p in nearby):
            continue
        if any(b['distance'] < a['distance'] for a, b in zip(nearby, nearby[1:])):
            continue
        distance = nearby[-1]['distance'] - nearby[0]['distance']
        if distance < 30:
            continue
        grade = 100 * (nearby[-1]['altitude'] - nearby[0]['altitude']) / distance
        sample['grade_pct'] = round(grade, 1) if abs(grade) <= 40 else None
    return samples
