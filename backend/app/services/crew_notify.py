"""Telling the OTHER rider.

Every push this app has ever sent went to the person it was about: the morning
brief to the rider whose morning it is, the plan-adaptation notice to the rider
whose plan moved. `send_user_push` takes a profile, and at all three existing
call sites that profile is the caller's own. There has never been a path that
says "somebody else did something to your ride" — which is the whole of the
social loop, and the reason a crew feed on a phone still felt like a noticeboard
nobody was standing at.

This is that path, and nothing more: resolve a ride's owner, and push them.

── THE RULES IT ENFORCES ────────────────────────────────────────────────────
· NEVER YOURSELF. Reacting to your own ride, commenting under it: silent. The
  single most obvious way to make a notification system feel broken is for it
  to congratulate you on your own activity.
· NEVER FAILS THE REQUEST. A push is a courtesy; a reaction is data. If web-push
  is unconfigured, the subscription is dead, or the browser vendor's endpoint is
  down, the reaction still stands and the caller still gets a 200. Every failure
  here is logged and swallowed.
· IT NAMES WHAT HAPPENED. The house idiom withholds specifics on a *reward*
  surface — the ride chest stays sealed because opening it is the moment. A
  notification is the opposite: it competes with every other notification on a
  lock screen, and "somebody reacted to a ride" is indistinguishable from spam.
  So it names the rider and the ride.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.services.crew_score import display_handle
from app.services.push_service import push_configured, send_user_push

logger = logging.getLogger(__name__)

# The crew screen is the feed's home — chapter 03 shows every ride with its
# reactions and its thread, so a tap lands on the thing the notification is
# about rather than near it.
CREW_URL = "/e/w3-crew"

# A ride with no title of its own. Kept short: this goes inside quotes in a
# notification body that a phone will truncate.
_UNTITLED = "einer Fahrt"


def _ride_name(activity: Activity) -> str:
    title = (getattr(activity, "title", None) or "").strip()
    return f"„{title}“" if title else _UNTITLED


async def _owner_profile(db: AsyncSession, user_id: int) -> Any | None:
    return (
        await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == user_id)
        )
    ).scalars().first()


async def _notify_owner(
    db: AsyncSession, *, actor: Any, activity: Activity, title: str, body: str
) -> int:
    """Push the ride's owner, unless the owner is the one who acted."""
    if not push_configured():
        return 0
    owner_id = getattr(activity, "user_id", None)
    if owner_id is None or owner_id == getattr(actor, "id", None):
        return 0
    try:
        profile = await _owner_profile(db, owner_id)
        if profile is None:
            return 0
        return await send_user_push(db, profile, title, body, CREW_URL)
    except Exception:  # noqa: BLE001 — a courtesy must never fail the write
        logger.warning(
            "crew push failed (owner %s, actor %s)",
            owner_id, getattr(actor, "id", None), exc_info=True,
        )
        return 0


async def notify_ride_reaction(
    db: AsyncSession, *, actor: Any, activity: Activity, emoji: str
) -> int:
    """Somebody put an emoji on a crew-mate's ride."""
    who = display_handle(actor)
    return await _notify_owner(
        db, actor=actor, activity=activity,
        title=f"{emoji} von {who}",
        body=f"{who} hat auf {_ride_name(activity)} reagiert.",
    )


async def notify_ride_comment(
    db: AsyncSession, *, actor: Any, activity: Activity, text: str
) -> int:
    """Somebody wrote under a crew-mate's ride. The comment itself is the body —
    a notification that hides the message is a notification you have to open the
    app to read, which is the thing it was supposed to save you."""
    who = display_handle(actor)
    said = " ".join((text or "").split())
    if len(said) > 120:
        said = said[:119].rstrip() + "…"
    return await _notify_owner(
        db, actor=actor, activity=activity,
        title=f"{who} zu {_ride_name(activity)}",
        body=said or f"{who} hat einen Kommentar hinterlassen.",
    )
