"""Crew chat + all-crew rides feed — part of the V3 · Social screen.

Every endpoint is crew-scoped: the caller must be in a crew, and it operates on
that crew's data. Mirrors the auth / crew-scoping patterns in
app/api/crew_events.py (membership required via the shared helper) and reuses the
reaction-summary builder in app/services/crew_social.py so chat lines and rides
carry their reactions inline.

Endpoints:

  POST /crews/me/chat             post a chat line → 201 the created message
  GET  /crews/me/chat             recent messages (newest-last), paginated, each
                                  with its reaction summary
  GET  /crews/me/rides            recent cycling activities across ALL crew
                                  members (newest first), each with a 'ride'
                                  reaction summary and its comment count
  GET  /crews/me/rides/{id}/comments   the comment thread under one crew ride
  POST /crews/me/rides/{id}/comments   write under a crew-mate's ride → 201

WHAT THE FEED IS ALLOWED TO SAY. `RideRead` carries training facts and nothing
else — no GPS, no polyline, no start point. That is the same line
`GET /crews/me/members/{id}/rides` draws in app/api/crews.py and for the same
reason: telling the crew you rode 82 km is the point, handing them the track
that starts at your front door is not.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
from app.models.ride_photo import RidePhoto
from app.models.activity_stream import ActivityStream
from app.services.crew_notify import notify_ride_comment
from app.models.crew import CrewMembership
from app.models.crew_social import CrewMessage
from app.models.user import User
from app.services.crew_score import display_handle
from app.services.crew_social import reaction_summaries, require_membership

router = APIRouter(prefix="/crews/me", tags=["crew-social"])

# Sports counted as "a ride" in the crew feed. App is bike-only, but activity
# sources label bike work in a few ways — match them case-insensitively.
CYCLING_SPORTS: frozenset[str] = frozenset(
    {
        "cycling",
        "ride",
        "bike",
        "biking",
        "virtual_ride",
        "virtualride",
        "indoor_cycling",
        "gravel_cycling",
        "mountain_biking",
        "road_cycling",
    }
)


# Where a `crew_messages` row was written. The wall is the crew itself
# (target_id NULL); a comment hangs off one activity. See models/crew_social.py
# for why both live in one table.
MSG_TARGET_CREW = "crew"
MSG_TARGET_RIDE = "ride"


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class ReactionSummary(BaseModel):
    counts: dict[str, int]  # {emoji: n}
    mine: list[str]         # emojis the caller has set on this target


class ChatSend(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class MessageRead(BaseModel):
    id: int
    crew_id: int
    user_id: int
    handle: str
    display_name: str
    text: str
    created_at: datetime
    reactions: ReactionSummary


class RideRead(BaseModel):
    id: int  # activity id
    user_id: int
    handle: str
    display_name: str
    title: str | None
    started_at: datetime
    distance_m: float | None
    elevation_gain_m: float | None
    duration_seconds: int | None
    # ── The detail a rider actually opens a crew-mate's ride for ──
    # Nullable throughout: a ride imported without a power meter has no NP and
    # no TSS, and the feed prints an em dash for it rather than a padded zero.
    sport: str | None = None
    tss: int | None = None
    avg_power_w: int | None = None
    avg_hr: int | None = None
    calories: int | None = None
    is_mine: bool = False
    reactions: ReactionSummary
    comment_count: int = 0
    #: What the rider wrote about the ride, and the pictures they attached.
    #: Both are null/empty for every ride nobody has filled in — which is most
    #: of them, and is exactly why the feed has two post shapes rather than one
    #: shape with a hole in it.
    description: str | None = None
    photo_urls: list[str] = []
    #: The ride's own shape over time, downsampled for a card: altitude for a
    #: ride that climbed, power for one on a trainer. Raw units — the card
    #: scales them against their own series, never against a fixed axis, so a
    #: flat commute and an alpine day are each legible on their own terms.
    #: None where the ride carries no such stream, and the card then draws no
    #: chart rather than a straight line pretending to be terrain.
    elevation_profile: list[float] | None = None
    power_profile: list[float] | None = None
    #: The ride's shape, as `[[lat, lng], ...]` downsampled for a feed
    #: thumbnail — the client projects it (`W3RouteCard.project`). None when the
    #: ride carries no usable GPS track (indoor, trainer, a watch with GPS off),
    #: and the card then draws no map rather than inventing one.
    route: list[list[float]] | None = None


class CommentSend(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        """`min_length=1` lets "   " through, and the endpoint strips before
        writing — so without this a rider could post an empty comment that
        still counts in the feed's badge. Validated here, stored stripped."""
        text = v.strip()
        if not text:
            raise ValueError("comment must not be blank")
        return text


