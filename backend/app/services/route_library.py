"""Route Library — group the athlete's own GPS rides into distinct routes.

Everything is computed from the athlete's stored activities + streams. No
external route database and no map tiles: a "route" is a cluster of the
athlete's own rides that share a similar start point (GPS), a similar total
distance (±10 %) and a similar duration shape. Rides without GPS are never
guessed into a route — the UI shows an honest empty state instead.

Pure parts (clustering, polyline simplification, summarising) are plain
functions so they can be unit-tested without a database; the DB glue lives in
``load_route_library``.
"""
from __future__ import annotations

import math
from collections import Counter
from statistics import median

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream

# ── thresholds ───────────────────────────────────────────────────────────────
START_RADIUS_M = 500.0        # same route = starts within this radius …
DISTANCE_TOLERANCE = 0.10     # … and total distances within ±10 % …
DURATION_TOLERANCE = 0.35     # … and durations within ±35 % (shape guard)
MIN_ROUTE_DISTANCE_M = 2000.0  # ignore sub-2 km GPS blips
MAX_POLYLINE_POINTS = 120     # downsampled sketch resolution
MAX_ROUTES = 30
MAX_RIDES_SCANNED = 300

# Virtual platforms carry fantasy GPS (e.g. Watopia) — flag them so the UI
# never shows real-world weather for an indoor route.
_VIRTUAL_MARKERS = (
    "zwift", "rouvy", "kinomap", "indoor", "mywhoosh", "trainerroad",
    "virtual", "watopia",
)


# ── small helpers (pure) ─────────────────────────────────────────────────────

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def is_virtual_title(title: str | None) -> bool:
    return bool(title) and any(m in title.lower() for m in _VIRTUAL_MARKERS)


def _valid_track(
    lats: list[float | None] | None, lngs: list[float | None] | None
) -> list[tuple[float, float]]:
    """All (lat, lng) samples where both channels carry a real reading."""
    if not lats or not lngs:
        return []
    n = min(len(lats), len(lngs))
    return [
        (float(lats[i]), float(lngs[i]))
        for i in range(n)
        if lats[i] is not None and lngs[i] is not None
    ]


def simplify_polyline(
    track: list[tuple[float, float]], max_points: int = MAX_POLYLINE_POINTS
) -> list[list[float]]:
    """Uniform-index downsample of a GPS track to ≤ max_points, endpoints kept.

    Returns [[lat, lng], …] rounded to 5 decimals (≈1 m) — enough for a mini
    SVG sketch, small enough to ship for every route card.
    """
    if not track:
        return []
    if len(track) <= max_points:
        pts = track
    else:
        step = (len(track) - 1) / (max_points - 1)
        pts = [track[round(i * step)] for i in range(max_points)]
        pts[-1] = track[-1]
    return [[round(lat, 5), round(lng, 5)] for lat, lng in pts]


def elevation_gain_m(altitude: list[float | None] | None) -> float | None:
    """Total ascent from a (possibly gappy) altitude stream, lightly smoothed.

    Forward-fills gaps, applies a ~15-sample rolling mean to kill barometric
    jitter, then sums positive deltas. None when no altitude was recorded.
    """
    if not altitude:
        return None
    filled: list[float] = []
    last: float | None = None
    for v in altitude:
        if v is not None:
            last = float(v)
        if last is not None:
            filled.append(last)
    if len(filled) < 20:
        return None
    half = 7
    n = len(filled)
    smooth = [
        sum(filled[max(0, i - half):min(n, i + half + 1)])
        / (min(n, i + half + 1) - max(0, i - half))
        for i in range(n)
    ]
    gain = sum(
        smooth[i + 1] - smooth[i] for i in range(n - 1) if smooth[i + 1] > smooth[i]
    )
    return round(gain, 1)


# ── ride → cluster input (pure) ──────────────────────────────────────────────

def build_ride(
    streams: dict,
    *,
    activity_id: int | None = None,
    title: str | None = None,
    date: str | None = None,
    distance_m: float | None = None,
    duration_s: int | None = None,
    tss: float | None = None,
) -> dict | None:
    """One ride as a cluster candidate, or None when it has no usable GPS.

    Distance/duration prefer the activity summary values and fall back to the
    stream itself (distance channel / 1 Hz sample count).
    """
    track = _valid_track(streams.get("latitude"), streams.get("longitude"))
    if len(track) < 10:
        return None  # no usable GPS — never guess a route

    if distance_m is None:
        dist_ch = [v for v in (streams.get("distance") or []) if v is not None]
        distance_m = float(dist_ch[-1]) if dist_ch else None
    if distance_m is None or distance_m < MIN_ROUTE_DISTANCE_M:
        return None
    if duration_s is None:
        duration_s = len(streams.get("altitude") or []) or len(track)

    return {
        "activity_id": activity_id,
        "title": title,
        "date": date,
        "distance_m": float(distance_m),
        "duration_s": int(duration_s) if duration_s else None,
        "start_lat": track[0][0],
        "start_lng": track[0][1],
        "elevation_m": elevation_gain_m(streams.get("altitude")),
        "polyline": simplify_polyline(track),
        "is_virtual": is_virtual_title(title),
        "tss": float(tss) if tss is not None else None,
    }


