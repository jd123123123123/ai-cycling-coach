"""Snapping a ride's GPS trace onto the roads it was actually ridden on.

WHY THIS EXISTS, and why simplifying harder was the wrong answer. A recorded
track does not lie on the road: consumer GPS wanders five to fifteen metres,
more under trees and between rock walls, and it staircases where the sample rate
loses a corner. Every reduction algorithm — even stride, Douglas-Peucker, any of
them — is faithful to THAT, so making the reduction better only preserves the
wander more accurately. It is possible to be perfectly faithful to a wrong line.

Strava, Komoot and Garmin do not draw the trace. They MAP-MATCH it: a hidden
Markov model walks the noisy points along the road graph and returns the road's
own geometry. That is why their routes sit exactly on the road at any zoom, take
hairpins the recording missed, and never staircase. Measured on one pass of the
Maratona: 200 recorded points in, 1 190 points of road geometry out, in 215 ms,
with the raw trace sitting a mean 0.9 m off the matched road.

── THE PROVIDER ─────────────────────────────────────────────────────────────
Valhalla's Meili (`trace_route`), via the FOSSGIS public instance. No key, no
sign-up, OpenStreetMap data, and `costing: bicycle` so a ride is snapped to ways
a bicycle may legally use rather than to the parallel motorway. It is a
FAIR-USE service: this calls it ONCE per ride and caches the result forever, so
a rider re-opening a ride costs nothing. At real scale the answer is a
self-hosted Valhalla or a paid tier, not a heavier public load — the URL is
configurable for exactly that reason.

── WHEN IT MUST REFUSE ──────────────────────────────────────────────────────
A ride on a trail that is not in OpenStreetMap, or a GPS lost in a canyon, will
be snapped onto whatever road happens to be near — and a confidently wrong road
is far worse than an honest wobble, because the rider cannot tell it is wrong.

`confidence_score` is useless for this: it came back 1.0 both for a real road
and for a straight line drawn across open mountainside. What separates them is
how many points the matcher could not place at all — 0 of 200 on the real road,
97 of 120 on the nonsense. So that is the gate, and it is deliberately strict:
below it, the raw trace stands.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from app.config import settings

log = logging.getLogger(__name__)

#: The public FOSSGIS Valhalla. Overridable so a self-hosted instance can take
#: over without a code change.
DEFAULT_URL = "https://valhalla1.openstreetmap.de"

#: Matchers want roughly one point every 20-50 m. Denser wastes the request on
#: GPS jitter the model then has to reject; sparser starts losing which side of
#: a junction the rider took.
TARGET_SPACING_M = 30.0

#: HOW LONG ONE REQUEST MAY BE, and this is the constraint that shapes the
#: whole service. Measured against the public instance: `trace_route` returns at
#: most about 20.7 km of matched road however much is sent, and it TRUNCATES
#: SILENTLY — 2 178 points covering 135.7 km came back as a clean, plausible,
#: complete-looking 20.7 km. Nothing in the response says it gave up.
#:
#: 12 km leaves real headroom under that ceiling. A ride is cut into chunks of
#: this length, matched separately and stitched.
CHUNK_M = 12_000.0

#: Chunks overlap so the matcher has context on both sides of every join —
#: without it each chunk starts cold at a junction and can pick the wrong exit
#: for its first few hundred metres.
CHUNK_OVERLAP_M = 300.0

#: A single request's ceiling, far above one chunk's needs.
MAX_POINTS = 16_000

#: More than this share unplaced and the ride was not on mapped roads. 0.15 sits
#: far above a real road's 0.00 and far below open terrain's 0.81.
MAX_UNMATCHED_SHARE = 0.15

TIMEOUT_S = 45


def _decimate(poly: list[list[float]], spacing_m: float) -> list[list[float]]:
    """Thin to roughly one point per `spacing_m`, keeping both ends.

    Distance is walked along the track rather than measured from the last KEPT
    point, so a slow corner is not thinned differently from a fast straight.
    """
    if len(poly) < 3:
        return poly
    import math

    out = [poly[0]]
    acc = 0.0
    for a, b in zip(poly, poly[1:]):
        dlat = (b[0] - a[0]) * 111_320.0
        dlng = (b[1] - a[1]) * 111_320.0 * math.cos(math.radians(a[0]))
        acc += math.hypot(dlat, dlng)
        if acc >= spacing_m:
            out.append(b)
            # Carry the remainder. Resetting to zero drifts the real spacing
            # upward — on the Maratona it turned a 30 m target into 62 m, which
            # then made every chunk twice as long as intended.
            acc -= spacing_m
    if out[-1] != poly[-1]:
        out.append(poly[-1])
    return out


def _length_m(poly: list[list[float]]) -> float:
    """Ground distance along a polyline, in metres."""
    import math

    total = 0.0
    for a, b in zip(poly, poly[1:]):
        dlat = (b[0] - a[0]) * 111_320.0
        dlng = (b[1] - a[1]) * 111_320.0 * math.cos(math.radians(a[0]))
        total += math.hypot(dlat, dlng)
    return total


def _decode(encoded: str, precision: float = 1e6) -> list[list[float]]:
    """Valhalla's polyline6. Same scheme as Google's, one more decimal place."""
    out: list[list[float]] = []
    lat = lng = i = 0
    while i < len(encoded):
        for axis in (0, 1):
            shift = result = 0
            while True:
                b = ord(encoded[i]) - 63
                i += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else (result >> 1)
            if axis == 0:
                lat += delta
            else:
                lng += delta
        out.append([lat / precision, lng / precision])
    return out


def _post(path: str, body: dict) -> dict | None:
    base = (getattr(settings, "VALHALLA_URL", "") or DEFAULT_URL).rstrip("/")
    req = urllib.request.Request(
        f"{base}/{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            return json.load(r)
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as err:
        log.info("map matching unavailable: %s", err)
        return None


def unmatched_share(points: list[dict]) -> float:
    """How much of the trace the matcher could not place on any road at all."""
    if not points:
        return 1.0
    return sum(1 for p in points if p.get("type") == "unmatched") / len(points)


def _chunks(poly: list[list[float]]) -> list[list[list[float]]]:
    """Cut a track into overlapping pieces the matcher can actually finish."""
    out: list[list[list[float]]] = []
    cur: list[list[float]] = [poly[0]]
    run = 0.0
    for a, b in zip(poly, poly[1:]):
        run += _length_m([a, b])
        cur.append(b)
        if run >= CHUNK_M:
            out.append(cur)
            # Step back by the overlap so the next chunk starts with context.
            back, i = 0.0, len(cur) - 1
            while i > 0 and back < CHUNK_OVERLAP_M:
                back += _length_m([cur[i - 1], cur[i]])
                i -= 1
            cur = cur[i:]
            run = back
    if len(cur) > 1:
        out.append(cur)
    return out


def _stitch(pieces: list[list[list[float]]]) -> list[list[float]]:
    """Join matched chunks, dropping the duplicated overlap at each seam.

    The seam is cut where the next piece first comes within a few metres of the
    previous one's end, rather than at a fixed index: the matcher returns road
    geometry, so the two pieces do not share point counts with each other or
    with the input.
    """
    out: list[list[float]] = []
    for piece in pieces:
        if not out:
            out.extend(piece)
            continue
        tail = out[-1]
        start = 0
        for i, pt in enumerate(piece):
            if _length_m([tail, pt]) < 25.0:
                start = i + 1
                break
        out.extend(piece[start:])
    return out


def match(polyline: list[list[float]]) -> list[list[float]] | None:
    """The road geometry this ride was ridden on, or None to keep the trace.

    NEVER RAISES. This runs behind a page a rider is waiting on, and every way
    it can fail — the service down, a rate limit, a ride through a forest — has
    the same correct answer: show the recorded track, which is honest and was
    already good enough to ship.

    SLOW BY DESIGN. A 138 km ride is eleven requests and takes several seconds,
    which is why the caller must treat this as a one-off whose result is stored,
    never as something a page waits on.
    """
    if not polyline or len(polyline) < 4:
        return None

    thinned = _decimate(polyline, TARGET_SPACING_M)
    if len(thinned) < 4:
        return None

    matched: list[list[list[float]]] = []
    for chunk in _chunks(thinned):
        if len(chunk) < 4:
            continue
        shape = [{"lat": round(a, 6), "lon": round(b, 6)} for a, b in chunk]
        body = {
            "shape": shape,
            "costing": "bicycle",
            # `map_snap` is the noisy-input mode. `edge_walk` assumes the points
            # already lie on the graph, which is true of a planned route and
            # never true of a recording.
            "shape_match": "map_snap",
        }

        # Quality first: the attributes call reports which points were placed,
        # and there is no point paying for geometry we would throw away.
        attrs = _post("trace_attributes", {
            **body,
            "filters": {"attributes": ["matched.type"], "action": "include"},
        })
        if attrs is None:
            return None
        share = unmatched_share(attrs.get("matched_points", []))
        if share > MAX_UNMATCHED_SHARE:
            log.info("map matching rejected: %.0f%% of a chunk is not on mapped roads", share * 100)
            return None

        route = _post("trace_route", body)
        if route is None:
            return None
        piece: list[list[float]] = []
        for leg in ((route.get("trip") or {}).get("legs") or []):
            enc = leg.get("shape")
            if enc:
                piece.extend(_decode(enc))
        if not piece:
            return None
        # PER CHUNK, because this is where the silent truncation shows. A chunk
        # that comes back much shorter than it was sent did not get matched, it
        # got abandoned, and stitching it would delete that stretch of the ride.
        if not 0.75 <= _length_m(piece) / max(1.0, _length_m(chunk)) <= 1.25:
            log.info("map matching rejected: a chunk came back the wrong length")
            return None
        matched.append(piece)

    if not matched:
        return None
    out = _stitch(matched)

    # ── THE LAST GUARD IS ON LENGTH, NOT ON POINT COUNT ──────────────────
    # The first version compared point counts and threw away every good match:
    # 2 178 points of spaced recording came back as 1 235 points of road, and
    # fewer points is the matcher doing its JOB. A straight kilometre of road is
    # two points; a recording spends thirty-three on it.
    #
    # What actually goes wrong is a matcher that takes a shortcut the rider did
    # not, or wanders down a side road and back, and both show up in the
    # distance. A quarter either way is loose enough for a road to legitimately
    # differ from a wobbling trace and tight enough that a missed loop cannot
    # hide in it.
    ratio = _length_m(out) / max(1.0, _length_m(thinned))
    if not 0.75 <= ratio <= 1.25:
        log.info("map matching rejected: matched road is %.2fx the recorded distance", ratio)
        return None
    return out
