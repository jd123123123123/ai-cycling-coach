"""Segment a ride into climbs / descents / flats from altitude + distance.

Pure module (no DB/network). GPS/barometric altitude is noisy, so altitude is
smoothed with a centered moving average before gradients are computed. A second
is classified climb / descent / flat by its smoothed grade against
``min_climb_grade`` (with the negative mirror for descents); contiguous runs of
the same kind become segments, and runs shorter than ``min_segment_s`` are merged
into the neighbour they most resemble so GPS noise and momentary kicks don't
fragment the ride.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Segment:
    kind: str            # "climb" | "descent" | "flat"
    start_s: int
    end_s: int           # exclusive
    duration_s: int
    distance_m: float
    elev_gain_m: float
    elev_loss_m: float
    avg_grade_pct: float
    avg_power: float | None
    avg_speed_ms: float | None


def _clean(series: list[float | None] | None, n: int) -> list[float] | None:
    """Forward/back-fill a carry-filled series to a full float array, or None."""
    if not series:
        return None
    out: list[float | None] = list(series[:n]) + [None] * max(0, n - len(series))
    last: float | None = None
    for i, v in enumerate(out):
        if v is not None:
            last = float(v)
        out[i] = last
    if last is None:
        return None                       # never had a reading
    # back-fill any leading Nones with the first real value
    first = next(v for v in out if v is not None)
    return [first if v is None else float(v) for v in out]


def _smooth(values: list[float], window_s: int) -> list[float]:
    if window_s <= 1:
        return values
    half = window_s // 2
    n = len(values)
    out = []
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        out.append(sum(values[lo:hi]) / (hi - lo))
    return out


def _classify(grade: float, min_climb_grade: float) -> str:
    if grade >= min_climb_grade:
        return "climb"
    if grade <= -min_climb_grade:
        return "descent"
    return "flat"


def segment_ride(
    altitude: list[float | None],
    distance: list[float | None],
    power: list[float] | None = None,
    speed: list[float | None] | None = None,
    *,
    min_climb_grade: float = 3.0,
    min_segment_s: int = 30,
    smooth_window_s: int = 15,
) -> list[Segment]:
    """Segment a ride; see module docstring. Returns [] on missing/short input."""
    n = len(altitude)
    if n < min_segment_s + 1:
        return []
    alt = _clean(altitude, n)
    dist = _clean(distance, n)
    if alt is None or dist is None:
        return []

    smooth_alt = _smooth(alt, smooth_window_s)
    # Per-second grade from smoothed altitude over the distance travelled.
    kinds: list[str] = []
    for i in range(n):
        d_alt = smooth_alt[min(i + 1, n - 1)] - smooth_alt[i]
        d_dist = dist[min(i + 1, n - 1)] - dist[i]
        grade = (d_alt / d_dist * 100.0) if d_dist > 0.1 else 0.0
        kinds.append(_classify(grade, min_climb_grade))

    # Contiguous runs of the same kind.
    runs: list[list[int]] = []  # [start, end)
    start = 0
    for i in range(1, n):
        if kinds[i] != kinds[start]:
            runs.append([start, i])
            start = i
    runs.append([start, n])

    # Merge sub-threshold runs into the previous run (or the next if first).
    merged: list[list[int]] = []
    for run in runs:
        s, e = run
        if e - s < min_segment_s and merged:
            merged[-1][1] = e
        elif e - s < min_segment_s and not merged:
            merged.append(run)  # keep; may absorb the next
        else:
            if merged and merged[-1][1] - merged[-1][0] < min_segment_s:
                merged[-1][1] = e  # absorb the tiny leading run
            else:
                merged.append(run)

    segments: list[Segment] = []
    for s, e in merged:
        dur = e - s
        d_m = dist[e - 1] - dist[s]
        gain = sum(max(0.0, alt[j + 1] - alt[j]) for j in range(s, e - 1))
        loss = sum(max(0.0, alt[j] - alt[j + 1]) for j in range(s, e - 1))
        grade_pct = ((alt[e - 1] - alt[s]) / d_m * 100.0) if d_m > 0.1 else 0.0
        kind = _classify(grade_pct, min_climb_grade)
        avg_power = round(sum(power[s:e]) / dur, 1) if power else None
        seg_speed = [v for v in (speed[s:e] if speed else []) if v is not None]
        avg_speed = round(sum(seg_speed) / len(seg_speed), 2) if seg_speed else None
        segments.append(Segment(
            kind=kind, start_s=s, end_s=e, duration_s=dur,
            distance_m=round(d_m, 1), elev_gain_m=round(gain, 1),
            elev_loss_m=round(loss, 1), avg_grade_pct=round(grade_pct, 2),
            avg_power=avg_power, avg_speed_ms=avg_speed,
        ))
    return segments
