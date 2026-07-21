"""Web-push — the morning-brief ritual delivery vehicle (roadmap P1.5).

Bevel's 8-opens-a-day habit is manufactured by proactive check-ins; we had an
excellent Today page and nothing that summons the athlete to it. This service
sends ONE morning push per athlete per day — readiness + a single line +
a deep link straight to Today. Rest-day aware (a rest-day push says rest,
gently); never pushes twice a day; every push deep-links to the exact surface
it describes (Bevel's dead-link notifications are a repeated review gripe).

Subscriptions live in AthleteProfile.goals["push"] (JSONB v0, no migration —
same pattern as athlete_status):
    {"subs": [subscription-json...], "last_sent": "YYYY-MM-DD", "enabled": true}
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.config import settings
from app.models.athlete_profile import AthleteProfile

logger = logging.getLogger(__name__)

MORNING_HOUR = 7  # send within the athlete's 07:00–07:59 local hour
DEFAULT_TZ = "Europe/Berlin"


def push_configured() -> bool:
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


def _push_state(profile: AthleteProfile) -> dict:
    goals = profile.goals or {}
    state = goals.get("push")
    return state if isinstance(state, dict) else {}


def _save_push_state(profile: AthleteProfile, state: dict) -> None:
    goals = dict(profile.goals or {})
    goals["push"] = state
    profile.goals = goals
    flag_modified(profile, "goals")


async def add_subscription(db: AsyncSession, profile: AthleteProfile, sub: dict) -> int:
    state = _push_state(profile)
    subs = [s for s in state.get("subs", []) if isinstance(s, dict)]
    endpoint = (sub.get("endpoint") or "").strip()
    if endpoint and all(s.get("endpoint") != endpoint for s in subs):
        subs.append(sub)
    state.update({"subs": subs[-5:], "enabled": True})
    _save_push_state(profile, state)
    await db.commit()
    return len(subs)


async def remove_subscriptions(db: AsyncSession, profile: AthleteProfile) -> None:
    state = _push_state(profile)
    state.update({"subs": [], "enabled": False})
    _save_push_state(profile, state)
    await db.commit()


def _send_to_sub(sub: dict, payload: dict) -> bool:
    """Deliver one push. Returns False when the subscription is dead."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info=sub,
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_CLAIMS_EMAIL},
        )
        return True
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            return False  # endpoint gone — prune
        logger.warning("webpush delivery failed (%s): %s", status, exc)
        return True  # transient — keep the subscription


async def send_user_push(
    db: AsyncSession, profile: AthleteProfile, title: str, body: str, url: str
) -> int:
    """Send to all of the athlete's subscriptions; prunes dead ones. Returns
    the number of deliveries attempted on live subscriptions."""
    if not push_configured():
        return 0
    state = _push_state(profile)
    subs = [s for s in state.get("subs", []) if isinstance(s, dict)]
    if not subs or not state.get("enabled"):
        return 0
    payload = {"title": title, "body": body, "url": url}
    alive = [s for s in subs if _send_to_sub(s, payload)]
    if len(alive) != len(subs):
        state["subs"] = alive
        _save_push_state(profile, state)
        await db.commit()
    return len(alive)


# ─── Morning brief job (called hourly by the scheduler) ─────────────────────

async def run_morning_briefs(db: AsyncSession) -> int:
    """Send the morning brief to every athlete whose local time is inside the
    morning hour and who hasn't been pushed today. System-level job (RLS
    bypassed by the scheduler's session). Returns pushes sent."""
    if not push_configured():
        return 0

    profiles = (
        await db.execute(select(AthleteProfile))
    ).scalars().all()

    sent = 0
    today_utc = datetime.now(ZoneInfo("UTC"))
    for profile in profiles:
        state = _push_state(profile)
        if not state.get("enabled") or not state.get("subs"):
            continue
        tz_name = (profile.goals or {}).get("timezone") or DEFAULT_TZ
        try:
            local = today_utc.astimezone(ZoneInfo(tz_name))
        except Exception:  # noqa: BLE001 — bad tz string
            local = today_utc.astimezone(ZoneInfo(DEFAULT_TZ))
        if local.hour != MORNING_HOUR:
            continue
        if state.get("last_sent") == local.date().isoformat():
            continue

        title, body, is_rest = await _morning_copy(db, profile, local.date())
        if is_rest and bool(getattr(profile, "quiet_on_rest_days", True)):
            # "Quiet on rest days" (V3 Settings): rest-day silence beats even
            # the friendly rest brief. Skip without marking last_sent so
            # turning the toggle off the same morning still delivers.
            continue
        n = await send_user_push(db, profile, title, body, "/dashboard?tab=today")
        if n > 0:
            state["last_sent"] = local.date().isoformat()
            _save_push_state(profile, state)
            await db.commit()
            sent += 1
    return sent


async def _morning_copy(
    db: AsyncSession, profile: AthleteProfile, today: date
) -> tuple[str, str, bool]:
    """Rule-based morning line — deterministic, rest-day aware, no LLM cost.

    Returns (title, body, is_rest_day) so the caller can honor the athlete's
    quiet_on_rest_days setting."""
    from app.models.planned_workout import PlannedWorkout
    from app.services.streak import _is_rest_planned  # shared rest semantics

    rows = (
        await db.execute(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == profile.user_id,
                PlannedWorkout.date == today,
            )
        )
    ).scalars().all()

    sessions = [p for p in rows if not _is_rest_planned(p.template_id, p.title)]
    if not rows or not sessions:
        return (
            "Rest day — you've earned it",
            "Nothing to do, brilliantly. Your brief has the details.",
            True,
        )
    first = sessions[0]
    minutes = int(round((first.duration_seconds_target or 0) / 60))
    return (
        "Your morning brief is ready",
        f"Today: {first.title}" + (f" · {minutes} min" if minutes else "") + ". Tap for the why.",
        False,
    )
