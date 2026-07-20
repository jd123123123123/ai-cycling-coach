"""Forgiving, plan-aware streak (competitive-roadmap P0.2).

Semantics — the streak measures *adherence to the plan*, not activity-every-day
(the guilt mechanic Gentler Streak's reviewers most thank it for killing):

- trained day                        → counts, streak grows
- planned rest day, not trained      → counts (resting on a rest day IS the plan)
- sick / injured / break status day  → pauses (neither counts nor breaks)
- planned session skipped, no status → breaks
- no plan row + not trained          → breaks (legacy activity-presence rule)

Today never breaks the streak — it may simply not be logged yet.

The athlete status lives in AthleteProfile.goals["athlete_status"]
({"state": "sick"|"injured"|"break", "since": "YYYY-MM-DD"}), set via
PUT /athletes/me/status. A status covers every day from `since` through today.
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.planned_workout import PlannedWorkout
from app.services import athlete_time

LOOKBACK_DAYS = 60
PAUSE_STATES = {"sick", "injured", "break"}

# A planned day whose template/title marks it as rest counts as adherence
# when the athlete does not train. (recovery_60 etc. are real spins — skipping
# those breaks the streak; only true rest days are free.)
_REST_TEMPLATE_IDS = {"rest_day"}


def _is_rest_planned(template_id: str | None, title: str | None) -> bool:
    if (template_id or "").lower() in _REST_TEMPLATE_IDS:
        return True
    t = (title or "").lower()
    return "rest day" in t or "ruhetag" in t


async def build_streak(db: AsyncSession, user_id: int, today: date | None = None) -> dict:
    # Bind the athlete tz FIRST so "today" and per-day attribution are
    # athlete-local (usability audit P0-2): a 22:30 Berlin ride belongs to
    # the local day it happened, not the UTC-next day.
    prow = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = prow.scalar_one_or_none()
    athlete_time.set_athlete_tz_from_profile(profile)

    today = today or athlete_time.today_local()
    since = today - timedelta(days=LOOKBACK_DAYS)

    act_rows = await db.execute(
        select(Activity.started_at).where(
            Activity.user_id == user_id,
            # One extra day of slack: an activity late on `since - 1` UTC can
            # still belong to local day `since` after tz conversion.
            Activity.started_at >= since - timedelta(days=1),
        )
    )
    trained = {
        athlete_time.local_date_of(r[0]) for r in act_rows.all() if r[0] is not None
    }

    plan_rows = await db.execute(
        select(PlannedWorkout.date, PlannedWorkout.template_id, PlannedWorkout.title)
        .where(PlannedWorkout.user_id == user_id, PlannedWorkout.date >= since)
    )
    rest_planned: set[date] = set()
    session_planned: set[date] = set()
    for d, template_id, title in plan_rows.all():
        if _is_rest_planned(template_id, title):
            rest_planned.add(d)
        else:
            session_planned.add(d)

    goals = (profile.goals if profile is not None else None) or {}
    status = goals.get("athlete_status") if isinstance(goals, dict) else None
    status_state = (status or {}).get("state")
    status_since: date | None = None
    if status_state in PAUSE_STATES and (status or {}).get("since"):
        try:
            status_since = date.fromisoformat(status["since"])
        except (ValueError, TypeError):
            status_since = None
    if status_state not in PAUSE_STATES:
        status_state = None

    def paused_on(d: date) -> bool:
        return status_since is not None and d >= status_since

    def day_state(d: date) -> str:
        """One of: trained | rest | paused | missed | unplanned."""
        if d in trained:
            return "trained"
        if paused_on(d):
            return "paused"
        if d in rest_planned:
            return "rest"
        if d in session_planned:
            return "missed"
        return "unplanned"

    # Walk back from today. Today never breaks (may be unlogged yet).
    streak = 0
    for i in range(LOOKBACK_DAYS):
        d = today - timedelta(days=i)
        state = day_state(d)
        if state == "trained" or state == "rest":
            streak += 1
        elif state == "paused":
            continue  # pause: neither counts nor breaks
        elif i == 0:
            continue  # today, nothing logged yet — don't break
        else:
            break

    # Current week (Mon→Sun) day states for the UI dots.
    monday = today - timedelta(days=today.weekday())
    week = []
    for i in range(7):
        d = monday + timedelta(days=i)
        if d > today:
            state = "upcoming"
        elif d == today:
            state = "today" if d not in trained else "trained"
        else:
            state = day_state(d)
        week.append({"date": d.isoformat(), "state": state})

    return {
        "streak": streak,
        "paused": paused_on(today),
        "status": (
            {"state": status_state, "since": status_since.isoformat()}
            if status_state and status_since
            else None
        ),
        "week": week,
    }
