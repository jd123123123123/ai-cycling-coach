"""Route Rehearsal API -- ride the route before you ride it.

  POST  /rehearsals        upload a GPX, get terrain + a predicted band
  GET   /rehearsals        the athlete's stored rehearsals (headlines only)
  GET   /rehearsals/{id}   one rehearsal in full
  PATCH /rehearsals/{id}   change an assumption and re-run

Rehearsals are STORED rather than recomputed on read: "what did I think the
Maratona would take back in March" needs the March answer to still exist, and
re-simulating with today's CP would quietly answer a different question. A
PATCH is the one place a re-run happens, and it re-runs deliberately.

All four source kinds land here and all four collapse to the same
RehearsalRoute before anything is simulated, so the engine never learns where
a route came from:

  * gpx           the uploaded file
  * crew_event    the event's ORIGINAL tour, re-read off disk at full
                  resolution -- never the <=120-point profile cached on the
                  row for its card, which is a chart, not a route
  * activity      a ride already ridden, from its own stream. This is the
                  feature's accuracy check: the prediction lands next to what
                  actually happened
  * target_event  the athlete's stored official course

Honesty rules this router enforces (spec section 6):
  * an athlete with no CP or no body weight still gets 201 with the terrain,
    the climbs, `can_predict=false` and `missing` naming what is absent --
    never a 500, never a fabricated time;
  * a route we cannot simulate honestly (no elevation, too short, corrupt
    profile) is 422 with the exception's own message, which is written to be
    shown to a human.
"""
from __future__ import annotations

import logging
import math
from dataclasses import asdict, replace
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only
from starlette.concurrency import run_in_threadpool

# The crew-scoping helpers are imported rather than re-implemented: "an event
# is visible only to its own crew" is a security property, and a second copy of
# that query here would be free to drift away from the one the crew router
# enforces.
from app.api.crew_events import _get_crew_event, _require_membership, _tour_path
from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.athlete_profile import AthleteProfile
from app.models.route_rehearsal import RouteRehearsal
from app.models.user import User
from app.schemas.rehearsal import (
    AssumptionsIn,
    RehearsalCreate,
    RehearsalListItem,
    RehearsalListOut,
    RehearsalOut,
)
from app.services.rehearsal.orchestrator import (
    RehearsalInputError,
    route_from_json,
    route_to_json,
    run_rehearsal,
)
from app.services.rehearsal.rider_model import build_rider_model
from app.services.rehearsal.route_source import (
    RehearsalRoute,
    RouteUnusable,
    route_from_activity,
    route_from_crew_event,
    route_from_gpx,
)
from app.services.rehearsal.fitness_projection import project_cp_for_date
from app.services.rehearsal.knobs import (
    OverrideError,
    RiderOverrides,
    validate as validate_overrides,
)
from app.services.rehearsal.simulator import Assumptions
from app.services.athlete_power_profile import compute_athlete_power_profile
from app.services.hr_zones import derive_lthr, derive_max_hr
from app.services.rehearsal.band_calibration import calibrate_spread
from app.services.rehearsal.route_history import past_attempts, summarize as summarize_history
from app.services.rehearsal.verdict_vs_actual import compare_to_actual
from app.services.rehearsal.weather import weather_applies
from app.services.stream_ingestion import latest_critical_power
from app.services.weather_client import fetch_window_forecast

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rehearsals", tags=["rehearsals"])

#: A route is one ride, not one hour: a single representative wind and
#: temperature for the whole day is the honest resolution here, because the
#: start time is unknown. Averaged over daylight hours rather than picked from
#: one arbitrary hour.
_DAYLIGHT_FROM_H = 6
_DAYLIGHT_TO_H = 18

#: Nothing stores a measured CdA or a durability drop yet (there is no column
#: for either). Both are resolved here so the day one appears, this is the
#: single place that changes: None makes rider_model apply its LABELLED
#: fallback (and widen the band accordingly), and 0.0 means "no measured fade"
#: rather than a guessed one.
_STORED_CDA_M2: float | None = None
_STORED_DURABILITY_DROP_PCT = 0.0

#: Ceiling on a list response. Nothing pages this list today and no athlete
#: has anywhere near this many rehearsals -- the bound exists so the query
#: cannot grow without limit with the account.
_LIST_LIMIT = 100


