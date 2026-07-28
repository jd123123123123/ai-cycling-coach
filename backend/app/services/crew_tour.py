"""GPX tour parsing for crew events.

Parses an uploaded club-ride .gpx into the small summary the V3 Social card and
the event-detail page need: a downsampled [[lat, lng], …] polyline (~200
points), total distance in metres, total ascent/descent in metres, a downsampled
[[cumulative_distance_m, elevation_m], …] elevation profile (≤120 points) for
the detail page's profile chart, the steepest *sustained* gradient, and the named <wpt> pins the
ride-detail map labels ("Starnberger See", "Kloster Andechs"). Nothing
here touches the DB or the filesystem — the API layer owns persistence; this
module is pure parsing so it is trivially unit-testable from an in-memory GPX
string.
"""

from __future__ import annotations

from dataclasses import dataclass

import gpxpy
import gpxpy.geo

# Keep the card polyline JSON small: never store more than this many points.
MAX_POLYLINE_POINTS = 200
# Same convention for the elevation profile — a phone-width chart cannot resolve
# more than ~120 columns, so storing more is pure JSON weight.
MAX_PROFILE_POINTS = 120
# Named map pins we keep. A phone-width map can show roughly this many labels
# before they collide into an unreadable pile, and the JSON is stored on the
# event row that every Social card fetch already carries.
MAX_WAYPOINTS = 12
# Field caps. Long enough for real place names / a sentence of context, short
# enough that a pathological export cannot bloat the row.
_WP_NAME_MAX = 120
_WP_SYM_MAX = 60
_WP_DESC_MAX = 200
# Track points sampled when locating a waypoint along the route. The spread
# heuristic only needs to know roughly *where* on the ride a pin sits, so
# comparing against every one of a 20 000-point track would be O(pins × points)
# haversine calls for no gain in the answer.
_WP_LOCATE_SAMPLES = 2000
# Round coordinates — ~5 decimals is ~1 m precision, plenty for a card map.
_COORD_DP = 5
# Minimum travelled distance a gradient is averaged over, in metres.
#
# WHY: consecutive GPX track points are typically 5–10 m apart, and consumer
# barometric altimeters have ~1 m of per-sample noise. A single +2 m blip across
# a 6 m step reads as a 33 % wall, so the max of per-point deltas is essentially
# a noise detector — real road gradients top out around 20 %. Averaging the rise
# over at least 100 m of travel dilutes that noise by an order of magnitude
# while still resolving a genuinely steep ramp (a 100 m stretch at 15 % is a
# real feature of a climb, not a sampling artefact).
_GRADE_WINDOW_M = 100.0


@dataclass
class ParsedTour:
    polyline: list[list[float]]  # [[lat, lng], …] downsampled
    distance_m: float
    elevation_m: float  # total ascent (positive gain only)
    point_count: int  # raw track-point count before downsampling
    # [[cumulative_distance_m, elevation_m], …] downsampled to ≤120 points.
    # Empty when the GPX carries no elevation at all (common for route-only /
    # indoor exports) — we never fabricate a flat line of zeros, because the
    # chart must be able to tell "no data" from "genuinely flat".
    profile: list[list[float]]
    descent_m: float  # total descent, as a POSITIVE number
    # Steepest gradient sustained over ≥100 m, in percent; None without elevation.
    max_grade_pct: float | None
    # Named map pins from the GPX's <wpt> elements, ≤MAX_WAYPOINTS of them:
    # [{"name": str, "lat": float, "lng": float, "sym": str|None,
    #   "desc": str|None}, …], ordered along the route. Empty for a file that
    # carries no usable waypoints — we never synthesise a pin.
    waypoints: list[dict]


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


def _cumulative_distances(raw_points: list) -> list[float]:
    """Running 2D (great-circle) distance in metres along the track, starting at
    0.0 for the first point. Monotonically non-decreasing by construction —
    haversine distance is never negative — which is what the profile chart's
    x-axis relies on."""
    out = [0.0]
    total = 0.0
    for prev, cur in zip(raw_points, raw_points[1:]):
        try:
            step = gpxpy.geo.haversine_distance(
                prev.latitude, prev.longitude, cur.latitude, cur.longitude
            )
        except Exception:  # defensive: odd coordinates shouldn't kill the upload
            step = 0.0
        total += float(step or 0.0)
        out.append(total)
    return out


