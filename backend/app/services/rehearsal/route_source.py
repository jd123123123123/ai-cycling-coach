"""Route sources → one RehearsalRoute.

Four adapters feed the simulator: an uploaded GPX, a crew event's stored tour,
a past activity's own track, and the athlete's target-event route. Everything
downstream sees ONLY RehearsalRoute, so a fifth source later costs one adapter
and no simulator change.

Refusals live here, not in the simulator: a route with no elevation, or one too
short to say anything about, is rejected at the door. Inventing flat terrain
would produce a confident, wrong time -- the exact trust wound the strategy doc
warns about.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from itertools import zip_longest

from app.services.climb_companion import haversine_m
from app.services.crew_tour import TrackPoint, parse_gpx_track

# Below this, gradient noise dominates and there is nothing to simulate.
MIN_ROUTE_DISTANCE_M = 200.0


class RouteUnusable(ValueError):
    """The route cannot be simulated honestly. Message is user-facing."""


@dataclass(frozen=True)
class RoutePoint:
    distance_m: float
    elevation_m: float
    lat: float
    lng: float


@dataclass(frozen=True)
class RehearsalRoute:
    points: list[RoutePoint]
    total_distance_m: float
    total_ascent_m: float
    name: str | None
    #: Only a dated route can carry weather (§6 of the spec).
    ride_date: date | None


def route_from_track(
    points: list[TrackPoint],
    *,
    name: str | None = None,
    ride_date: date | None = None,
) -> RehearsalRoute:
    """Adapt full-resolution track points into a RehearsalRoute."""
    if len(points) < 2:
        raise RouteUnusable("route is too short to simulate")
    if any(p.elevation_m is None for p in points):
        raise RouteUnusable(
            "route has no elevation data -- a rehearsal needs the terrain"
        )

    out: list[RoutePoint] = []
    cumulative = 0.0
    ascent = 0.0
    prev: TrackPoint | None = None
    for p in points:
        if prev is not None:
            cumulative += haversine_m(prev.lat, prev.lng, p.lat, p.lng)
            gain = float(p.elevation_m) - float(prev.elevation_m)
            if gain > 0:
                ascent += gain
        out.append(
            RoutePoint(
                distance_m=cumulative,
                elevation_m=float(p.elevation_m),
                lat=p.lat,
                lng=p.lng,
            )
        )
        prev = p

    if cumulative < MIN_ROUTE_DISTANCE_M:
        raise RouteUnusable("route is too short to simulate")

    return RehearsalRoute(
        points=out,
        total_distance_m=cumulative,
        total_ascent_m=ascent,
        name=name,
        ride_date=ride_date,
    )


def route_from_gpx(
    raw: str | bytes,
    *,
    name: str | None = None,
    ride_date: date | None = None,
) -> RehearsalRoute:
    """Uploaded GPX -> RehearsalRoute. Reuses crew_tour's parser, never a second one."""
    return route_from_track(parse_gpx_track(raw), name=name, ride_date=ride_date)


def route_from_activity(
    latitudes: list[float | None],
    longitudes: list[float | None],
    altitudes: list[float | None],
    *,
    name: str | None = None,
) -> RehearsalRoute:
    """A ridden activity's own track -> a route to rehearse again.

    Rehearsing a route you have already ridden is the accuracy check: the
    prediction lands next to what actually happened, which earns trust when
    they agree and exposes the model when they do not. That only works if the
    route comes off the stream at FULL resolution, so nothing is downsampled
    here either.

    Samples are dropped whole. Zipping by index (rather than compacting each
    channel separately) matters: a dropout at second 500 in the latitude
    channel must never be paired with second 501's longitude, which would
    stitch a phantom leg across the map and invent both distance and ascent.
    """
    fixes = [
        (la, ln, al)
        for la, ln, al in zip_longest(latitudes, longitudes, altitudes)
        if la is not None and ln is not None
    ]
    if not fixes:
        raise RouteUnusable(
            "this ride has no GPS track -- an indoor ride has no route to rehearse"
        )
    return route_from_track(
        [
            TrackPoint(
                lat=float(la),
                lng=float(ln),
                # Left None deliberately: route_from_track refuses the whole
                # route by name rather than filling in a flat guess.
                elevation_m=float(al) if al is not None else None,
            )
            for la, ln, al in fixes
        ],
        name=name,
    )


def route_from_crew_event(
    gpx_path: str, *, name: str | None = None, ride_date: date | None = None
) -> RehearsalRoute:
    """A crew event's uploaded tour, re-read at FULL resolution.

    The event row stores a <=120-point profile for its card; simulating needs
    every point, so this re-reads the original file from disk rather than
    upsampling a chart. Interpolating a 120-point profile back up would smooth
    away exactly the ramps a rehearsal exists to warn about.
    """
    try:
        with open(gpx_path, "rb") as fh:
            raw = fh.read()
    except OSError as exc:
        # The row says there is a tour; the volume disagrees. Say so, rather
        # than reporting a corrupt-file error the host cannot act on.
        raise RouteUnusable(
            "the original GPX for this ride is no longer on file"
        ) from exc
    return route_from_gpx(raw, name=name, ride_date=ride_date)
