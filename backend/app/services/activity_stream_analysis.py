"""Derive display-ready analysis from a stored per-second activity stream blob.

Pure computation over the `activity_streams.streams` JSON (the aligned 1 Hz
arrays produced by `stream_extraction`). Feeds the Run/Ride analysis screens
with the data Garmin actually recorded: per-km splits, HR-zone time, GPS
polyline, elevation profile, and sport-specific dynamics (running dynamics for
runs; cycling dynamics — L/R balance, platform-center-offset, power phase,
stamina — for rides). No DB, no network.
"""
from __future__ import annotations

from statistics import mean
from typing import Any


def _nn(arr: list | None) -> list[float]:
    if not arr:
        return []
    return [float(v) for v in arr if v is not None]


def _avg(arr: list | None) -> float | None:
    vals = _nn(arr)
    return round(mean(vals), 2) if vals else None


def _maxv(arr: list | None) -> float | None:
    vals = _nn(arr)
    return round(max(vals), 2) if vals else None


def _downsample(arr: list, target: int) -> list:
    """Evenly pick ~target samples (keep first + last)."""
    n = len(arr)
    if n <= target:
        return arr
    step = n / target
    out = [arr[int(i * step)] for i in range(target)]
    out[-1] = arr[-1]
    return out


def _hr_zones(hr: list[float], max_hr: float | None) -> dict[str, Any] | None:
    """Time-in-zone seconds using %HRmax bands (Z1<60, Z2 60-70, Z3 70-80,
    Z4 80-90, Z5 90+). Falls back to the stream max when no device max given."""
    vals = _nn(hr)
    if not vals:
        return None
    hrmax = max_hr or max(vals)
    if hrmax <= 0:
        return None
    bounds = [0.60, 0.70, 0.80, 0.90]
    secs = [0, 0, 0, 0, 0]
    for v in vals:
        frac = v / hrmax
        z = 0
        for i, b in enumerate(bounds):
            if frac >= b:
                z = i + 1
        secs[z] += 1
    return {"secs": secs, "max_hr": round(hrmax)}


def _splits(distance: list, moving_s: int, hr: list, altitude: list) -> list[dict]:
    """Per-kilometre splits from the cumulative distance channel. Each sample is
    one moving second, so the sample index is elapsed moving seconds."""
    dist = distance or []
    out: list[dict] = []
    if not dist:
        return out
    n = len(dist)
    km_target = 1000.0
    last_idx = 0
    km = 1
    for i in range(n):
        d = dist[i]
        if d is None:
            continue
        if d >= km_target:
            seg_s = i - last_idx
            seg_hr = _nn(hr[last_idx:i]) if hr else []
            elev_seg = _nn(altitude[last_idx:i]) if altitude else []
            elev_delta = (elev_seg[-1] - elev_seg[0]) if len(elev_seg) >= 2 else None
            out.append({
                "km": km,
                "pace_s_per_km": round(seg_s),  # 1 km took seg_s moving seconds
                "avg_hr": round(mean(seg_hr)) if seg_hr else None,
                "elev_delta_m": round(elev_delta, 1) if elev_delta is not None else None,
            })
            km += 1
            last_idx = i
            km_target += 1000.0
    # trailing partial km
    if n - last_idx > 30 and dist[-1] is not None:
        rem_m = dist[-1] - (km - 1) * 1000.0
        if rem_m > 100:
            seg_s = n - last_idx
            seg_hr = _nn(hr[last_idx:]) if hr else []
            pace = round(seg_s / (rem_m / 1000.0))
            out.append({
                "km": round((km - 1) + rem_m / 1000.0, 2),
                "pace_s_per_km": pace,
                "avg_hr": round(mean(seg_hr)) if seg_hr else None,
                "elev_delta_m": None,
                "partial": True,
            })
    return out


def _elevation_profile(altitude: list) -> dict | None:
    vals_idx = [(i, v) for i, v in enumerate(altitude or []) if v is not None]
    if len(vals_idx) < 2:
        return None
    vals = [v for _, v in vals_idx]
    gain = 0.0
    for a, b in zip(vals, vals[1:]):
        if b > a:
            gain += b - a
    prof = _downsample(vals, 120)
    return {
        "profile": [round(v, 1) for v in prof],
        "gain_m": round(gain),
        "min_m": round(min(vals), 1),
        "max_m": round(max(vals), 1),
    }


def _gps(latitude: list, longitude: list) -> dict | None:
    pts = [
        [lat, lng]
        for lat, lng in zip(latitude or [], longitude or [])
        if lat is not None and lng is not None
    ]
    if len(pts) < 2:
        return None
    lats = [p[0] for p in pts]
    lngs = [p[1] for p in pts]
    return {
        "polyline": _downsample(pts, 300),
        "bounds": {"min_lat": min(lats), "max_lat": max(lats),
                   "min_lng": min(lngs), "max_lng": max(lngs)},
        "start": pts[0],
        "point_count": len(pts),
    }