# ──────────────────────────────────────────────────────────────────────
# Athlete inputs
# ──────────────────────────────────────────────────────────────────────

async def _build_model(db: AsyncSession, user_id: int, overrides: RiderOverrides | None = None):
    """The athlete's physical inputs, each with an honest absence.

    CP comes from the fitted power-duration curve when a ride has one, because
    that is a measurement; the profile FTP is the fallback and carries no W′
    with it, so the simulator simply never lets that rider blow up rather than
    inventing a W′ they have not demonstrated.
    """
    res = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = res.scalar_one_or_none()

    cp_watts: float | None = None
    w_prime_j: float | None = None
    fit = await latest_critical_power(db, user_id)
    if fit and fit.get("cp_watts"):
        cp_watts = float(fit["cp_watts"])
        w_prime_j = float(fit["w_prime_j"]) if fit.get("w_prime_j") else None
    elif profile is not None and getattr(profile, "ftp_watts", None):
        cp_watts = float(profile.ftp_watts)

    weight = getattr(profile, "weight_kg", None) if profile is not None else None
    o = overrides or RiderOverrides()
    # The override wins over the profile, but only when it is set: a rider who
    # never touched the weight knob must still be simulated at their real mass.
    if o.weight_kg:
        weight = o.weight_kg
    return build_rider_model(
        cp_watts=cp_watts,
        w_prime_j=w_prime_j,
        weight_kg=float(weight) if weight else None,
        cda_m2=_STORED_CDA_M2,
        durability_drop_pct=_STORED_DURABILITY_DROP_PCT,
        bike_mass_kg=o.bike_mass_kg,
        crr=o.crr(),
    )


async def _project_model(
    db: AsyncSession, user_id: int, model, route: RehearsalRoute
):
    """Swap in projected CP for the route's date, or leave the model alone.

    Returns `(model, cp_is_projected)`. W' is deliberately NOT projected with
    it: the projection produces a fitness-equivalent FTP, and there is no
    evidence in it about how the athlete's anaerobic capacity moves. Scaling W'
    by the same factor would be an invention, and W' is what decides where the
    blow-up lands -- the one number this page must not make up.
    """
    projected = await project_cp_for_date(
        db, user_id, route.ride_date, model.cp_watts
    )
    if projected is None:
        return model, False
    return replace(model, cp_watts=projected), True


async def _forecast_for_route(
    route: RehearsalRoute, today: date, start_hour: int | None = None
) -> dict | None:
    """One representative wind + temperature for a dated route, or None.

    None means "no weather", which the orchestrator reports as
    weather_used=false -- never a climate average standing in for a forecast.
    """
    if not weather_applies(route, today) or not route.points:
        return None
    start = route.points[0]
    when = datetime.combine(route.ride_date, time(12, 0), tzinfo=timezone.utc)
    body = await fetch_window_forecast(start.lat, start.lng, when, when)
    if not body:
        return None
    hourly = body.get("hourly") or {}
    speeds = hourly.get("wind_speed_10m") or []
    dirs = hourly.get("wind_direction_10m") or []
    temps = hourly.get("temperature_2m") or []
    usable = [
        i
        for i in range(min(len(speeds), len(dirs), len(temps)))
        if speeds[i] is not None and dirs[i] is not None and temps[i] is not None
    ]
    if start_hour is None:
        # No start time named: average the daylight window, as before.
        idx = [i for i in usable if _DAYLIGHT_FROM_H <= i % 24 <= _DAYLIGHT_TO_H]
    else:
        # A named start hour is a specific morning, not an average one -- the
        # whole point of the knob is that 6 a.m. is a different ride from 11.
        # Falls back to the daylight average rather than to nothing when the
        # forecast has a hole at exactly that hour.
        idx = [i for i in usable if i % 24 == start_hour]
        if not idx:
            idx = [i for i in usable if _DAYLIGHT_FROM_H <= i % 24 <= _DAYLIGHT_TO_H]
    if not idx:
        return None
    # Vector-average the wind: averaging bearings numerically turns a 350°/10°
    # pair into a southerly, which would flip a headwind into a tailwind.
    u = sum(speeds[i] * math.sin(math.radians(dirs[i])) for i in idx) / len(idx)
    v = sum(speeds[i] * math.cos(math.radians(dirs[i])) for i in idx) / len(idx)
    speed_kmh = math.hypot(u, v)
    from_deg = math.degrees(math.atan2(u, v)) % 360.0
    return {
        # fetch_window_forecast asks Open-Meteo for km/h; the simulator is SI.
        "wind_speed_ms": speed_kmh / 3.6,
        "wind_from_deg": from_deg,
        "temperature_c": sum(temps[i] for i in idx) / len(idx),
    }


