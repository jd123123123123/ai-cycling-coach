"""Read-only ride presentation. Stored 1 Hz samples, dated anchors, no AI call."""
import math
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from app.services.crew_ride_telemetry import add_road_grade

CHANNELS = ('power', 'heart_rate', 'altitude', 'cadence', 'distance', 'speed')
DURATIONS = (1, 5, 10, 15, 30, 60, 120, 180, 300, 600, 1200)


def number(value, positive=False, negative=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    if (positive and value <= 0) or (not negative and value < 0):
        return None
    return float(value)


def stamp(value):
    try:
        dt = value if isinstance(value, datetime) else datetime.fromisoformat(value.replace('Z', '+00:00'))
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except (AttributeError, ValueError, TypeError):
        return None


def rider_zone(profile):
    try:
        return ZoneInfo(getattr(profile, 'timezone', None) or 'UTC')
    except (ZoneInfoNotFoundError, ValueError):
        return timezone.utc


def chart_samples(raw, max_points=360):
    """Each stored index is a second; never stretch elapsed time to moving time.

    Chart values average each bin. Zone totals and MMP are computed separately
    from full-resolution data, never from these averages.
    """
    if not isinstance(raw, dict):
        return []
    channels = {k: raw.get(k, []) if isinstance(raw.get(k), list) else [] for k in CHANNELS}
    size = max((len(v) for v in channels.values()), default=0)
    count = min(size, max_points)
    samples = []
    for i in range(count):
        start, end = i * size // count, (i + 1) * size // count
        sample = {'seconds': (start + end - 1) / 2}
        for key, values in channels.items():
            valid = [n for v in values[start:end] if (n := number(v, positive=key == 'heart_rate', negative=key == 'altitude')) is not None]
            value = sum(valid) / len(valid) if valid else None
            sample[key] = round(value * (3.6 if key == 'speed' else 1), 2) if value is not None else None
        samples.append(sample)
    add_road_grade(samples)
    for s in samples:
        s['grade'] = s.pop('grade_pct')
    return samples


def ftp_context(activity, profile):
    at = stamp(activity.started_at)
    zone = rider_zone(profile)
    dated = []
    for entry in getattr(profile, 'ftp_history', None) or []:
        if not isinstance(entry, dict):
            continue
        when, watts = stamp(entry.get('measured_at')), number(entry.get('ftp_watts'), positive=True)
        if when is not None and watts is not None and at is not None and when <= at:
            dated.append((when, watts))
    dated.sort(key=lambda p: p[0])
    # Keep the last entry per calendar day, rather than duplicate React keys.
    daily = {}
    for when, watts in dated:
        day = when.astimezone(zone).date().isoformat()
        daily[day] = {'date': day, 'watts': watts, 'source': 'Gespeicherte FTP'}
    snapshot = number(getattr(activity, 'ftp_watts_at_scoring', None), positive=True)
    return snapshot if snapshot is not None else dated[-1][1] if dated else None, list(daily.values())


def zone_seconds(raw, ftp):
    values = raw.get('power') if isinstance(raw, dict) else None
    if not ftp or not isinstance(values, list) or not any(number(v) is not None for v in values):
        return [None] * 7
    seconds = [0] * 7
    for v in values:
        watts = number(v)
        if watts is not None:
            index = next(i for i, edge in enumerate((.55, .75, .9, 1.05, 1.2, 1.5, math.inf)) if watts <= ftp * edge)
            seconds[index] += 1
    return seconds


def best_efforts(curve, prior_curves):
    curve = curve if isinstance(curve, dict) else {}
    results = []
    for duration in DURATIONS:
        value = number(curve.get(str(duration)), positive=True)
        if value is None:
            continue
        previous = [v for c in prior_curves if isinstance(c, dict) and (v := number(c.get(str(duration)), positive=True)) is not None]
        results.append({'seconds': duration, 'watts': value, 'previous': max(previous) if previous else None})
    return results


def contributions(activity, prior, zone):
    date = stamp(activity.started_at).astimezone(zone).date().isoformat()
    columns = [('distance', 'Kilometer', 'km', 'distance_meters', .001), ('time', 'Sattelzeit', 'h', 'duration_seconds', 1), ('ascent', 'Höhenmeter', 'hm', 'elevation_gain_m', 1)]
    totals = {key: 0.0 for key, *_ in columns}
    history = [{'date': date[:4] + '-01-01', 'totals': dict(totals)}]
    for ride in prior:
        for key, _, _, attr, factor in columns:
            value = number(getattr(ride, attr, None))
            totals[key] = totals[key] + value * factor if value is not None and totals[key] is not None else None
        day = stamp(ride.started_at).astimezone(zone).date().isoformat()
        if history[-1]['date'] == day:
            history[-1] = {'date': day, 'totals': dict(totals)}
        else:
            history.append({'date': day, 'totals': dict(totals)})
    return {'period': f'Dein Jahr {date[:4]}', 'rideDate': date, 'history': history, 'metrics': [
        {'key': key, 'label': label, 'unit': unit, 'before': totals[key], 'added': value * factor if (value := number(getattr(activity, attr, None))) is not None else None}
        for key, label, unit, attr, factor in columns
    ]}