def _max_sustained_grade_pct(
    profile: list[list[float]], window_m: float = _GRADE_WINDOW_M
) -> float | None:
    """Steepest gradient averaged over a rolling ≥``window_m`` stretch of travel.

    Deliberately NOT the max of per-point deltas — see _GRADE_WINDOW_M for the
    barometric-noise reasoning. For every start point we walk forward to the
    first point at least ``window_m`` further along and average the rise over
    that span, then take the largest of those averages.

    Returns None when there is nothing to measure (no elevation data). For a
    route shorter than one whole window we fall back to a single span across the
    entire route rather than reporting nothing — that is still an average over
    the whole travelled distance, so the noise argument holds.
    """
    if len(profile) < 2:
        return None
    best: float | None = None
    n = len(profile)
    j = 0
    for i in range(n - 1):
        # j only ever moves forward across the whole loop, so this stays O(n).
        if j < i + 1:
            j = i + 1
        while j < n - 1 and profile[j][0] - profile[i][0] < window_m:
            j += 1
        span = profile[j][0] - profile[i][0]
        if span <= 0:
            continue
        if span < window_m and i > 0:
            # Ran off the end of a short route: only the i == 0 span (the whole
            # route) is a fair sample; shorter tail windows are noise again.
            continue
        grade = (profile[j][1] - profile[i][1]) / span * 100.0
        if best is None or grade > best:
            best = grade
    return round(best, 1) if best is not None else None


