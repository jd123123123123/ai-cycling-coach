"""Assemble a rehearsal: route + rider + weather -> result.

The one module in this package that the API layer hands athlete-derived data
to, and the only one that knows what the stored payload looks like. Everything
it calls is pure, so the whole pipeline is testable without a database --
weather is PASSED IN, never fetched here.

Two things it refuses to paper over:

  * a rider without CP or body weight gets the terrain and an explicit list of
    what is missing, never a fabricated time (spec section 6);
  * a route or rider that would make `physics.speed_for_power` raise (a NaN
    gradient from a corrupt profile, a non-positive mass) is rejected up front
    with a human-readable message, so the API can answer 422 rather than 500.
"""
from __future__ import annotations

import math
from dataclasses import asdict
from datetime import date

from app.services.rehearsal.rider_model import RiderModel
from app.services.rehearsal.route_profile import (
    Segment,
    assign_climbs,
    build_segments,
    find_climbs,
)
from app.services.rehearsal.route_source import RehearsalRoute, RoutePoint
from app.services.rehearsal.simulator import Assumptions, simulate
from app.services.rehearsal.uncertainty import simulate_band
from app.services.rehearsal.weather import build_weather_on_route, weather_applies

#: Carbohydrate demand rises with intensity; this is the mid-range consensus
#: figure for long endurance efforts and matches fueling_analysis's framing.
_CARB_G_PER_HOUR_PER_KJ_H = 0.09


class RehearsalInputError(ValueError):
    """The rider model or route cannot be simulated. Message is user-facing."""


def _check_finite(label: str, value: float | None) -> None:
    if value is not None and not math.isfinite(float(value)):
        raise RehearsalInputError(f"{label} is not a usable number")


def _guard_inputs(model: RiderModel, segments: list[Segment]) -> None:
    """Reject anything `speed_for_power` would raise on.

    That function raises ValueError on non-finite input or non-positive mass --
    correct, but a 500 to the athlete. A malformed profile (a NaN weight from a
    bad import) or a corrupt elevation series should read as "we cannot
    simulate this, here is why", so the check happens here where the message
    can be written for a human.
    """
    _check_finite("body weight", model.mass_kg)
    _check_finite("critical power", model.cp_watts)
    _check_finite("aerodynamic drag", model.cda_m2)
    _check_finite("rolling resistance", model.crr)
    if model.mass_kg is not None and model.mass_kg <= 0:
        raise RehearsalInputError("body weight must be greater than zero")
    for seg in segments:
        if not math.isfinite(seg.gradient_pct) or not math.isfinite(seg.elevation_m):
            raise RehearsalInputError(
                "route elevation data is corrupt -- a rehearsal needs the terrain"
            )


def run_rehearsal(
    route: RehearsalRoute,
    model: RiderModel,
    assumptions: Assumptions,
    *,
    today: date,
    forecast: dict | None = None,
) -> dict:
    """Full pipeline -> the payload the API returns. Weather is passed in, not fetched."""
    segments = build_segments(route)
    # find_climbs, NOT detect_climbs(build_segments(route)): detection runs on
    # its own fine grid, because a 150 m pacing segment straddling a dip can
    # still average above the climbing threshold and wrongly merge two climbs.
    climbs = find_climbs(route)
    segments = assign_climbs(segments, climbs)

    _guard_inputs(model, segments)

    headwind = None
    air_density = None
    weather_used = False
    if assumptions.use_weather and forecast and weather_applies(route, today):
        w = build_weather_on_route(
            segments,
            wind_speed_ms=forecast["wind_speed_ms"],
            wind_from_deg=forecast["wind_from_deg"],
            temperature_c=forecast["temperature_c"],
        )
        headwind, air_density = w.headwind_ms, w.air_density
        weather_used = True

    if not model.can_predict_time:
        # Honest partial result: the terrain, and what is missing (spec §6).
        return {
            "can_predict": False,
            "missing": [
                k
                for k, v in (("cp", model.cp_watts), ("weight", model.mass_kg))
                if not v
            ],
            "climbs": [asdict(c) for c in climbs],
            "segments": [],
            "total_time_s": None,
            "band": None,
            "total_kj": None,
            "carbs_g_per_hour": None,
            "blow_ups": [],
            "cda_is_default": model.cda_is_default,
            "weather_used": False,
        }

    try:
        sim = simulate(segments, model, assumptions, headwind, air_density)
        band = simulate_band(segments, model, assumptions, headwind, air_density)
    except ValueError as exc:  # physics rejected an input the guard let through
        raise RehearsalInputError(f"this route cannot be simulated: {exc}") from exc
    hours = max(1e-6, sim.total_time_s / 3600.0)

    return {
        "can_predict": True,
        "missing": [],
        "climbs": [asdict(c) for c in climbs],
        "segments": [asdict(s) for s in sim.segments],
        "total_time_s": sim.total_time_s,
        "band": asdict(band),
        "total_kj": sim.total_kj,
        "carbs_g_per_hour": (sim.total_kj / hours) * _CARB_G_PER_HOUR_PER_KJ_H,
        "blow_ups": [asdict(b) for b in sim.blow_ups],
        "cda_is_default": model.cda_is_default,
        "weather_used": weather_used,
    }


# ---------------------------------------------------------------------------
# Route <-> JSON, so a stored rehearsal can be re-run without the original GPX.
# ---------------------------------------------------------------------------

def route_to_json(route: RehearsalRoute) -> dict:
    """The parsed route as JSONB. The uploaded file itself is never kept."""
    return {
        "points": [
            [p.distance_m, p.elevation_m, p.lat, p.lng] for p in route.points
        ],
        "total_distance_m": route.total_distance_m,
        "total_ascent_m": route.total_ascent_m,
        "name": route.name,
        "ride_date": route.ride_date.isoformat() if route.ride_date else None,
    }


def route_from_json(raw: dict) -> RehearsalRoute:
    """Inverse of route_to_json, for re-running a stored rehearsal."""
    return RehearsalRoute(
        points=[
            RoutePoint(distance_m=p[0], elevation_m=p[1], lat=p[2], lng=p[3])
            for p in raw["points"]
        ],
        total_distance_m=raw["total_distance_m"],
        total_ascent_m=raw["total_ascent_m"],
        name=raw.get("name"),
        ride_date=date.fromisoformat(raw["ride_date"]) if raw.get("ride_date") else None,
    )
