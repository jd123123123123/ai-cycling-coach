"""Crew reactions — the flexible emoji cheer graph behind the V3 · Social screen.

A reaction points at one of four things via (target_type, target_id):

  'message'    a chat line          (target_id = crew_messages.id)
  'ride'       a crew-mate's ride   (target_id = activities.id)
  'event'      a crew event         (target_id = crew_events.id)
  'crew_week'  "cheer the crew this week" (target_id omitted / null)

Every endpoint is crew-scoped (membership required) and reactions are visible to
the whole crew. Chat-message reactions come embedded in GET /crews/me/chat; this
router serves the toggle + the standalone summary read (crew_week cheer,
event/ride reactions).

Endpoints:

  POST /crews/me/reactions/toggle   toggle the caller's reaction → updated summary
  GET  /crews/me/reactions          summary for one target → {counts, mine}
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
from app.models.crew import CrewMembership
from app.models.crew_social import CrewReaction
from app.models.user import User
from app.services.crew_notify import notify_ride_reaction
from app.services.crew_social import (
    ALLOWED_EMOJI,
    TARGET_TYPES,
    reaction_summary,
    require_membership,
)

router = APIRouter(prefix="/crews/me/reactions", tags=["crew-social"])


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class ToggleRequest(BaseModel):
    target_type: str = Field(..., description="message | crew_week | event | ride")
    target_id: int | None = Field(
        None, description="the target's id; omit/null for 'crew_week'"
    )
    emoji: str = Field(..., description="one of 🔥 💪 👏 🚀 🙌 ⚡")


class ReactionSummaryRead(BaseModel):
    target_type: str
    target_id: int | None
    counts: dict[str, int]  # {emoji: n}
    mine: list[str]         # emojis the caller has set on this target
    toggled_on: bool | None = None  # true if the toggle added, false if removed


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _validate(target_type: str, emoji: str) -> None:
    if target_type not in TARGET_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"target_type must be one of {list(TARGET_TYPES)}",
        )
    if emoji not in ALLOWED_EMOJI:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"emoji must be one of {list(ALLOWED_EMOJI)}",
        )


def _normalize_target_id(target_type: str, target_id: int | None) -> int | None:
    """'crew_week' has a single bucket per crew → its target_id is always NULL,
    regardless of what the client sends. Other targets keep their id."""
    return None if target_type == "crew_week" else target_id


# ──────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────


@router.post("/toggle", response_model=ReactionSummaryRead)
async def toggle_reaction(
    payload: ToggleRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> ReactionSummaryRead:
    """Toggle the caller's reaction on a target: adds it if absent, removes it if
    present. Returns the updated per-emoji counts + the caller's own emojis for
    that target. 403 if not in a crew, 422 on a bad target_type/emoji."""
    _validate(payload.target_type, payload.emoji)
    mem = await require_membership(db, current_user.id)
    target_id = _normalize_target_id(payload.target_type, payload.target_id)

    # Find the caller's existing reaction of this emoji on this target.
    stmt = select(CrewReaction).where(
        CrewReaction.crew_id == mem.crew_id,
        CrewReaction.user_id == current_user.id,
        CrewReaction.target_type == payload.target_type,
        CrewReaction.emoji == payload.emoji,
    )
    if target_id is None:
        stmt = stmt.where(CrewReaction.target_id.is_(None))
    else:
        stmt = stmt.where(CrewReaction.target_id == target_id)
    existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing is None:
        db.add(
            CrewReaction(
                crew_id=mem.crew_id,
                user_id=current_user.id,
                target_type=payload.target_type,
                target_id=target_id,
                emoji=payload.emoji,
            )
        )
        toggled_on = True
    else:
        await db.delete(existing)
        toggled_on = False
    await db.commit()

    # ── AND TELL THE RIDER WHOSE RIDE IT IS ──────────────────────────────
    # Only on the way ON, and only for a ride. A toggle that pushed on both
    # edges would let one bored thumb ring somebody's phone all evening, and
    # "somebody took their 🔥 back" is not news. The other target types —
    # messages, events, the weekly crew cheer — are not somebody's ride and
    # have no single owner to tell.
    if toggled_on and payload.target_type == "ride" and target_id is not None:
        ride = (
            await db.execute(
                select(Activity)
                .join(CrewMembership, CrewMembership.user_id == Activity.user_id)
                .where(Activity.id == target_id, CrewMembership.crew_id == mem.crew_id)
            )
        ).scalars().first()
        if ride is not None:
            await notify_ride_reaction(
                db, actor=current_user, activity=ride, emoji=payload.emoji
            )

    summ = await reaction_summary(
        db,
        crew_id=mem.crew_id,
        user_id=current_user.id,
        target_type=payload.target_type,
        target_id=target_id,
    )
    return ReactionSummaryRead(
        target_type=payload.target_type,
        target_id=target_id,
        counts=summ["counts"],
        mine=summ["mine"],
        toggled_on=toggled_on,
    )


@router.get("", response_model=ReactionSummaryRead)
async def get_reactions(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    target_type: str,
    target_id: int | None = None,
) -> ReactionSummaryRead:
    """Reaction summary for one target: per-emoji counts + the caller's own
    emojis. Used for the crew-week cheer and event/ride reactions (chat-message
    reactions are embedded in GET /crews/me/chat). 403 if not in a crew."""
    if target_type not in TARGET_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"target_type must be one of {list(TARGET_TYPES)}",
        )
    mem = await require_membership(db, current_user.id)
    tid = _normalize_target_id(target_type, target_id)

    summ = await reaction_summary(
        db,
        crew_id=mem.crew_id,
        user_id=current_user.id,
        target_type=target_type,
        target_id=tid,
    )
    return ReactionSummaryRead(
        target_type=target_type,
        target_id=tid,
        counts=summ["counts"],
        mine=summ["mine"],
    )