# ── clustering (pure) ────────────────────────────────────────────────────────

def same_route(a: dict, b: dict) -> bool:
    """Same route = similar start point + similar distance + similar duration."""
    if haversine_m(a["start_lat"], a["start_lng"], b["start_lat"], b["start_lng"]) > START_RADIUS_M:
        return False
    da, db_ = a["distance_m"], b["distance_m"]
    if abs(da - db_) > DISTANCE_TOLERANCE * max(da, db_):
        return False
    ta, tb = a["duration_s"], b["duration_s"]
    if ta and tb and abs(ta - tb) > DURATION_TOLERANCE * max(ta, tb):
        return False
    return True


def cluster_rides(rides: list[dict]) -> list[list[dict]]:
    """Greedy grouping: each ride joins the first group whose anchor matches."""
    groups: list[list[dict]] = []
    for ride in rides:
        for g in groups:
            if same_route(g[0], ride):
                g.append(ride)
                break
        else:
            groups.append([ride])
    return groups


# ── summarising (pure) ───────────────────────────────────────────────────────

def _representative_name(group: list[dict]) -> str | None:
    """Most common non-empty title; ties resolve to the most recent ride."""
    titles = [r["title"].strip() for r in group if r["title"] and r["title"].strip()]
    if not titles:
        return None
    counts = Counter(titles)
    best_count = max(counts.values())
    contenders = {t for t, c in counts.items() if c == best_count}
    for r in group:  # group is ordered most-recent-first
        if r["title"] and r["title"].strip() in contenders:
            return r["title"].strip()
    return titles[0]


def summarize_route(group: list[dict]) -> dict:
    """One route card: representative name, ride counts, times, sketch."""
    durations = [r["duration_s"] for r in group if r["duration_s"]]
    gains = [r["elevation_m"] for r in group if r["elevation_m"] is not None]
    tss_values = [r["tss"] for r in group if r.get("tss") is not None]
    dates = [r["date"] for r in group if r["date"]]
    virtual_votes = sum(1 for r in group if r["is_virtual"])
    newest = group[0]  # most-recent-first ordering preserved from the query
    return {
        "name": _representative_name(group),
        "times_ridden": len(group),
        "distance_km": round(median(r["distance_m"] for r in group) / 1000.0, 1),
        "elevation_m": round(median(gains)) if gains else None,
        "best_time_s": min(durations) if durations else None,
        "avg_time_s": round(sum(durations) / len(durations)) if durations else None,
        # Median rather than mean: one all-out race effort on an otherwise
        # easy loop must not drag the "typical" TSS toward it.
        "avg_tss": round(median(tss_values), 1) if tss_values else None,
        "last_ridden": max(dates) if dates else None,
        "start_lat": newest["start_lat"],
        "start_lng": newest["start_lng"],
        "is_virtual": virtual_votes * 2 >= len(group),
        "polyline": newest["polyline"],
    }


def summarize_routes(rides: list[dict]) -> list[dict]:
    """Cluster → summarize → sort by times ridden (then recency), capped."""
    summaries = [summarize_route(g) for g in cluster_rides(rides)]
    summaries.sort(
        key=lambda s: (s["times_ridden"], s["last_ridden"] or "", s["distance_km"]),
        reverse=True,
    )
    return summaries[:MAX_ROUTES]


# ── DB glue ──────────────────────────────────────────────────────────────────

async def load_route_library(db: AsyncSession, user_id: int) -> dict:
    """The athlete's route library, grouped from their own GPS rides.

    ``{"available": False, "routes": []}`` when no rides carry a usable GPS
    track, so the UI renders an honest empty state.
    """
    res = await db.execute(
        select(
            ActivityStream.activity_id,
            ActivityStream.streams,
            Activity.title,
            Activity.started_at,
            Activity.distance_meters,
            Activity.duration_seconds,
            Activity.tss,
        )
        .join(Activity, Activity.id == ActivityStream.activity_id)
        .where(
            ActivityStream.user_id == user_id,
            Activity.user_id == user_id,
            Activity.sport == "cycling",
        )
        .order_by(Activity.started_at.desc())
        .limit(MAX_RIDES_SCANNED)
    )
    rows = res.all()

    rides: list[dict] = []
    for r in rows:
        ride = build_ride(
            r.streams or {},
            activity_id=r.activity_id,
            title=r.title,
            date=r.started_at.date().isoformat() if r.started_at else None,
            distance_m=r.distance_meters,
            duration_s=r.duration_seconds,
            tss=r.tss,
        )
        if ride is not None:
            rides.append(ride)

    routes = summarize_routes(rides)
    return {
        "available": len(routes) > 0,
        "n_gps_rides": len(rides),
        "routes": routes,
    }
