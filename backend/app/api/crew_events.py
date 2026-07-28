"""Crew events API — group rides / chaingangs / races a crew plans together,
each with RSVPs and an optional uploaded GPX tour.

Backs the V3 · Social screen. Every endpoint is crew-scoped: the caller must be
in a crew, and events belong to that crew. Mirrors the auth / user-scoping
patterns in app/api/crews.py (membership required) and the UploadFile pattern in
app/api/plan_import.py.

Endpoints (all under /crews/me/events):

  POST /crews/me/events            create an event; creator auto-RSVPs 'going'
  GET  /crews/me/events            list the crew's upcoming events (+ counts,
                                   my_status, tour metadata)
  POST /crews/me/events/{id}/rsvp  set the caller's RSVP (going|maybe|out)
  POST /crews/me/events/{id}/tour  upload a GPX (creator/owner only) → parse +
                                   cache polyline/distance/elevation, return event
  GET  /crews/me/events/{id}/tour  download the raw GPX (FileResponse); 404 if none
  GET  /crews/me/events/{id}/weather  five-hour ride-weather strip at the route
                                   start; honest available:false when there is no
                                   tour, no forecast horizon, or upstream fails

Tours are stored on disk at {settings.CREW_TOURS_ROOT}/{event_id}.gpx (the
Railway /data volume in prod; a local .dev_data path in dev). The parsed summary
is cached on the crew_events row so the card renders without re-parsing.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_active_user, get_db_for_user
from app.models.crew import Crew, CrewMembership
from app.models.crew_event import CrewEvent, CrewEventAttendee
from app.models.user import User
from app.services.crew_score import display_handle
from app.services.crew_tour import parse_gpx
from app.services.weather_client import fetch_window_forecast

router = APIRouter(prefix="/crews/me/events", tags=["crew-events"])

MAX_TOUR_BYTES = 10 * 1024 * 1024  # ~10 MB — GPX is text, this is generous.
RSVP_STATUSES = ("going", "maybe", "out")
EVENT_KINDS = ("sunrise_ride", "chaingang", "group_ride", "race")

# Weather strip: five hourly cells from the event's start hour — long enough to
# cover a proper group ride, and exactly what the detail page renders.
WEATHER_WINDOW_HOURS = 5
# Open-Meteo's /forecast endpoint only serves a band around today (a couple of
# months back, ~16 days ahead). Gate locally so an event next winter is an
# honest "unavailable" instead of a wasted request that 400s upstream.
_FORECAST_MAX_DAYS_AHEAD = 14
_FORECAST_MAX_DAYS_BEHIND = 5


# ──────────────────────────────────────────────────────────────────────
# Request / response schemas
# ──────────────────────────────────────────────────────────────────────


class EventCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    kind: str = Field(
        "group_ride",
        max_length=32,
        description="Short tag: sunrise_ride | chaingang | group_ride | race",
    )
    starts_at: datetime
    description: str | None = None
    meeting_point: str | None = None


class EventUpdate(BaseModel):
    """Partial edit — only the fields present are changed. Creator/owner only."""

    name: str | None = Field(None, min_length=1, max_length=120)
    kind: str | None = Field(None, max_length=32)
    starts_at: datetime | None = None
    description: str | None = None
    meeting_point: str | None = None


class RsvpRequest(BaseModel):
    status: Literal["going", "maybe", "out"]


class AttendeeRead(BaseModel):
    user_id: int
    handle: str
    status: str


class TourWaypoint(BaseModel):
    """One labelled pin on the event's route map, parsed from a GPX <wpt>.

    `name` is always present — a waypoint that had no usable label is dropped
    during parsing rather than surfaced as an anonymous dot. `sym` is the raw
    GPX symbol/type string, passed through untouched so the frontend's icon
    lookup sees exactly what the export wrote.
    """

    name: str
    lat: float
    lng: float
    sym: str | None
    desc: str | None


class EventRead(BaseModel):
    id: int
    crew_id: int
    creator_user_id: int
    creator_handle: str
    name: str
    kind: str
    starts_at: datetime
    description: str | None
    meeting_point: str | None
    created_at: datetime

    # RSVP roll-up
    counts: dict[str, int]  # {"going": n, "maybe": n, "out": n}
    going_count: int
    my_status: str | None  # the caller's RSVP, or null if they haven't
    attendees: list[AttendeeRead]

    # Tour metadata (present even when no tour → has_tour false, rest null)
    has_tour: bool
    tour_filename: str | None
    tour_distance_m: float | None
    tour_elevation_m: float | None
    tour_polyline: list[list[float]] | None
    # Elevation-profile series for the event detail page:
    # [[cumulative_distance_m, elevation_m], …] (≤120 points). null when the GPX
    # had no elevation data — the chart hides rather than faking a flat line.
    tour_profile: list[list[float]] | None
    tour_descent_m: float | None
    tour_max_grade_pct: float | None  # steepest gradient sustained over ≥100 m
    # Named pins for the route map (≤12, spread along the route). null when the
    # GPX carried no named waypoints, so the map draws no pin layer at all.
    tour_waypoints: list[TourWaypoint] | None


class EventHour(BaseModel):
    """One cell of the event's hourly weather strip. Every measure is nullable:
    Open-Meteo can serve a window with gaps, and a missing number must render as
    '—' rather than a zero that looks like real data."""

    time: datetime
    temp_c: float | None
    wind_kmh: float | None
    wind_dir_deg: float | None
    precip_prob_pct: float | None
    weather_code: int | None


class EventWeatherRead(BaseModel):
    available: bool
    window_start: datetime | None
    window_end: datetime | None
    hourly: list[EventHour]
    sunrise: datetime | None


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


async def _require_membership(db: AsyncSession, user_id: int) -> CrewMembership:
    """The caller must be in a crew for any event operation."""
    mem = (
        await db.execute(
            select(CrewMembership).where(CrewMembership.user_id == user_id)
        )
    ).scalar_one_or_none()
    if mem is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not in a crew")
    return mem


async def _get_crew_event(
    db: AsyncSession, event_id: int, crew_id: int
) -> CrewEvent:
    """Fetch an event scoped to the caller's crew, or 404. Scoping to crew_id
    means events from other crews are indistinguishable from missing ones."""
    event = (
        await db.execute(
            select(CrewEvent).where(
                CrewEvent.id == event_id, CrewEvent.crew_id == crew_id
            )
        )
    ).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="event not found")
    return event


async def _attendee_rows(
    db: AsyncSession, event_id: int
) -> list[tuple[CrewEventAttendee, User]]:
    rows = await db.execute(
        select(CrewEventAttendee, User)
        .join(User, User.id == CrewEventAttendee.user_id)
        .where(CrewEventAttendee.event_id == event_id)
        .order_by(CrewEventAttendee.created_at.asc())
    )
    return list(rows.all())


def _serialize_event(
    event: CrewEvent,
    attendee_rows: list[tuple[CrewEventAttendee, User]],
    creator: User | None,
    current_user_id: int,
) -> EventRead:
    counts = {s: 0 for s in RSVP_STATUSES}
    attendees: list[AttendeeRead] = []
    my_status: str | None = None
    for att, user in attendee_rows:
        counts[att.status] = counts.get(att.status, 0) + 1
        attendees.append(
            AttendeeRead(user_id=user.id, handle=display_handle(user), status=att.status)
        )
        if user.id == current_user_id:
            my_status = att.status
    return EventRead(
        id=event.id,
        crew_id=event.crew_id,
        creator_user_id=event.creator_user_id,
        creator_handle=display_handle(creator) if creator else "rider",
        name=event.name,
        kind=event.kind,
        starts_at=event.starts_at,
        description=event.description,
        meeting_point=event.meeting_point,
        created_at=event.created_at,
        counts=counts,
        going_count=counts["going"],
        my_status=my_status,
        attendees=attendees,
        has_tour=event.tour_polyline is not None,
        tour_filename=event.tour_filename,
        tour_distance_m=event.tour_distance_m,
        tour_elevation_m=event.tour_elevation_m,
        tour_polyline=event.tour_polyline,
        tour_profile=event.tour_profile,
        tour_descent_m=event.tour_descent_m,
        tour_max_grade_pct=event.tour_max_grade_pct,
        tour_waypoints=event.tour_waypoints,
    )


async def _serialize_with_attendees(
    db: AsyncSession, event: CrewEvent, current_user_id: int
) -> EventRead:
    rows = await _attendee_rows(db, event.id)
    creator = (
        await db.execute(select(User).where(User.id == event.creator_user_id))
    ).scalar_one_or_none()
    return _serialize_event(event, rows, creator, current_user_id)


def _tour_path(event_id: int) -> str:
    return os.path.join(settings.CREW_TOURS_ROOT, f"{event_id}.gpx")


# ──────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────


@router.post("", response_model=EventRead, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> EventRead:
    """Create a crew event. The creator auto-RSVPs 'going'. 403 if not in a crew."""
    mem = await _require_membership(db, current_user.id)

    kind = (payload.kind or "group_ride").strip() or "group_ride"
    event = CrewEvent(
        crew_id=mem.crew_id,
        creator_user_id=current_user.id,
        name=payload.name.strip(),
        kind=kind,
        starts_at=payload.starts_at,
        description=(payload.description or None),
        meeting_point=(payload.meeting_point or None),
    )
    db.add(event)
    await db.flush()  # need event.id for the attendee row

    db.add(
        CrewEventAttendee(event_id=event.id, user_id=current_user.id, status="going")
    )
    await db.commit()
    await db.refresh(event)
    return await _serialize_with_attendees(db, event, current_user.id)


@router.get("", response_model=list[EventRead])
async def list_events(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    include_past: bool = False,
) -> list[EventRead]:
    """List the caller's crew's upcoming events (soonest first), each with RSVP
    counts, the caller's status, and tour metadata. Empty when not in a crew.
    Pass include_past=true to also return events whose start time has passed."""
    mem = (
        await db.execute(
            select(CrewMembership).where(CrewMembership.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if mem is None:
        return []

    stmt = select(CrewEvent).where(CrewEvent.crew_id == mem.crew_id)
    if not include_past:
        stmt = stmt.where(CrewEvent.starts_at >= datetime.now(timezone.utc))
    stmt = stmt.order_by(CrewEvent.starts_at.asc())
    events = (await db.execute(stmt)).scalars().all()

    return [
        await _serialize_with_attendees(db, event, current_user.id)
        for event in events
    ]


@router.get("/{event_id}", response_model=EventRead)
async def get_event(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> EventRead:
    """Fetch a single event in the caller's crew (with counts, my_status, tour
    metadata). 403 if not in a crew, 404 if the event isn't theirs."""
    mem = await _require_membership(db, current_user.id)
    event = await _get_crew_event(db, event_id, mem.crew_id)
    return await _serialize_with_attendees(db, event, current_user.id)