# The history list draws one tiny route sketch per ride. 48 points is enough
# for a 64 px thumbnail to read as the right shape, and small enough that a
# 50-row page stays a modest payload.
ROUTE_SKETCH_POINTS = 48

# ONE ride, drawn across a whole phone screen, is a different problem. 48 points
# over a 50 km ride is a point every kilometre: every bend is cut, every switch-
# back becomes a straight line, and a rider looking at the roads they know sees
# a shape that is NOT the ride they did — which is worse than no map, because it
# is confidently wrong. 1 200 keeps the corners at map zoom and still costs
# about 25 KB, which is nothing against the basemap tiles beside it.
ROUTE_DETAIL_POINTS = 1200


def route_sketch_polyline(streams: dict | None, max_points: int = ROUTE_SKETCH_POINTS) -> list[list[float]] | None:
    """[[lat, lng], …] for a list-sized route sketch, or None without GPS.

    Strided, never averaged: averaging smooths real corners into a track the
    athlete never rode. Reuses the same even-stride downsampler the per-ride
    stream analysis uses, so the sketch is a subset of that polyline rather
    than a second interpretation of the track.
    """
    s = streams or {}
    pts = [
        [float(lat), float(lng)]
        for lat, lng in zip(s.get("latitude") or [], s.get("longitude") or [])
        if lat is not None and lng is not None
    ]
    if len(pts) < 2:
        return None
    return _downsample(pts, max_points)


def analyze_stream_blob(streams: dict, *, sport: str, device_max_hr: float | None = None) -> dict[str, Any]:
    """Return the display bundle for one activity's stored stream blob."""
    s = streams or {}
    hr = s.get("heart_rate") or []
    dist = s.get("distance") or []
    alt = s.get("altitude") or []
    speed = _nn(s.get("speed"))
    duration_s = len(s.get("heart_rate") or s.get("power") or s.get("cadence") or [])

    out: dict[str, Any] = {
        "has_streams": duration_s > 0,
        "sport": sport,
        "duration_s": duration_s,
        "avg_hr": _avg(hr),
        "max_hr": _maxv(hr),
        "hr_zones": _hr_zones(hr, device_max_hr),
        "splits": _splits(dist, duration_s, hr, alt),
        "elevation": _elevation_profile(alt),
        "gps": _gps(s.get("latitude"), s.get("longitude")),
        "avg_speed_ms": round(mean(speed), 3) if speed else None,
        "avg_cadence": _avg(s.get("cadence")),
        "avg_power": _avg(s.get("power")) if _nn(s.get("power")) and any(v > 0 for v in _nn(s.get("power"))) else None,
    }

    if sport == "running":
        gap = _nn(s.get("grade_adjusted_speed"))
        out["run_dynamics"] = {
            "cadence_spm": _avg(s.get("cadence")),
            "vertical_oscillation_mm": _avg(s.get("vertical_oscillation")),
            "ground_contact_ms": _avg(s.get("ground_contact_time")),
            "vertical_ratio_pct": _avg(s.get("vertical_ratio")),
            "stride_length_cm": _avg(s.get("stride_length")),
            "gap_pace_s_per_km": round(1000.0 / mean(gap)) if gap and mean(gap) > 0 else None,
        }
    elif sport == "cycling":
        rb = _nn(s.get("right_balance"))
        # Garmin stores the right-leg %. Present left/right for display.
        right = round(mean(rb), 1) if rb else None
        out["bike_dynamics"] = {
            "balance_left_pct": round(100 - right, 1) if right is not None else None,
            "balance_right_pct": right,
            "pco_left_mm": _avg(s.get("pco_left")),
            "pco_right_mm": _avg(s.get("pco_right")),
            "power_phase_left": [_avg(s.get("power_phase_left_start")), _avg(s.get("power_phase_left_end"))]
                if _nn(s.get("power_phase_left_start")) else None,
            "power_phase_right": [_avg(s.get("power_phase_right_start")), _avg(s.get("power_phase_right_end"))]
                if _nn(s.get("power_phase_right_start")) else None,
            "stamina_start_pct": (_nn(s.get("stamina"))[0] if _nn(s.get("stamina")) else None),
            "stamina_end_pct": (_nn(s.get("stamina"))[-1] if _nn(s.get("stamina")) else None),
            "stamina_min_pct": (round(min(_nn(s.get("stamina")))) if _nn(s.get("stamina")) else None),
            "stamina_curve": [round(v) for v in _downsample(_nn(s.get("stamina")), 60)] if _nn(s.get("stamina")) else None,
            "performance_condition": (round(mean(_nn(s.get("performance_condition")))) if _nn(s.get("performance_condition")) else None),
        }
    return out
