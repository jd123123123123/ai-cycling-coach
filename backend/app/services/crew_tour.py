"""GPX tour parsing for crew events.

Parses an uploaded club-ride .gpx into the small summary the V3 Social card
needs: a downsampled [[lat, lng], …] polyline (~200 points), total distance in
metres, and total elevation gain in metres. Nothing here touches the DB or the
filesystem — the API layer owns persistence; this module is pure parsing so it
is trivially unit-testable from an in-memory GPX string.
"""

from __future__ import annotations

from dataclasses import dataclass

import gpxpy

# Keep the card polyline JSON small: never store more than this many points.
MAX_POLYLINE_POINTS = 200
# Round coordinates — ~5 decimals is ~1 m precision, plenty for a card map.
_COORD_DP = 5


@dataclass
class ParsedTour:
    polyline: list[list[float]]  # [[lat, lng], …] downsampled
    distance_m: float
    elevation_m: float  # total ascent (positive gain only)
    point_count: int  # raw track-point count before downsampling


def _downsample(points: list[list[float]], max_points: int) -> list[list[float]]:
    """Evenly pick ~max_points, always keeping the first and last point."""
    n = len(points)
    if n <= max_points:
        return points
    if max_points <= 1:
        return [points[0]]
    step = (n - 1) / (max_points - 1)
    out: list[list[float]] = []
    seen: set[int] = set()
    for i in range(max_points):
        idx = round(i * step)
        if idx >= n:
            idx = n - 1
        if idx not in seen:
            seen.add(idx)
            out.append(points[idx])
    # Guarantee the final point is included.
    if out[-1] != points[-1]:
        out.append(points[-1])
    return out


def parse_gpx(raw: str | bytes) -> ParsedTour:
    """Parse GPX text into a ParsedTour. Raises ValueError on unparseable input
    or a file with no usable track points."""
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    try:
        gpx = gpxpy.parse(raw)
    except Exception as exc:  # gpxpy raises several exception types
        raise ValueError(f"could not parse GPX: {exc}") from exc

    # Collect every track point (across tracks + segments), then fall back to
    # routes and standalone waypoints so we still render odd exports.
    raw_points: list = []
    for track in gpx.tracks:
        for seg in track.segments:
            raw_points.extend(seg.points)
    if not raw_points:
        for route in gpx.routes:
            raw_points.extend(route.points)
    if not raw_points:
        raw_points = list(gpx.waypoints)

    coords = [
        [round(p.latitude, _COORD_DP), round(p.longitude, _COORD_DP)]
        for p in raw_points
        if p.latitude is not None and p.longitude is not None
    ]
    if not coords:
        raise ValueError("GPX file contains no track points")

    # Distance + elevation gain: gpxpy's helpers already handle haversine +
    # positive-only ascent across tracks. Fall back to segment sums if the
    # top-level helpers return nothing (e.g. route-only files).
    distance_m = 0.0
    elevation_m = 0.0
    try:
        distance_m = float(gpx.length_2d() or 0.0)
    except Exception:
        distance_m = 0.0
    try:
        ud = gpx.get_uphill_downhill()
        elevation_m = float(ud.uphill or 0.0) if ud else 0.0
    except Exception:
        elevation_m = 0.0

    return ParsedTour(
        polyline=_downsample(coords, MAX_POLYLINE_POINTS),
        distance_m=round(distance_m, 1),
        elevation_m=round(elevation_m, 1),
        point_count=len(coords),
    )