def _assumptions_json(a: Assumptions, o: RiderOverrides) -> dict:
    return {
        "draft": a.draft,
        "effort": a.effort,
        "use_weather": a.use_weather,
        "weight_kg": o.weight_kg,
        "bike_mass_kg": o.bike_mass_kg,
        "surface": o.surface,
        "start_hour": o.start_hour,
        "use_projected_cp": o.use_projected_cp,
        "target_time_s": o.target_time_s,
    }


def _to_out(row: RouteRehearsal) -> RehearsalOut:
    return RehearsalOut(
        id=row.id,
        name=row.name,
        source_kind=row.source_kind,
        source_ref=row.source_ref,
        distance_m=row.distance_m,
        ascent_m=row.ascent_m,
        created_at=row.created_at,
        assumptions=row.assumptions,
        **row.result,
    )


def _num(value) -> float | None:
    """A real number from a profile attribute, or None.

    Profile objects reach this module from several paths and an attribute that
    is absent, a string, or a test double must all degrade to "unknown" rather
    than reaching the physiology as something that only looks numeric.
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) and f > 0 else None


async def _forecast_inputs(db: AsyncSession, user_id: int, profile) -> dict:
    """The athlete-side inputs the forecast layer needs, each independently absent-able.

    Nothing here is required: a rider with no power-duration curve still gets a
    route demand curve (the road's demand is a property of the road), and a
    rider with no HR anchors simply gets no HR forecast rather than one built on
    a guessed maximum.
    """
    ftp = _num(getattr(profile, "ftp_watts", None)) if profile is not None else None
    dob = getattr(profile, "date_of_birth", None) if profile is not None else None
    if not isinstance(dob, str):
        dob = None
    stored_max = _num(getattr(profile, "max_heart_rate", None)) if profile is not None else None
    stored_max_i = int(stored_max) if stored_max else None
    max_hr = derive_max_hr(max_heart_rate=stored_max_i, date_of_birth=dob)
    lthr_raw = _num(getattr(profile, "lthr_cycling", None)) if profile is not None else None
    lthr = derive_lthr(
        lthr=int(lthr_raw) if lthr_raw else None,
        max_heart_rate=stored_max_i,
        date_of_birth=dob,
    )

    mmp: dict | None = None
    try:
        pp = await compute_athlete_power_profile(db, user_id, profile)
        if pp:
            mmp = pp.get("mmp_curve")
    except Exception:  # pragma: no cover -- a rehearsal must survive this
        logger.exception("power profile unavailable for user_id=%s", user_id)

    return {
        "ftp_watts": float(ftp) if ftp else None,
        "athlete_mmp": mmp,
        "hr_anchors": {
            "lthr_bpm": float(lthr) if lthr else None,
            "max_hr": float(max_hr) if max_hr else None,
            "resting_hr": (
                _num(getattr(profile, "resting_heart_rate", None))
                if profile is not None
                else None
            ),
        },
    }


async def _recorded_ride(db: AsyncSession, user_id: int, activity_id: int) -> dict:
    """Duration and distance of the ride this rehearsal is OF, for the check.

    Read here rather than stashed away during route building: a module-level
    cache would leak, would not survive a second worker, and would answer a
    PATCH months later with a figure captured at create time.
    """
    activity = (
        await db.execute(
            select(Activity).where(
                Activity.id == activity_id, Activity.user_id == user_id
            )
        )
    ).scalars().first()
    if activity is None:
        return {}
    return {
        "actual_time_s": float(activity.duration_seconds) if activity.duration_seconds else None,
        "actual_distance_m": float(activity.distance_meters) if activity.distance_meters else None,
    }


async def _simulate_and_store(
    db: AsyncSession,
    row: RouteRehearsal,
    route: RehearsalRoute,
    assumptions: Assumptions,
    user_id: int,
    overrides: RiderOverrides | None = None,
) -> RouteRehearsal:
    """Run the pipeline for `route` and write the answer onto `row`."""
    o = overrides or RiderOverrides()
    try:
        validate_overrides(o)
    except OverrideError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    # The band's width, measured against this athlete's own past rides rather
    # than assumed. None keeps the reasoned default.
    calibration = await calibrate_spread(db, user_id)

    res_profile = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    fc_inputs = await _forecast_inputs(db, user_id, res_profile.scalar_one_or_none())

    # Past rides on this route. Doubles as the PR target, computed once so the
    # history card and the PR probability cannot disagree.
    attempts = await past_attempts(
        db,
        user_id,
        route_distance_m=route.total_distance_m,
        route_ascent_m=route.total_ascent_m,
    )
    pr_time_s = min((a.duration_s for a in attempts), default=None)

    model = await _build_model(db, user_id, o)
    cp_is_projected = False
    if o.use_projected_cp:
        model, cp_is_projected = await _project_model(db, user_id, model, route)
    forecast = (
        await _forecast_for_route(route, date.today(), o.start_hour)
        if assumptions.use_weather
        else None
    )
    try:
        # ~0.85 s of pure NumPy/Python for a 150 km alpine route, and
        # AssumptionsRow PATCHes on every tab tap -- run directly inside
        # `async def` it blocks the event loop and stalls every other request
        # on the worker. The march releases the GIL for its array work, so a
        # thread is nearly free here.
        result = await run_in_threadpool(
            run_rehearsal,
            route,
            model,
            assumptions,
            today=date.today(),
            forecast=forecast,
            target_time_s=o.target_time_s,
            spread_scale=calibration.spread_scale if calibration else 1.0,
            band_samples=calibration.samples if calibration else 0,
            ftp_watts=fc_inputs["ftp_watts"],
            athlete_mmp=fc_inputs["athlete_mmp"],
            hr_anchors=fc_inputs["hr_anchors"],
            start_readiness_pct=None,
            pr_time_s=pr_time_s,
        )
    except (RouteUnusable, RehearsalInputError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    result["cp_is_projected"] = cp_is_projected
    history = summarize_history(attempts, result.get("total_time_s"))
    if history is not None:
        result["history"] = history

    # Predicted vs actual: only a rehearsal OF a recorded ride can be checked.
    if row.source_kind == "activity" and row.source_ref:
        recorded = await _recorded_ride(db, user_id, row.source_ref)
        band = result.get("band") or {}
        comparison = compare_to_actual(
            predicted_time_s=result.get("total_time_s"),
            actual_time_s=recorded.get("actual_time_s"),
            rehearsed_distance_m=route.total_distance_m,
            actual_distance_m=recorded.get("actual_distance_m"),
            band_p10_s=band.get("p10_s"),
            band_p90_s=band.get("p90_s"),
        )
        if comparison is not None:
            result["actual"] = asdict(comparison)
    row.route = route_to_json(route)
    row.assumptions = _assumptions_json(assumptions, o)
    row.result = result
    row.distance_m = route.total_distance_m
    row.ascent_m = route.total_ascent_m
    return row


# ──────────────────────────────────────────────────────────────────────
# Route sources
# ──────────────────────────────────────────────────────────────────────

def _needs_ref(payload: RehearsalCreate) -> int:
    if payload.source_ref is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"a '{payload.source_kind}' rehearsal needs a source_ref",
        )
    return payload.source_ref


async def _crew_event_route(
    payload: RehearsalCreate, db: AsyncSession, user_id: int
) -> RehearsalRoute:
    """The crew event's ORIGINAL tour, off disk, at full resolution.

    Scoped to the caller's own crew by the same helpers the crew router uses,
    so an event from someone else's crew is indistinguishable from one that
    does not exist.
    """
    event_id = _needs_ref(payload)
    mem = await _require_membership(db, user_id)
    event = await _get_crew_event(db, event_id, mem.crew_id)
    if event.tour_filename is None:
        raise HTTPException(status_code=404, detail="this event has no tour")
    return route_from_crew_event(
        _tour_path(event.id),
        name=payload.name or event.name,
        # The ride is on a real day, so it can carry a real forecast -- which
        # is precisely the point of rehearsing a crew ride before Saturday.
        ride_date=payload.ride_date or event.starts_at.date(),
    )


async def _activity_route(
    payload: RehearsalCreate, db: AsyncSession, user_id: int
) -> RehearsalRoute:
    """A ride already ridden, rebuilt from its own stream at full resolution.

    No ride_date is passed: the day is in the past, so no forecast applies and
    a rehearsal of it is deliberately weather-free. That keeps the comparison
    honest -- the prediction sits next to the recorded ride under stated,
    neutral conditions rather than under a forecast that no longer exists.
    """
    activity_id = _needs_ref(payload)
    activity = (
        await db.execute(
            select(Activity).where(
                Activity.id == activity_id, Activity.user_id == user_id
            )
        )
    ).scalars().first()
    if activity is None:
        raise HTTPException(status_code=404, detail="activity not found")

    stream = (
        await db.execute(
            select(ActivityStream).where(
                ActivityStream.activity_id == activity_id,
                ActivityStream.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if stream is None:
        raise HTTPException(
            status_code=404, detail="no stored ride data for this activity"
        )

    channels = stream.streams or {}
    return route_from_activity(
        channels.get("latitude") or [],
        channels.get("longitude") or [],
        channels.get("altitude") or [],
        name=payload.name or activity.title,
    )


async def _target_event_route(
    payload: RehearsalCreate, db: AsyncSession, user_id: int
) -> RehearsalRoute:
    """The athlete's stored official course, dated to the event itself."""
    profile = (
        await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == user_id)
        )
    ).scalar_one_or_none()
    raw = getattr(profile, "target_event_gpx", None) if profile is not None else None
    if not raw:
        raise HTTPException(
            status_code=404, detail="no target-event route has been uploaded yet"
        )
    goal_event = (getattr(profile, "goals", None) or {}).get("target_event") or {}
    return route_from_gpx(
        raw,
        name=payload.name or goal_event.get("name"),
        ride_date=payload.ride_date or profile.target_event_date,
    )