def _clean_text(value: object, limit: int) -> str | None:
    """Trim a GPX text field and cap its length; empty/whitespace becomes None."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:limit]


def _route_position_m(
    lat: float, lng: float, geo_points: list, cumulative: list[float]
) -> float:
    """Roughly how far along the route this coordinate sits, in metres.

    Nearest-track-point projection over a subsample of the track (see
    _WP_LOCATE_SAMPLES). Only used to order and de-cluster pins, so a
    sample-spacing-sized error is irrelevant; if the waypoint is nowhere near
    the track we still get a stable, deterministic position rather than an
    exception.
    """
    n = len(geo_points)
    if n == 0:
        return 0.0
    stride = max(1, n // _WP_LOCATE_SAMPLES)
    best_d: float | None = None
    best_pos = 0.0
    for i in range(0, n, stride):
        p = geo_points[i]
        try:
            d = float(
                gpxpy.geo.haversine_distance(lat, lng, p.latitude, p.longitude) or 0.0
            )
        except Exception:  # defensive: never let one odd point kill the upload
            continue
        if best_d is None or d < best_d:
            best_d = d
            best_pos = cumulative[i] if i < len(cumulative) else 0.0
    return best_pos


def _spread_waypoints(
    located: list[tuple[float, dict]], max_count: int
) -> list[tuple[float, dict]]:
    """Keep ``max_count`` pins spread as far apart along the route as possible.

    WHY not simply the first N in file order: Garmin and Komoot exports often
    carry dozens of turn-by-turn cue points, and those cluster tightly around
    junctions. Twelve pins from the same roundabout tell the rider nothing,
    whereas twelve pins spaced across the ride describe its shape. So this is
    farthest-point sampling on the 1-D route position: keep the start and the
    finish (the two most meaningful pins on any ride), then repeatedly add
    whichever remaining pin is furthest from everything already kept.
    """
    if len(located) <= max_count:
        return located
    chosen = {0, len(located) - 1}
    while len(chosen) < max_count:
        best_i: int | None = None
        best_gap = -1.0
        for i, (pos, _) in enumerate(located):
            if i in chosen:
                continue
            gap = min(abs(pos - located[c][0]) for c in chosen)
            if gap > best_gap:
                best_gap = gap
                best_i = i
        if best_i is None:  # unreachable while len(located) > max_count
            break
        chosen.add(best_i)
    return [located[i] for i in sorted(chosen)]


def _parse_waypoints(gpx, geo_points: list, cumulative: list[float]) -> list[dict]:
    """Named map pins from the GPX's <wpt> elements, ordered along the route.

    WHY a waypoint with no usable name is dropped: the entire value of these
    pins is the label on the map ("Kloster Andechs"). An unnamed pin is a dot
    the rider cannot interpret and, worse, it visually competes with the ones
    that do mean something. gpxpy exposes ``.name``, ``.description`` and
    ``.type`` (verified against gpxpy 1.6.2), so we fall back through those
    before giving up on a pin.

    ``sym``/``desc`` are passed through untouched apart from trimming and a
    length cap — the frontend maps the raw ``sym`` string to an icon, so
    normalising it here would break that lookup.
    """
    located: list[tuple[float, dict]] = []
    # Bound the work a pathological export can cause: the spread selection is
    # O(kept × candidates), and no real ride needs more than this many pins
    # considered to pick 12 good ones.
    for wp in list(gpx.waypoints)[: _WP_LOCATE_SAMPLES]:
        if wp.latitude is None or wp.longitude is None:
            continue
        name = _clean_text(getattr(wp, "name", None), _WP_NAME_MAX)
        desc = _clean_text(getattr(wp, "description", None), _WP_DESC_MAX)
        wp_type = _clean_text(getattr(wp, "type", None), _WP_SYM_MAX)
        if name is None:
            # Fall back to the description, then the type, before dropping.
            name = _clean_text(desc, _WP_NAME_MAX) or wp_type
        if name is None:
            continue
        sym = _clean_text(getattr(wp, "symbol", None), _WP_SYM_MAX)
        if sym is None and wp_type is not None and wp_type != name:
            # No <sym>, but <type> carries the same "what kind of place is this"
            # signal the icon mapping wants. Skip it when it was consumed as the
            # label, so we don't echo the name back as an icon key.
            sym = wp_type
        lat = round(float(wp.latitude), _COORD_DP)
        lng = round(float(wp.longitude), _COORD_DP)
        located.append(
            (
                _route_position_m(lat, lng, geo_points, cumulative),
                {"name": name, "lat": lat, "lng": lng, "sym": sym, "desc": desc},
            )
        )
    located.sort(key=lambda item: item[0])
    return [wp for _, wp in _spread_waypoints(located, MAX_WAYPOINTS)]


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

    # Drop unusable points ONCE and keep the surviving objects, so the polyline
    # and the elevation profile are built from exactly the same point sequence
    # (otherwise the profile's cumulative distances would not match the track).
    geo_points = [
        p for p in raw_points if p.latitude is not None and p.longitude is not None
    ]
    coords = [
        [round(p.latitude, _COORD_DP), round(p.longitude, _COORD_DP)]
        for p in geo_points
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
    descent_m = 0.0
    try:
        ud = gpx.get_uphill_downhill()
        elevation_m = float(ud.uphill or 0.0) if ud else 0.0
        # gpxpy already reports downhill as a positive magnitude; keep it that
        # way so the UI never has to guess the sign convention.
        descent_m = abs(float(ud.downhill or 0.0)) if ud else 0.0
    except Exception:
        elevation_m = 0.0
        descent_m = 0.0

    # Elevation profile. Built at FULL resolution first: the sustained-gradient
    # window needs the real sample spacing, and downsampling to 120 points would
    # smear a short steep ramp into the flat kilometres around it.
    cumulative = _cumulative_distances(geo_points)
    full_profile = [
        [round(cumulative[i], 1), round(float(p.elevation), 1)]
        for i, p in enumerate(geo_points)
        if p.elevation is not None
    ]
    # A single elevation sample cannot describe a profile or a gradient, and a
    # file with no <ele> at all must stay honestly empty rather than flat-zero.
    if len(full_profile) < 2:
        profile: list[list[float]] = []
        max_grade_pct: float | None = None
    else:
        max_grade_pct = _max_sustained_grade_pct(full_profile)
        profile = _downsample(full_profile, MAX_PROFILE_POINTS)

    # Named pins are independent of the track: a file can have a track and no
    # <wpt>, waypoints and no track (they then double as the polyline source
    # above — both uses must keep working), or both.
    waypoints = _parse_waypoints(gpx, geo_points, cumulative)

    return ParsedTour(
        polyline=_downsample(coords, MAX_POLYLINE_POINTS),
        distance_m=round(distance_m, 1),
        elevation_m=round(elevation_m, 1),
        point_count=len(coords),
        profile=profile,
        descent_m=round(descent_m, 1),
        max_grade_pct=max_grade_pct,
        waypoints=waypoints,
    )
