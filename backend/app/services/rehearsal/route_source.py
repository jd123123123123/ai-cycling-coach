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
