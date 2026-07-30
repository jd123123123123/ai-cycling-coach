"""Route Rehearsal API -- ride the route before you ride it.

  POST  /rehearsals        upload a GPX, get terrain + a predicted band
  GET   /rehearsals        the athlete's stored rehearsals (headlines only)
  GET   /rehearsals/{id}   one rehearsal in full
  PATCH /rehearsals/{id}   change an assumption and re-run

Rehearsals are STORED rather than recomputed on read: "what did I think the
Maratona would take back in March" needs the March answer to still exist, and
re-simulating with today's CP would quietly answer a different question. A
PATCH is the one place a re-run happens, and it re-runs deliberately.

Only source_kind='gpx' is wired here; crew_event / activity / target_event
routes land with Task 12.

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
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
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
    route_from_gpx,
)
from app.services.rehearsal.simulator import Assumptions
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


# ──────────────────────────────────────────────────────────────────────
# Athlete inputs
# ──────────────────────────────────────────────────────────────────────

async def _build_model(db: AsyncSession, user_id: int):
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
    return build_rider_model(
        cp_watts=cp_watts,
        w_prime_j=w_prime_j,
        weight_kg=float(weight) if weight else None,
        cda_m2=_STORED_CDA_M2,
        durability_drop_pct=_STORED_DURABILITY_DROP_PCT,
    )


async def _forecast_for_route(route: RehearsalRoute, today: date) -> dict | None:
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
    idx = [
        i
        for i in range(min(len(speeds), len(dirs), len(temps)))
        if _DAYLIGHT_FROM_H <= i % 24 <= _DAYLIGHT_TO_H
        and speeds[i] is not None
        and dirs[i] is not None
        and temps[i] is not None
    ]
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


def _assumptions_json(a: Assumptions) -> dict:
    return {"draft": a.draft, "effort": a.effort, "use_weather": a.use_weather}


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


async def _simulate_and_store(
    db: AsyncSession,
    row: RouteRehearsal,
    route: RehearsalRoute,
    assumptions: Assumptions,
    user_id: int,
) -> RouteRehearsal:
    """Run the pipeline for `route` and write the answer onto `row`."""
    model = await _build_model(db, user_id)
    forecast = await _forecast_for_route(route, date.today()) if assumptions.use_weather else None
    try:
        result = run_rehearsal(
            route, model, assumptions, today=date.today(), forecast=forecast
        )
    except (RouteUnusable, RehearsalInputError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    row.route = route_to_json(route)
    row.assumptions = _assumptions_json(assumptions)
    row.result = result
    row.distance_m = route.total_distance_m
    row.ascent_m = route.total_ascent_m
    return row


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
    if payload.source_kind != "gpx":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"'{payload.source_kind}' routes are not supported yet",
        )
    if not payload.gpx:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="a GPX file is required to rehearse an uploaded route",
        )

    try:
        route = route_from_gpx(
            payload.gpx, name=payload.name, ride_date=payload.ride_date
        )
    except RouteUnusable as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except Exception as exc:  # a file that is not GPX at all
        logger.info("rehearsal GPX parse failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="that file could not be read as a GPX route",
        ) from exc

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
    await _simulate_and_store(db, row, route, assumptions, current_user.id)

    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_out(row)


@router.get("", response_model=RehearsalListOut)
async def list_rehearsals(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> RehearsalListOut:
    """The athlete's rehearsals, newest first, headline figures only."""
    res = await db.execute(
        select(RouteRehearsal)
        .where(RouteRehearsal.user_id == current_user.id)
        .order_by(RouteRehearsal.created_at.desc())
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
    route = route_from_json(row.route)
    await _simulate_and_store(db, row, route, assumptions, current_user.id)
    await db.commit()
    await db.refresh(row)
    return _to_out(row)
