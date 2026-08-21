"""Derive display-ready analysis from a stored per-second activity stream blob.

Pure computation over the `activity_streams.streams` JSON (the aligned 1 Hz
arrays produced by `stream_extraction`). Feeds the Run/Ride analysis screens
with the data Garmin actually recorded: per-km splits, HR-zone time, GPS
polyline, elevation profile, and sport-specific dynamics (running dynamics for
runs; cycling dynamics — L/R balance, platform-center-offset, power phase,
stamina — for rides). No DB, no network.
"""
from __future__ import annotations

import math
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


#: Metres of allowed deviation for each budget. These are the real lever —
#: `max_points` is only a ceiling now.
ROUTE_DETAIL_TOLERANCE_M = 10.0
ROUTE_SKETCH_TOLERANCE_M = 400.0

#: Degrees of latitude per metre, near enough anywhere on Earth.
_DEG_PER_M = 1.0 / 111_320.0


def _rdp(pts: list[list[float]], eps_deg: float, kx: float) -> list[list[float]]:
    """Ramer-Douglas-Peucker: keep the points that carry the SHAPE.

    Iterative rather than recursive on purpose — a 4 400-point Alpine track
    recurses about as deep as it has hairpins, and blowing the stack on the
    longest ride somebody has ever uploaded is a poor way to find that out.

    Longitude is scaled by cos(lat) so a "metre" means the same thing on both
    axes; without it a tolerance is ~1.5x looser east-west at Alpine latitudes
    and the algorithm quietly straightens the wrong corners.
    """
    n = len(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        x0, y0 = pts[a][1] * kx, pts[a][0]
        x1, y1 = pts[b][1] * kx, pts[b][0]
        dx, dy = x1 - x0, y1 - y0
        den = math.hypot(dx, dy)
        worst, wi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i][1] * kx, pts[i][0]
            d = (
                abs(dy * px - dx * py + x1 * y0 - y1 * x0) / den if den
                else math.hypot(px - x0, py - y0)
            )
            if d > worst:
                worst, wi = d, i
        if worst > eps_deg:
            keep[wi] = True
            stack.append((a, wi))
            stack.append((wi, b))
    return [p for p, k in zip(pts, keep) if k]


#: Gradient is a DERIVATIVE, so it amplifies whatever the altimeter did. Real
#: files are worse than they look: the Maratona export steps more than 5 m
#: between adjacent points 620 times, over a median spacing of 18 m, so single
#: steps range from -37 % to +36 % on a road that never exceeds about 12 %.
#: 200 m is long enough to average that away and short enough to keep a ramp —
#: a 200 m stretch of an Alpine hairpin is genuinely one gradient.
_GRADE_WINDOW_M = 200.0

#: Nothing a bicycle is ridden up is steeper than this. Beyond it the number is
#: the altimeter talking, not the road, and a map that paints a 45 % wall on a
#: Dolomites pass is lying more loudly than one that says 25 %. Clamped rather
#: than discarded: the stretch IS steep, and its neighbours should still see it
#: as the steepest thing around.
_GRADE_MAX_PCT = 25.0