@router.patch("/{event_id}", response_model=EventRead)
async def update_event(
    event_id: int,
    payload: EventUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> EventRead:
    """Edit an event's core fields. Only the event creator or the crew owner may
    edit (mirrors the tour-upload permission). 403 otherwise, 404 wrong crew."""
    mem = await _require_membership(db, current_user.id)
    event = await _get_crew_event(db, event_id, mem.crew_id)

    crew = (
        await db.execute(select(Crew).where(Crew.id == event.crew_id))
    ).scalar_one_or_none()
    is_owner = crew is not None and crew.owner_user_id == current_user.id
    if event.creator_user_id != current_user.id and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="only the event creator or crew owner can edit this event",
        )

    fields = payload.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"] is not None:
        event.name = fields["name"].strip()
    if "kind" in fields and fields["kind"] is not None:
        kind = (fields["kind"] or "").strip()
        if kind:
            event.kind = kind
    if "starts_at" in fields and fields["starts_at"] is not None:
        event.starts_at = fields["starts_at"]
    if "description" in fields:
        desc = fields["description"]
        event.description = (desc or None) if desc is not None else None
    if "meeting_point" in fields:
        mp = fields["meeting_point"]
        event.meeting_point = (mp or None) if mp is not None else None

    await db.commit()
    await db.refresh(event)
    return await _serialize_with_attendees(db, event, current_user.id)