async def _resolve_route(
    payload: RehearsalCreate, db: AsyncSession, user_id: int
) -> RehearsalRoute:
    """One of four sources → the single shape everything downstream sees."""
    try:
        if payload.source_kind == "gpx":
            if not payload.gpx:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="a GPX file is required to rehearse an uploaded route",
                )
            return route_from_gpx(
                payload.gpx, name=payload.name, ride_date=payload.ride_date
            )
        if payload.source_kind == "crew_event":
            return await _crew_event_route(payload, db, user_id)
        if payload.source_kind == "activity":
            return await _activity_route(payload, db, user_id)
        if payload.source_kind == "target_event":
            return await _target_event_route(payload, db, user_id)
        # SourceKind is a four-way Literal, so this is unreachable today --
        # but an unmatched value must raise, not silently fall through to
        # target_event, if a fifth kind is ever added without updating this
        # dispatch.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"unsupported source_kind: {payload.source_kind!r}",
        )
    except RouteUnusable as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except ValueError as exc:  # crew_tour._parse_and_collect normalises gpxpy's
        # own exceptions (GPXException, GPXXMLSyntaxException, ...) to
        # ValueError; a bug elsewhere in the call stack should surface as a
        # real 500, not be reported to the athlete as a bad file.
        logger.info("rehearsal GPX parse failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="that file could not be read as a GPX route",
        ) from exc