def route_grades(streams: dict | None, polyline: list[list[float]] | None) -> list[float] | None:
    """Percent gradient at each point of `polyline`, or None without altitude.

    WHY THIS IS SAMPLED BY DISTANCE-ALONG rather than by index. The polyline
    that reaches the client is not the recorded track: it has been simplified,
    and on a matched ride it is the ROAD's geometry, which shares no points with
    the recording at all. What the two do share is the ride — same start, same
    finish, same order — so a point four tenths of the way along one is four
    tenths of the way along the other.

    SMOOTHED OVER 100 m, and that is not cosmetic. Gradient is a derivative, so
    it amplifies noise: a barometer wandering a metre between two points ten
    metres apart reports 10 %, and a route coloured off raw samples flickers
    between "flat" and "wall" for its whole length. A hundred metres is short
    enough to keep a real ramp and long enough that the wander averages out.
    """
    s = streams or {}
    alt = [float(a) for a in (s.get("altitude") or []) if a is not None]
    lat = [float(a) for a in (s.get("latitude") or []) if a is not None]
    lng = [float(a) for a in (s.get("longitude") or []) if a is not None]
    n = min(len(alt), len(lat), len(lng))
    if not polyline or n < 4:
        return None

    # Cumulative distance along the RECORDING, and the gradient at each of its
    # points over a 100 m window.
    kx = math.cos(math.radians(sum(lat[:n]) / n))
    cum = [0.0]
    for i in range(1, n):
        dy = (lat[i] - lat[i - 1]) * 111_320.0
        dx = (lng[i] - lng[i - 1]) * 111_320.0 * kx
        cum.append(cum[-1] + math.hypot(dx, dy))
    total = cum[-1]
    if total <= 0:
        return None

    # LEAST SQUARES OVER THE WINDOW, NOT ITS TWO ENDPOINTS. Differencing the
    # ends of a 200 m window still carries the FULL noise of those two samples —
    # widening it changes nothing, because only two numbers are ever read. A
    # test with 7 m of jitter on a true 6 % climb returned values from −8 % to
    # +13 %: the median was right and every individual reading was wrong, which
    # is the worst kind of correct.
    #
    # Fitting a line through every point in the window uses all of them, so the
    # jitter cancels instead of landing on the answer. Prefix sums keep it O(n)
    # rather than O(n·window).
    sx = [0.0] * (n + 1)
    sy = [0.0] * (n + 1)
    sxy = [0.0] * (n + 1)
    sxx = [0.0] * (n + 1)
    for i in range(n):
        x, y = cum[i], alt[i]
        sx[i + 1] = sx[i] + x
        sy[i + 1] = sy[i] + y
        sxy[i + 1] = sxy[i] + x * y
        sxx[i + 1] = sxx[i] + x * x

    grades: list[float] = []
    j = 0
    k = 0
    for i in range(n):
        while j < n - 1 and cum[j] < cum[i] - _GRADE_WINDOW_M / 2:
            j += 1
        k = max(k, i)
        while k < n - 1 and cum[k] < cum[i] + _GRADE_WINDOW_M / 2:
            k += 1
        run = cum[k] - cum[j]
        # Half the window is the shortest span worth fitting across. Below it —
        # the first and last points of a ride, or a stretch recorded while
        # stationary — there is not enough road for a slope to mean anything.
        m = k - j + 1
        if run < _GRADE_WINDOW_M / 2 or m < 3:
            grades.append(0.0)
            continue
        wx = sx[k + 1] - sx[j]
        wy = sy[k + 1] - sy[j]
        wxy = sxy[k + 1] - sxy[j]
        wxx = sxx[k + 1] - sxx[j]
        denom = m * wxx - wx * wx
        if denom <= 0:
            grades.append(0.0)
            continue
        slope = (m * wxy - wx * wy) / denom          # metres of rise per metre
        grades.append(max(-_GRADE_MAX_PCT, min(_GRADE_MAX_PCT, slope * 100.0)))

    # Now read that off at each output point's own position along the ride.
    out_cum = [0.0]
    for a, b in zip(polyline, polyline[1:]):
        dy = (b[0] - a[0]) * 111_320.0
        dx = (b[1] - a[1]) * 111_320.0 * kx
        out_cum.append(out_cum[-1] + math.hypot(dx, dy))
    out_total = out_cum[-1] or 1.0

    out: list[float] = []
    for c in out_cum:
        target = (c / out_total) * total
        # cum is sorted, so a walk is enough and a bisect is overkill
        idx = min(n - 1, max(0, int((c / out_total) * (n - 1))))
        while idx < n - 1 and cum[idx] < target:
            idx += 1
        while idx > 0 and cum[idx] > target:
            idx -= 1
        out.append(round(grades[idx], 1))
    return out


def route_sketch_polyline(
    streams: dict | None,
    max_points: int = ROUTE_SKETCH_POINTS,
    tolerance_m: float = ROUTE_SKETCH_TOLERANCE_M,
) -> list[list[float]] | None:
    """[[lat, lng], …] for a route, or None without GPS.

    SHAPE-AWARE, NOT EVENLY STRIDED. Averaging smooths real corners into a track
    the athlete never rode, which is why this never averaged — but taking every
    n-th point throws corners away a different way: it spends its whole budget
    evenly, so a straight valley road gets the same density as a switchback and
    the hairpins are simply missed between samples.

    Douglas-Peucker spends points where the line CHANGES. Measured on the
    Maratona dles Dolomites (138.6 km, 4 416 points, seven passes), at the SAME
    point budget:

        stride    48 pts   87.3 km traced   1 316 m worst deviation
        RDP       47 pts  102.3 km traced     425 m
        stride 1 200 pts  133.9 km traced      41 m
        RDP    1 200 pts  136.2 km traced      12 m

    41 m is far enough for the drawn line to sit visibly beside the actual road
    at map zoom; 12 m is inside the width of the road. Same bytes on the wire,
    three times the fidelity.

    `tolerance_m` is the real lever and `max_points` is a ceiling: the tolerance
    loosens until the result fits, so a ride long enough to defeat the budget
    still comes back simplified rather than truncated. Costs 4-10 ms for 4 400
    points.
    """
    s = streams or {}
    pts = [
        [float(lat), float(lng)]
        for lat, lng in zip(s.get("latitude") or [], s.get("longitude") or [])
        if lat is not None and lng is not None
    ]
    if len(pts) < 2:
        return None
    if len(pts) <= max_points:
        return pts

    kx = math.cos(math.radians(sum(p[0] for p in pts) / len(pts)))
    eps = tolerance_m * _DEG_PER_M
    out = _rdp(pts, eps, kx)
    # Loosen until it fits. Twelve doublings is a factor of 2 000 — past that
    # the track is pathological and the stride fallback is the honest answer.
    for _ in range(12):
        if len(out) <= max_points:
            return out
        eps *= 1.8
        out = _rdp(pts, eps, kx)
    return _downsample(out, max_points)


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