@router.post("/{event_id}/rsvp", response_model=EventRead)
async def rsvp_event(
    event_id: int,
    payload: RsvpRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> EventRead:
    """Set the caller's RSVP for an event in their crew (upsert on
    (event, user)). 403 if not in a crew, 404 if the event isn't theirs."""
    mem = await _require_membership(db, current_user.id)
    event = await _get_crew_event(db, event_id, mem.crew_id)

    existing = (
        await db.execute(
            select(CrewEventAttendee).where(
                CrewEventAttendee.event_id == event_id,
                CrewEventAttendee.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            CrewEventAttendee(
                event_id=event_id, user_id=current_user.id, status=payload.status
            )
        )
    else:
        existing.status = payload.status
    await db.commit()
    return await _serialize_with_attendees(db, event, current_user.id)


@router.post("/{event_id}/tour", response_model=EventRead)
async def upload_tour(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    file: UploadFile = File(...),
) -> EventRead:
    """Upload a GPX tour for an event. Only the event creator or the crew owner
    may upload. The raw file is saved to the tour store as {event_id}.gpx and
    parsed → polyline (≤200 pts) / distance / elevation cached on the event."""
    mem = await _require_membership(db, current_user.id)
    event = await _get_crew_event(db, event_id, mem.crew_id)

    crew = (
        await db.execute(select(Crew).where(Crew.id == event.crew_id))
    ).scalar_one_or_none()
    is_owner = crew is not None and crew.owner_user_id == current_user.id
    if event.creator_user_id != current_user.id and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="only the event creator or crew owner can upload a tour",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty file")
    if len(data) > MAX_TOUR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="GPX too large — the limit is 10 MB.",
        )

    try:
        parsed = parse_gpx(data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"could not read a route from this GPX: {exc}",
        )

    # Persist the raw file to the tour store (create the dir on first use).
    os.makedirs(settings.CREW_TOURS_ROOT, exist_ok=True)
    with open(_tour_path(event_id), "wb") as fh:
        fh.write(data)

    event.tour_filename = file.filename or f"{event_id}.gpx"
    event.tour_polyline = parsed.polyline
    event.tour_distance_m = parsed.distance_m
    event.tour_elevation_m = parsed.elevation_m
    event.tour_profile = parsed.profile or None  # honest NULL when no <ele> data
    event.tour_descent_m = parsed.descent_m
    event.tour_max_grade_pct = parsed.max_grade_pct
    # Honest NULL rather than [] when the GPX had no named waypoints, so
    # "no pins in this file" reads differently from "not parsed yet".
    event.tour_waypoints = parsed.waypoints or None
    await db.commit()
    await db.refresh(event)
    return await _serialize_with_attendees(db, event, current_user.id)


@router.get("/{event_id}/tour")
async def download_tour(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> FileResponse:
    """Download the raw GPX for an event in the caller's crew. 404 when the
    event has no tour or the file is missing on disk."""
    mem = await _require_membership(db, current_user.id)
    event = await _get_crew_event(db, event_id, mem.crew_id)

    path = _tour_path(event_id)
    if event.tour_filename is None or not os.path.exists(path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="this event has no tour"
        )
    return FileResponse(
        path,
        media_type="application/gpx+xml",
        filename=event.tour_filename,
    )


def _parse_om_time(value) -> datetime | None:
    """Open-Meteo returns naive ISO strings in the requested timezone; we always
    request UTC, so stamp UTC on them rather than letting a naive datetime leak
    into the response (the frontend renders these in the rider's locale)."""
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


_WEATHER_UNAVAILABLE = EventWeatherRead(
    available=False, window_start=None, window_end=None, hourly=[], sunrise=None
)


@router.get("/{event_id}/weather", response_model=EventWeatherRead)
async def get_event_weather(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> EventWeatherRead:
    """Ride-weather forecast for an event: five hourly cells from the start hour
    at the route's own starting coordinates, plus that day's sunrise.

    Decoration on a page that must render regardless, so every failure mode is
    an honest ``available: false`` rather than an error: no uploaded tour (we
    have no location and refuse to guess one), a date outside the forecast
    horizon, or any upstream problem. Auth is the same crew-membership scoping as
    the sibling endpoints: 403 when not in a crew, 404 for another crew's event.
    """
    mem = await _require_membership(db, current_user.id)
    event = await _get_crew_event(db, event_id, mem.crew_id)

    # Location comes only from the route's first point. No tour → no honest
    # location (the meeting_point is free text, not coordinates) → unavailable.
    polyline = event.tour_polyline or []
    if not polyline or not isinstance(polyline[0], (list, tuple)) or len(polyline[0]) < 2:
        return _WEATHER_UNAVAILABLE
    try:
        lat, lng = float(polyline[0][0]), float(polyline[0][1])
    except (TypeError, ValueError):
        return _WEATHER_UNAVAILABLE

    starts_at = event.starts_at
    if starts_at.tzinfo is None:  # SQLite/test rows can come back naive
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    window_start = starts_at.astimezone(timezone.utc).replace(
        minute=0, second=0, microsecond=0
    )
    window_end = window_start + timedelta(hours=WEATHER_WINDOW_HOURS)

    now = datetime.now(timezone.utc)
    if not (
        now - timedelta(days=_FORECAST_MAX_DAYS_BEHIND)
        <= window_start
        <= now + timedelta(days=_FORECAST_MAX_DAYS_AHEAD)
    ):
        return _WEATHER_UNAVAILABLE

    try:
        body = await fetch_window_forecast(lat, lng, window_start, window_end)
    except Exception:  # the client already swallows its own failures; belt+braces
        body = None
    if not body:
        return _WEATHER_UNAVAILABLE

    hourly = body.get("hourly") or {}
    times = hourly.get("time") or []
    temps = hourly.get("temperature_2m") or []
    precs = hourly.get("precipitation_probability") or []
    winds = hourly.get("wind_speed_10m") or []
    wdirs = hourly.get("wind_direction_10m") or []
    codes = hourly.get("weather_code") or []

    def _at(seq, i):
        val = seq[i] if i < len(seq) else None
        return None if val is None else val

    cells: list[EventHour] = []
    for i, raw_t in enumerate(times):
        t = _parse_om_time(raw_t)
        # Half-open window: exactly WEATHER_WINDOW_HOURS cells, so the strip has
        # a fixed width whatever minute the ride happens to start on.
        if t is None or not (window_start <= t < window_end):
            continue
        code = _at(codes, i)
        cells.append(
            EventHour(
                time=t,
                temp_c=_at(temps, i),
                wind_kmh=_at(winds, i),
                wind_dir_deg=_at(wdirs, i),
                precip_prob_pct=_at(precs, i),
                weather_code=int(code) if code is not None else None,
            )
        )
    if not cells:
        # Upstream answered but not for our window (e.g. clipped horizon).
        return _WEATHER_UNAVAILABLE

    # Sunrise for the ride's own date — the daily arrays are parallel to
    # daily.time, so match on date instead of assuming index 0.
    sunrise: datetime | None = None
    daily = body.get("daily") or {}
    d_times = daily.get("time") or []
    d_sunrise = daily.get("sunrise") or []
    for i, day in enumerate(d_times):
        if isinstance(day, str) and day.startswith(window_start.date().isoformat()):
            sunrise = _parse_om_time(_at(d_sunrise, i))
            break

    return EventWeatherRead(
        available=True,
        window_start=window_start,
        window_end=window_end,
        hourly=cells,
        sunrise=sunrise,
    )
