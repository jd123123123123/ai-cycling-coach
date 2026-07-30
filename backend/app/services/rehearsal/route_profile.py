"""Route → fixed-length segments carrying gradient and bearing, grouped into climbs.

One resampling pass produces both gradient and bearing, so the wind projection
and the power target can never describe different stretches of road.

Climb detection here is intentionally simpler than services/climbing_analysis.py:
that module detects climbs in a RIDDEN activity from time-series streams, while
this works on a route with no time dimension at all. Same thresholds, different
input — hence a separate, tiny implementation rather than a forced reuse.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

from app.services.climb_companion import bearing_deg
from app.services.rehearsal.route_source import RehearsalRoute

SEGMENT_LENGTH_M = 150.0

# A climb is a run of segments averaging >= this gradient, long enough to matter.
CLIMB_MIN_GRADE_PCT = 3.0
CLIMB_MIN_LENGTH_M = 500.0
CLIMB_MIN_GAIN_M = 30.0
# A dip below the threshold shorter than this does not end the climb.
CLIMB_BRIDGE_M = 300.0


@dataclass(frozen=True)
class Segment:
    start_m: float
    length_m: float
    gradient_pct: float
    bearing_deg: float
    elevation_m: float
    climb_id: int | None = None


@dataclass(frozen=True)
class Climb:
    climb_id: int
    start_m: float
    end_m: float
    length_m: float
    elev_gain_m: float
    avg_grade_pct: float


def _interpolate(route: RehearsalRoute, target_m: float) -> tuple[float, float, float]:
    """(elevation, lat, lng) at a distance along the route, linearly interpolated."""
    pts = route.points
    lo, hi = 0, len(pts) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if pts[mid].distance_m < target_m:
            lo = mid + 1
        else:
            hi = mid
    i = max(1, lo)
    a, b = pts[i - 1], pts[i]
    span = b.distance_m - a.distance_m
    t = 0.0 if span <= 0 else (target_m - a.distance_m) / span
    t = min(1.0, max(0.0, t))
    return (
        a.elevation_m + (b.elevation_m - a.elevation_m) * t,
        a.lat + (b.lat - a.lat) * t,
        a.lng + (b.lng - a.lng) * t,
    )


def build_segments(
    route: RehearsalRoute, segment_length_m: float = SEGMENT_LENGTH_M
) -> list[Segment]:
    """Resample the route into fixed-length segments with gradient and bearing."""
    total = route.total_distance_m
    out: list[Segment] = []
    start = 0.0
    while start < total - 1e-6:
        length = min(segment_length_m, total - start)
        e0, lat0, lng0 = _interpolate(route, start)
        e1, lat1, lng1 = _interpolate(route, start + length)
        rise = e1 - e0
        out.append(
            Segment(
                start_m=start,
                length_m=length,
                gradient_pct=(rise / length) * 100.0 if length > 0 else 0.0,
                bearing_deg=bearing_deg(lat0, lng0, lat1, lng1),
                elevation_m=e0,
            )
        )
        start += length
    return out


def detect_climbs(segments: list[Segment]) -> list[Climb]:
    """Runs of climbing segments long enough and steep enough to name."""
    climbs: list[Climb] = []
    run: list[Segment] = []
    bridge_m = 0.0

    def close_run() -> None:
        nonlocal run, bridge_m
        if run:
            length = sum(s.length_m for s in run)
            gain = sum((s.gradient_pct / 100.0) * s.length_m for s in run)
            if length >= CLIMB_MIN_LENGTH_M and gain >= CLIMB_MIN_GAIN_M:
                climbs.append(
                    Climb(
                        climb_id=len(climbs) + 1,
                        start_m=run[0].start_m,
                        end_m=run[-1].start_m + run[-1].length_m,
                        length_m=length,
                        elev_gain_m=gain,
                        avg_grade_pct=(gain / length) * 100.0 if length else 0.0,
                    )
                )
        run = []
        bridge_m = 0.0

    for seg in segments:
        if seg.gradient_pct >= CLIMB_MIN_GRADE_PCT:
            run.append(seg)
            bridge_m = 0.0
        elif run:
            # A short dip is a false flat inside the climb, not the end of it.
            bridge_m += seg.length_m
            if bridge_m > CLIMB_BRIDGE_M:
                close_run()
            else:
                run.append(seg)
        # else: not climbing and no open run — nothing to do.
    close_run()
    return climbs


def assign_climbs(segments: list[Segment], climbs: list[Climb]) -> list[Segment]:
    """Return segments tagged with the climb they belong to (None outside climbs)."""
    out: list[Segment] = []
    for seg in segments:
        mid = seg.start_m + seg.length_m / 2.0
        cid = next(
            (c.climb_id for c in climbs if c.start_m <= mid < c.end_m), None
        )
        out.append(replace(seg, climb_id=cid))
    return out
