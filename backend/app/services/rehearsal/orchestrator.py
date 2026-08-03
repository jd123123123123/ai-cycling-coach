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
from dataclasses import asdict, replace
from datetime import date

from app.services.rehearsal.rider_model import RiderModel
from app.services.rehearsal.route_profile import (
    Segment,
    assign_climbs,
    build_segments,
    find_climbs,
)
from app.services.rehearsal.route_source import RehearsalRoute, RoutePoint
from app.services.rehearsal.forecast import (
    battery_forecast,
    engine_vs_route,
    expand_to_1hz,
    intensity_factor,
    normalized_power,
    predict_heart_rate,
    training_effect,
    training_stress,
    variability_index,
    zone_distribution,
)
from app.services.rehearsal.matchbook_bridge import forecast_matchbook
from app.services.rehearsal.simulator import Assumptions, SegmentResult, simulate
from app.services.rehearsal.target_time import TargetSolution, solve_for_target_time
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


def _segment_payload(seg: Segment, sim: SegmentResult | None) -> dict:
    """One segment on the wire: the terrain always, the pacing only if predicted.

    The terrain half (`start_m`, `gradient_pct`, `elevation_m`, `climb_id`) is
    measured off the route and is just as real for a rider with no CP as for
    one with a fitted power-duration curve -- which is exactly what the surface
    promises ("the route profile is below regardless", spec §6). The paced half
    is None rather than 0.0 when there is no prediction, so a client cannot
    render a fabricated zero watt / zero kJ figure.
    """
    return {
        "start_m": seg.start_m,
        "gradient_pct": seg.gradient_pct,
        # The MEASURED altitude, not one integrated back out of the gradients:
        # the silhouette is the one thing this branch still claims, so it comes
        # from the route itself.
        "elevation_m": seg.elevation_m,
        # Terrain too, and for the same reason: where the road runs is measured,
        # not predicted, so the map draws for a rider with no CP as well.
        "lat": seg.lat,
        "lng": seg.lng,
        "climb_id": seg.climb_id,
        "power_w": sim.power_w if sim is not None else None,
        "speed_ms": sim.speed_ms if sim is not None else None,
        "elapsed_s": sim.elapsed_s if sim is not None else None,
        "w_bal_j": sim.w_bal_j if sim is not None else None,
    }


def _forecast_payload(
    *,
    sim,
    model: RiderModel,
    ftp_watts: float | None,
    athlete_mmp: dict | None,
    hr_anchors: dict | None,
    start_readiness_pct: float | None,
) -> dict:
    """Everything the surface asks about the ride, from one 1 Hz expansion.

    FTP falls back to CP when the profile carries no FTP. They are not the same
    quantity, but the zone boundaries and TSS are defined against FTP and a CP
    is a far better stand-in than nothing -- flagged on the wire so the surface
    can say which anchor it used.
    """
    series = expand_to_1hz(sim.segments)
    if not series:
        return {}

    ftp = ftp_watts if (ftp_watts and ftp_watts > 0) else model.cp_watts
    duration_s = float(len(series))
    avg_w = sum(series) / duration_s
    np_w = normalized_power(series)
    tss = training_stress(duration_s, np_w, ftp)

    mb = forecast_matchbook(series, model.cp_watts, model.w_prime_j)

    return {
        "avg_power_w": round(avg_w, 1),
        "normalized_power_w": round(np_w, 1) if np_w else None,
        "intensity_factor": round(intensity_factor(np_w, ftp) or 0, 3) or None,
        "tss": round(tss, 1) if tss else None,
        "variability_index": round(variability_index(np_w, avg_w) or 0, 3) or None,
        "ftp_used_w": round(ftp, 1) if ftp else None,
        "ftp_is_cp_fallback": bool(ftp and not (ftp_watts and ftp_watts > 0)),
        "zones": [
            {
                "zone": z.zone,
                "name_en": z.name_en,
                "name_de": z.name_de,
                "seconds": round(z.seconds),
                "fraction": round(z.fraction, 4),
            }
            for z in zone_distribution(series, ftp)
        ],
        "demand": [
            {
                "duration_s": d.duration_s,
                "required_w": round(d.required_w, 1),
                "athlete_best_w": round(d.athlete_best_w, 1) if d.athlete_best_w else None,
                "spare_w": round(d.spare_w, 1) if d.spare_w is not None else None,
                "ratio": round(d.ratio, 3) if d.ratio is not None else None,
            }
            for d in engine_vs_route(series, athlete_mmp)
        ],
        "matches": mb,
        "heart_rate": predict_heart_rate(
            series,
            ftp_w=ftp,
            lthr_bpm=(hr_anchors or {}).get("lthr_bpm"),
            resting_hr=(hr_anchors or {}).get("resting_hr"),
            max_hr=(hr_anchors or {}).get("max_hr"),
        ),
        "training_effect": training_effect(
            tss=tss,
            time_above_cp_s=float((mb or {}).get("time_above_cp_s") or 0.0),
            w_prime_j=model.w_prime_j,
            duration_s=duration_s,
        ),
        "battery": battery_forecast(
            start_readiness_pct=start_readiness_pct, tss=tss
        ),
    }


