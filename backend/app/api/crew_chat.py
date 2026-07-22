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
                                  reaction summary
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
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
    reactions: ReactionSummary


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
    stmt = select(CrewMessage, User).join(
        User, User.id == CrewMessage.user_id
    ).where(CrewMessage.crew_id == mem.crew_id)
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

    summaries = await reaction_summaries(
        db,
        crew_id=mem.crew_id,
        user_id=current_user.id,
        target_type="ride",
        target_ids=[a.id for a, _ in rows],
    )

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
                reactions=ReactionSummary(counts=summ["counts"], mine=summ["mine"]),
            )
        )
    return out