class CommentRead(BaseModel):
    id: int
    activity_id: int
    user_id: int
    handle: str
    display_name: str
    text: str
    created_at: datetime
    is_mine: bool


# ──────────────────────────────────────────────────────────────────────
# Chat
# ──────────────────────────────────────────────────────────────────────


@router.post("/chat", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
async def post_chat(
    payload: ChatSend,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> MessageRead:
    """Post a chat line to the caller's crew wall. 403 if not in a crew. Returns
    the created message (with the author's handle) and an empty reaction summary."""
    mem = await require_membership(db, current_user.id)

    msg = CrewMessage(
        crew_id=mem.crew_id,
        user_id=current_user.id,
        text=payload.text.strip(),
        # Explicit, not left to the column default: a wall line and a ride
        # comment are the same row shape, so the one that decides which is
        # which should be written where it is read.
        target_type=MSG_TARGET_CREW,
        target_id=None,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    return MessageRead(
        id=msg.id,
        crew_id=msg.crew_id,
        user_id=msg.user_id,
        handle=display_handle(current_user),
        display_name=display_handle(current_user),
        text=msg.text,
        created_at=msg.created_at,
        reactions=ReactionSummary(counts={}, mine=[]),
    )


@router.get("/chat", response_model=list[MessageRead])
async def list_chat(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    limit: int = 50,
    before_id: int | None = None,
) -> list[MessageRead]:
    """The crew wall, newest-LAST (ascending id), so the frontend appends at the
    bottom. Returns the most recent `limit` (1..100) messages; pass `before_id`
    to page further back (returns messages with id < before_id). Empty when not
    in a crew. Each message carries its reaction summary (target_type 'message')."""
    mem = (
        await db.execute(
            select(CrewMembership).where(CrewMembership.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if mem is None:
        return []

    limit = max(1, min(100, limit))

    # Fetch the newest `limit` messages (optionally before a cursor), newest
    # first, then reverse to ascending for the response.
    # THE WALL ONLY. Without this filter every comment written under a ride
    # would surface a second time in the crew chat, out of the context that
    # made it mean anything.
    stmt = select(CrewMessage, User).join(
        User, User.id == CrewMessage.user_id
    ).where(
        CrewMessage.crew_id == mem.crew_id,
        CrewMessage.target_type == MSG_TARGET_CREW,
    )
    if before_id is not None:
        stmt = stmt.where(CrewMessage.id < before_id)
    stmt = stmt.order_by(CrewMessage.id.desc()).limit(limit)
    rows = list((await db.execute(stmt)).all())
    rows.reverse()  # ascending → newest last

    summaries = await reaction_summaries(
        db,
        crew_id=mem.crew_id,
        user_id=current_user.id,
        target_type="message",
        target_ids=[m.id for m, _ in rows],
    )

    out: list[MessageRead] = []
    for msg, user in rows:
        name = display_handle(user) if user else "rider"
        summ = summaries.get(msg.id, {"counts": {}, "mine": []})
        out.append(
            MessageRead(
                id=msg.id,
                crew_id=msg.crew_id,
                user_id=msg.user_id,
                handle=name,
                display_name=name,
                text=msg.text,
                created_at=msg.created_at,
                reactions=ReactionSummary(counts=summ["counts"], mine=summ["mine"]),
            )
        )
    return out


# ──────────────────────────────────────────────────────────────────────
# All-crew rides feed
# ──────────────────────────────────────────────────────────────────────



#: How many points a feed thumbnail keeps. The shape of a loop survives heavy
#: downsampling — `W3RouteCard` makes the same argument for its 104px tile —
#: and this is what keeps a 20-ride feed a few kB rather than a few hundred.
FEED_ROUTE_POINTS = 70


async def _route_thumbs(
    db: AsyncSession, *, activity_ids: list[int]
) -> dict[int, list[list[float]]]:
    """{activity_id → [[lat, lng], ...]} for a page of rides, in one query.

    Only rides flagged `has_gps` are read, and a track that does not survive
    cleaning simply does not appear in the result — the card then draws no map.
    Nothing here fabricates a shape for a ride that has none, which is the same
    rule `weekly_wrapped.project_route` follows for the wrapped route card.
    """
    if not activity_ids:
        return {}
    rows = (
        await db.execute(
            select(ActivityStream.activity_id, ActivityStream.streams).where(
                ActivityStream.activity_id.in_(activity_ids),
                ActivityStream.has_gps.is_(True),
            )
        )
    ).all()

    out: dict[int, list[list[float]]] = {}
    for act_id, streams in rows:
        if not isinstance(streams, dict):
            continue
        lats = streams.get("latitude") or []
        lngs = streams.get("longitude") or []
        n = min(len(lats), len(lngs))
        pts: list[list[float]] = []
        for i in range(n):
            la, ln = lats[i], lngs[i]
            if not isinstance(la, (int, float)) or not isinstance(ln, (int, float)):
                continue
            fla, fln = float(la), float(ln)
            # NaN never equals itself; drop null-island noise the same way
            # `project_route` does.
            if fla != fla or fln != fln:
                continue
            if abs(fla) > 90 or abs(fln) > 180:
                continue
            if fla == 0.0 and fln == 0.0:
                continue
            pts.append([round(fla, 5), round(fln, 5)])
        if len(pts) < 2:
            continue
        if len(pts) > FEED_ROUTE_POINTS:
            step = len(pts) / FEED_ROUTE_POINTS
            sampled = [pts[int(i * step)] for i in range(FEED_ROUTE_POINTS)]
            # Always keep the real finish, so a loop closes where it truly ends.
            if sampled[-1] != pts[-1]:
                sampled.append(pts[-1])
            pts = sampled
        out[act_id] = pts
    return out


@router.get("/rides", response_model=list[RideRead])
async def list_crew_rides(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    limit: int = 20,
) -> list[RideRead]:
    """Recent cycling activities across ALL of the caller's crew (newest first),
    each with author handle + a 'ride' reaction summary. Empty when not in a
    crew. Only cycling/ride sports are included."""
    mem = (
        await db.execute(
            select(CrewMembership).where(CrewMembership.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if mem is None:
        return []

    limit = max(1, min(100, limit))

    stmt = (
        select(Activity, User)
        .join(CrewMembership, CrewMembership.user_id == Activity.user_id)
        .join(User, User.id == Activity.user_id)
        .where(
            CrewMembership.crew_id == mem.crew_id,
            func.lower(Activity.sport).in_(CYCLING_SPORTS),
        )
        .order_by(Activity.started_at.desc())
        .limit(limit)
    )
    rows = list((await db.execute(stmt)).all())

    ride_ids = [a.id for a, _ in rows]

    summaries = await reaction_summaries(
        db,
        crew_id=mem.crew_id,
        user_id=current_user.id,
        target_type="ride",
        target_ids=ride_ids,
    )
    counts = await _comment_counts(db, crew_id=mem.crew_id, activity_ids=ride_ids)
    photos = await _ride_photo_urls(db, ride_ids)
    profiles = await _ride_profiles(db, activity_ids=ride_ids)
    routes = await _route_thumbs(db, activity_ids=ride_ids)

    out: list[RideRead] = []
    for act, user in rows:
        name = display_handle(user) if user else "rider"
        summ = summaries.get(act.id, {"counts": {}, "mine": []})
        out.append(
            RideRead(
                id=act.id,
                user_id=act.user_id,
                handle=name,
                display_name=name,
                title=act.title,
                started_at=act.started_at,
                distance_m=act.distance_meters,
                elevation_gain_m=act.elevation_gain_m,
                duration_seconds=act.duration_seconds,
                sport=act.sport,
                tss=int(round(act.tss)) if act.tss is not None else None,
                avg_power_w=(
                    int(round(act.average_power))
                    if act.average_power is not None
                    else None
                ),
                avg_hr=int(act.average_hr) if act.average_hr is not None else None,
                calories=int(act.calories) if act.calories is not None else None,
                is_mine=act.user_id == current_user.id,
                reactions=ReactionSummary(counts=summ["counts"], mine=summ["mine"]),
                comment_count=counts.get(act.id, 0),
                description=act.description,
                photo_urls=photos.get(act.id, []),
                elevation_profile=profiles.get(act.id, {}).get("altitude"),
                power_profile=profiles.get(act.id, {}).get("power"),
                route=routes.get(act.id),
            )
        )
    return out


# ──────────────────────────────────────────────────────────────────────
# Comments under a crew ride
# ──────────────────────────────────────────────────────────────────────


#: Enough to read a col or an interval block, few enough that a page of them is
#: not a payload. The route thumb uses the same reasoning at its own count.
FEED_PROFILE_POINTS = 48


def _downsample(values: list, n: int) -> list[float] | None:
    """`n` evenly spaced points, or None if there is nothing worth drawing.

    Sampled rather than averaged, deliberately: a mean smooths the col flat,
    and the peak of a climb is the whole reason the profile is on the card.
    """
    clean = [float(v) for v in values if isinstance(v, (int, float)) and v == v]
    if len(clean) < 8:
        return None
    if len(clean) <= n:
        return [round(v, 1) for v in clean]
    step = len(clean) / n
    out = [clean[int(i * step)] for i in range(n)]
    out[-1] = clean[-1]          # never lose the real end
    return [round(v, 1) for v in out]


async def _ride_profiles(
    db: AsyncSession, *, activity_ids: list[int]
) -> dict[int, dict[str, list[float] | None]]:
    """{activity_id → {altitude, power}} for a page, in one query.

    Batched for the same reason as the comment counts and the photos: a feed
    that read a stream per row would issue a query per post.
    """
    if not activity_ids:
        return {}
    rows = (
        await db.execute(
            select(ActivityStream.activity_id, ActivityStream.streams).where(
                ActivityStream.activity_id.in_(activity_ids)
            )
        )
    ).all()
    out: dict[int, dict[str, list[float] | None]] = {}
    for act_id, streams in rows:
        if not isinstance(streams, dict):
            continue
        out[act_id] = {
            "altitude": _downsample(streams.get("altitude") or [], FEED_PROFILE_POINTS),
            "power": _downsample(streams.get("power") or [], FEED_PROFILE_POINTS),
        }
    return out


async def _ride_photo_urls(
    db: AsyncSession, activity_ids: list[int]
) -> dict[int, list[str]]:
    """Photo URLs per ride, in the rider's own order.

    ONE QUERY FOR THE WHOLE PAGE, like the comment counts above it. A feed that
    fetched each ride's photos as it built the row would issue a query per post
    — the shape that makes a feed feel slow and never shows up in a unit test.
    """
    if not activity_ids:
        return {}
    res = await db.execute(
        select(RidePhoto.activity_id, RidePhoto.id)
        .where(RidePhoto.activity_id.in_(activity_ids))
        .order_by(RidePhoto.activity_id, RidePhoto.sort, RidePhoto.id)
    )
    out: dict[int, list[str]] = {}
    for act_id, photo_id in res.all():
        out.setdefault(act_id, []).append(f"/activities/{act_id}/photos/{photo_id}")
    return out


async def _comment_counts(
    db: AsyncSession, *, crew_id: int, activity_ids: list[int]
) -> dict[int, int]:
    """{activity_id → comment count} for a page of rides, in one grouped query.

    A per-ride COUNT would be N round-trips for a feed of twenty; this is the
    same batching `reaction_summaries` does one call above.
    """
    if not activity_ids:
        return {}
    rows = (
        await db.execute(
            select(CrewMessage.target_id, func.count(CrewMessage.id))
            .where(
                CrewMessage.crew_id == crew_id,
                CrewMessage.target_type == MSG_TARGET_RIDE,
                CrewMessage.target_id.in_(activity_ids),
            )
            .group_by(CrewMessage.target_id)
        )
    ).all()
    return {int(tid): int(n) for tid, n in rows if tid is not None}


async def _crew_ride_or_404(
    db: AsyncSession, *, activity_id: int, crew_id: int
) -> Activity:
    """The activity, but only if it belongs to somebody in the caller's crew.

    404 rather than 403 for a ride outside the crew, following the rule set in
    app/api/crews.py: the endpoint must not confirm that an activity id exists
    to somebody who has no business seeing it.
    """
    act = (
        await db.execute(
            select(Activity)
            .join(CrewMembership, CrewMembership.user_id == Activity.user_id)
            .where(Activity.id == activity_id, CrewMembership.crew_id == crew_id)
        )
    ).scalars().first()
    if act is None:
        raise HTTPException(status_code=404, detail="ride not in your crew")
    return act


@router.get("/rides/{activity_id}/comments", response_model=list[CommentRead])
async def list_ride_comments(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    limit: int = 100,
) -> list[CommentRead]:
    """The thread under one crew ride, oldest-FIRST — a conversation is read
    downwards, unlike the feed above it. 403 when not in a crew, 404 when the
    ride belongs to nobody in it."""
    mem = await require_membership(db, current_user.id)
    await _crew_ride_or_404(db, activity_id=activity_id, crew_id=mem.crew_id)

    limit = max(1, min(200, limit))
    stmt = (
        select(CrewMessage, User)
        .join(User, User.id == CrewMessage.user_id)
        .where(
            CrewMessage.crew_id == mem.crew_id,
            CrewMessage.target_type == MSG_TARGET_RIDE,
            CrewMessage.target_id == activity_id,
        )
        .order_by(CrewMessage.id.desc())
        .limit(limit)
    )
    rows = list((await db.execute(stmt)).all())
    rows.reverse()  # ascending → oldest first

    return [
        CommentRead(
            id=msg.id,
            activity_id=activity_id,
            user_id=msg.user_id,
            handle=display_handle(user) if user else "rider",
            display_name=display_handle(user) if user else "rider",
            text=msg.text,
            created_at=msg.created_at,
            is_mine=msg.user_id == current_user.id,
        )
        for msg, user in rows
    ]


@router.post(
    "/rides/{activity_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
async def post_ride_comment(
    activity_id: int,
    payload: CommentSend,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> CommentRead:
    """Write under a crew-mate's ride (or your own). 403 when not in a crew,
    404 when the ride is not one of the crew's."""
    mem = await require_membership(db, current_user.id)
    ride = await _crew_ride_or_404(db, activity_id=activity_id, crew_id=mem.crew_id)

    msg = CrewMessage(
        crew_id=mem.crew_id,
        user_id=current_user.id,
        text=payload.text.strip(),
        target_type=MSG_TARGET_RIDE,
        target_id=activity_id,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # AND TELL THE RIDER WHOSE RIDE IT IS. Writing under somebody's ride was
    # silent until now: it landed in a table, and they found it the next time
    # they happened to open the crew screen and expand that row. A comment
    # nobody is told about is a comment to nobody. Self-comments stay silent,
    # and a failed push never fails the write — see `crew_notify`.
    await notify_ride_comment(db, actor=current_user, activity=ride, text=msg.text)

    name = display_handle(current_user)
    return CommentRead(
        id=msg.id,
        activity_id=activity_id,
        user_id=msg.user_id,
        handle=name,
        display_name=name,
        text=msg.text,
        created_at=msg.created_at,
        is_mine=True,
    )