def run_rehearsal(
    route: RehearsalRoute,
    model: RiderModel,
    assumptions: Assumptions,
    *,
    today: date,
    forecast: dict | None = None,
    target_time_s: float | None = None,
    spread_scale: float = 1.0,
    band_samples: int = 0,
    ftp_watts: float | None = None,
    athlete_mmp: dict | None = None,
    hr_anchors: dict | None = None,
    start_readiness_pct: float | None = None,
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
            # The terrain, in full. The prediction is what is missing, not the
            # road -- so the profile and the climbs still render.
            "segments": [_segment_payload(s, None) for s in segments],
            "total_time_s": None,
            "band": None,
            "total_kj": None,
            "carbs_g_per_hour": None,
            "blow_ups": [],
            "cda_is_default": model.cda_is_default,
            "durability_is_default": model.durability_drop_pct <= 0,
            "w_prime_is_default": not model.w_prime_j,
            "weather_used": False,
        }

    target: TargetSolution | None = None
    try:
        if target_time_s:
            # Backward solve: the athlete named a finish time, so the pacing
            # comes out of the solver and the band is drawn around THAT ride,
            # not around the effort setting they are no longer riding to.
            target = solve_for_target_time(
                segments, model, assumptions, headwind, air_density, target_time_s
            )
            solved = replace(assumptions, intensity_scale=target.intensity_scale)
            sim = target.result
            band = simulate_band(
                segments, model, solved, headwind, air_density,
                spread_scale=spread_scale,
            )
        else:
            sim = simulate(segments, model, assumptions, headwind, air_density)
            band = simulate_band(
                segments, model, assumptions, headwind, air_density,
                spread_scale=spread_scale,
            )
    except ValueError as exc:  # physics rejected an input the guard let through
        raise RehearsalInputError(f"this route cannot be simulated: {exc}") from exc
    hours = max(1e-6, sim.total_time_s / 3600.0)

    return {
        "can_predict": True,
        "missing": [],
        "climbs": [asdict(c) for c in climbs],
        "segments": [
            _segment_payload(seg, sim_seg)
            for seg, sim_seg in zip(segments, sim.segments)
        ],
        "total_time_s": sim.total_time_s,
        "band": asdict(band),
        "total_kj": sim.total_kj,
        "carbs_g_per_hour": (sim.total_kj / hours) * _CARB_G_PER_HOUR_PER_KJ_H,
        "blow_ups": [asdict(b) for b in sim.blow_ups],
        "cda_is_default": model.cda_is_default,
        "durability_is_default": model.durability_drop_pct <= 0,
        # No W′ on file means the simulator's cap branch never fires: this
        # rider is never stopped from holding 1.24 × CP for six hours, so
        # there is no blow-up to report and the W′ series is flat zero. The
        # flag exists so the surface can SAY that rather than let a missing
        # ceiling read as a rider who simply never breaks.
        "w_prime_is_default": not model.w_prime_j,
        "weather_used": weather_used,
        # The backward solve, or a row of Nones when no time was asked for.
        # `reachable` and `costs_a_blow_up` are deliberately separate: a time
        # the clock allows but W' does not is a warning, not a plan.
        "target_time_s": target.target_time_s if target else None,
        "target_reachable": target.reachable if target else None,
        "target_costs_blow_up": target.costs_a_blow_up if target else None,
        "target_intensity_pct": round(target.intensity_scale * 100.0, 1) if target else None,
        # How the band's width was arrived at. Zero samples means it is the
        # reasoned default, and the surface says so rather than implying the
        # range was measured.
        "band_samples": band_samples,
        # ── The forecast layer ────────────────────────────────────────────
        # Everything below is derived from ONE expansion of the simulated ride
        # to 1 Hz, so the predicted NP, zones and demand curve are computed by
        # exactly the same instruments that measure a recorded ride.
        **_forecast_payload(
            sim=sim,
            model=model,
            ftp_watts=ftp_watts,
            athlete_mmp=athlete_mmp,
            hr_anchors=hr_anchors,
            start_readiness_pct=start_readiness_pct,
        ),
        "fastest_possible_s": target.fastest_possible_s if target else None,
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
