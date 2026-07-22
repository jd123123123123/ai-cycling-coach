"""Crew-social helpers — shared by the chat, reactions, and rides endpoints.

Central home for:
  * the allowed reaction emoji set + target-type vocabulary,
  * crew-membership guard (mirrors app/api/crew_events.py),
  * batch reaction-summary building (one query → per-target {counts, mine}).

The summary shape returned everywhere is::

    {"counts": {emoji: n, …}, "mine": [emoji, …]}

so the chat list, the crew-week cheer, and the event/ride reactions all render
identically on the frontend.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crew import CrewMembership
from app.models.crew_social import CrewReaction

# The reaction palette (V3 · Social). Anything outside this set is rejected 422.
ALLOWED_EMOJI: tuple[str, ...] = ("🔥", "💪", "👏", "🚀", "🙌", "⚡")

# What a reaction can point at.
TARGET_TYPES: tuple[str, ...] = ("message", "crew_week", "event", "ride")


def empty_summary() -> dict:
    """The zero-state summary — no reactions, none of them mine."""
    return {"counts": {}, "mine": []}


async def require_membership(db: AsyncSession, user_id: int) -> CrewMembership:
    """The caller must be in a crew for any social operation. 403 otherwise —
    mirrors app/api/crew_events.py._require_membership."""
    mem = (
        await db.execute(
            select(CrewMembership).where(CrewMembership.user_id == user_id)
        )
    ).scalar_one_or_none()
    if mem is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="not in a crew"
        )
    return mem


async def reaction_summaries(
    db: AsyncSession,
    *,
    crew_id: int,
    user_id: int,
    target_type: str,
    target_ids: list[int | None],
) -> dict[int | None, dict]:
    """Build a {target_id → {counts, mine}} map for every requested target in one
    query. `target_ids` may include ``None`` (the 'crew_week' bucket). Targets
    with no reactions come back as an empty summary so callers can index freely.
    """
    result: dict[int | None, dict] = {tid: empty_summary() for tid in target_ids}
    if not target_ids:
        return result

    concrete = [t for t in target_ids if t is not None]
    want_null = any(t is None for t in target_ids)

    conds = []
    if concrete:
        conds.append(CrewReaction.target_id.in_(concrete))
    if want_null:
        conds.append(CrewReaction.target_id.is_(None))
    if not conds:
        return result

    stmt = select(CrewReaction).where(
        and_(
            CrewReaction.crew_id == crew_id,
            CrewReaction.target_type == target_type,
            or_(*conds),
        )
    )
    rows = (await db.execute(stmt)).scalars().all()
    for r in rows:
        key = r.target_id
        if key not in result:
            # A concrete target we didn't ask about (shouldn't happen given the
            # WHERE), skip defensively.
            continue
        summary = result[key]
        summary["counts"][r.emoji] = summary["counts"].get(r.emoji, 0) + 1
        if r.user_id == user_id and r.emoji not in summary["mine"]:
            summary["mine"].append(r.emoji)
    return result


async def reaction_summary(
    db: AsyncSession,
    *,
    crew_id: int,
    user_id: int,
    target_type: str,
    target_id: int | None,
) -> dict:
    """Single-target convenience wrapper over :func:`reaction_summaries`."""
    summaries = await reaction_summaries(
        db,
        crew_id=crew_id,
        user_id=user_id,
        target_type=target_type,
        target_ids=[target_id],
    )
    return summaries[target_id]