# ──────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────

@router.post("", response_model=RehearsalOut, status_code=status.HTTP_201_CREATED)
async def create_rehearsal(
    payload: RehearsalCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> RehearsalOut:
    """Simulate a route and store the answer."""
    route = await _resolve_route(payload, db, current_user.id)

    row = RouteRehearsal(
        user_id=current_user.id,
        source_kind=payload.source_kind,
        source_ref=payload.source_ref,
        name=payload.name or route.name,
        distance_m=route.total_distance_m,
        ascent_m=route.total_ascent_m,
        route={},
        assumptions={},
        result={},
    )
    assumptions = Assumptions(
        draft=payload.draft, effort=payload.effort, use_weather=payload.use_weather
    )
    overrides = RiderOverrides(
        weight_kg=payload.weight_kg,
        bike_mass_kg=payload.bike_mass_kg,
        surface=payload.surface,
        start_hour=payload.start_hour,
        use_projected_cp=payload.use_projected_cp,
        target_time_s=payload.target_time_s,
    )
    await _simulate_and_store(db, row, route, assumptions, current_user.id, overrides)

    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_out(row)


@router.get("", response_model=RehearsalListOut)
async def list_rehearsals(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> RehearsalListOut:
    """The athlete's rehearsals, newest first, headline figures only.

    `load_only` matters more than it looks: a stored rehearsal carries ~800 KB
    of route JSONB and ~195 KB of result JSONB, none of which a list row shows.
    `result` is still needed for the two headline figures, so only `route` is
    genuinely deferred -- and the LIMIT keeps a long-lived account from turning
    one list call into tens of megabytes.
    """
    res = await db.execute(
        select(RouteRehearsal)
        .options(
            load_only(
                RouteRehearsal.id,
                RouteRehearsal.name,
                RouteRehearsal.source_kind,
                RouteRehearsal.distance_m,
                RouteRehearsal.ascent_m,
                RouteRehearsal.created_at,
                RouteRehearsal.result,
            )
        )
        .where(RouteRehearsal.user_id == current_user.id)
        .order_by(RouteRehearsal.created_at.desc())
        .limit(_LIST_LIMIT)
    )
    rows = list(res.scalars().all())
    return RehearsalListOut(
        rehearsals=[
            RehearsalListItem(
                id=r.id,
                name=r.name,
                source_kind=r.source_kind,
                distance_m=r.distance_m,
                ascent_m=r.ascent_m,
                created_at=r.created_at,
                can_predict=bool((r.result or {}).get("can_predict")),
                total_time_s=(r.result or {}).get("total_time_s"),
                band=(r.result or {}).get("band"),
            )
            for r in rows
        ]
    )


async def _load_owned(db: AsyncSession, rehearsal_id: int, user_id: int) -> RouteRehearsal:
    res = await db.execute(
        select(RouteRehearsal).where(
            RouteRehearsal.id == rehearsal_id, RouteRehearsal.user_id == user_id
        )
    )
    row = res.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="rehearsal not found")
    return row


@router.get("/{rehearsal_id}", response_model=RehearsalOut)
async def get_rehearsal(
    rehearsal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> RehearsalOut:
    return _to_out(await _load_owned(db, rehearsal_id, current_user.id))


@router.patch("/{rehearsal_id}", response_model=RehearsalOut)
async def update_assumptions(
    rehearsal_id: int,
    payload: AssumptionsIn,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> RehearsalOut:
    """Change an assumption and re-run -- the stored route is reused, not re-parsed."""
    row = await _load_owned(db, rehearsal_id, current_user.id)
    stored = row.assumptions or {}
    assumptions = Assumptions(
        draft=payload.draft or stored.get("draft", "solo"),
        effort=payload.effort or stored.get("effort", "fondo"),
        use_weather=(
            payload.use_weather
            if payload.use_weather is not None
            else bool(stored.get("use_weather", True))
        ),
    )
    # Every knob merges over the stored value, so a PATCH that names only
    # `draft` cannot silently clear the athlete's target time or start hour.
    def _merged(name: str, default):
        sent = getattr(payload, name)
        return sent if sent is not None else stored.get(name, default)

    overrides = RiderOverrides(
        weight_kg=_merged("weight_kg", None),
        bike_mass_kg=_merged("bike_mass_kg", None),
        surface=_merged("surface", "asphalt") or "asphalt",
        start_hour=_merged("start_hour", None),
        use_projected_cp=bool(_merged("use_projected_cp", False)),
        target_time_s=_merged("target_time_s", None),
    )
    route = route_from_json(row.route)
    await _simulate_and_store(db, row, route, assumptions, current_user.id, overrides)
    await db.commit()
    await db.refresh(row)
    return _to_out(row)
