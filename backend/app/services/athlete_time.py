"""Athlete-local time — the single source of truth for "what day is it?".

All "today" / "this week" windows anywhere in the backend must be computed in
the athlete's local timezone, then converted to UTC for DB queries against
`Activity.started_at` (stored in UTC). Without this, an athlete in Berlin
riding at 22:00 local sees their activity attributed to the *next* UTC day —
the coach prescribes a second session on top of the one they just finished,
and yesterday's 10:21 workout renders as "done today".

The active athlete tz lives in a ContextVar so every helper reads the same
value without threading a `tz` argument through every call.
`set_athlete_tz_from_profile` must be invoked once per request after the
profile is loaded (coach_service.build_snapshot does this; API endpoints that
compute dates outside a snapshot must call it themselves). The default keeps
the single-user MVP working when called outside a request context (tests,
scheduler tasks).

Extracted from coach_service so that weeks, streaks, PMC bucketing, session
grading and plan-deviation detection stop shipping their own — previously
divergent — notions of "today" (usability audit P0-2, July 2026).
"""

from __future__ import annotations

from contextvars import ContextVar
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

if TYPE_CHECKING:  # pragma: no cover
    from app.models.athlete_profile import AthleteProfile

DEFAULT_ATHLETE_TZ = ZoneInfo("Europe/Berlin")

_athlete_tz_var: ContextVar[ZoneInfo] = ContextVar(
    "athlete_tz", default=DEFAULT_ATHLETE_TZ
)


def athlete_tz() -> ZoneInfo:
    """Return the current request's athlete tz, falling back to Europe/Berlin."""
    return _athlete_tz_var.get()


def set_athlete_tz_from_profile(profile: "AthleteProfile | None") -> None:
    """Resolve the athlete tz from a loaded AthleteProfile and bind it to the
    current async context. Bad/empty values silently fall back to the default
    so a typo in the column never blocks brief generation.
    """
    if profile is None:
        _athlete_tz_var.set(DEFAULT_ATHLETE_TZ)
        return
    raw = getattr(profile, "timezone", None)
    if not raw:
        _athlete_tz_var.set(DEFAULT_ATHLETE_TZ)
        return
    try:
        _athlete_tz_var.set(ZoneInfo(raw))
    except Exception:
        _athlete_tz_var.set(DEFAULT_ATHLETE_TZ)


def today_local(now_utc: datetime | None = None) -> date:
    """Return today's date in the athlete's local timezone."""
    now = (now_utc or datetime.now(timezone.utc)).astimezone(athlete_tz())
    return now.date()


def local_date_of(dt: datetime) -> date:
    """Athlete-local calendar date of a stored timestamp.

    Naive datetimes are treated as UTC (the storage convention for
    `Activity.started_at`).
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(athlete_tz()).date()


def today_local_window(now_utc: datetime | None = None) -> tuple[datetime, datetime]:
    """Athlete-local today 00:00 → tomorrow 00:00, returned as UTC datetimes."""
    tz = athlete_tz()
    today = today_local(now_utc)
    start_local = datetime.combine(today, datetime.min.time(), tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def start_of_today_utc(now_utc: datetime | None = None) -> datetime:
    """Start of the athlete-local current day, as a UTC datetime.

    The freshness gate for anything cached "for today" (e.g. coach briefs):
    rows created before this instant belong to a previous athlete-local day.
    """
    return today_local_window(now_utc)[0]


def week_local_window(now_utc: datetime | None = None) -> tuple[datetime, datetime]:
    """Monday 00:00 → next Monday 00:00 in athlete-local, returned as UTC datetimes."""
    tz = athlete_tz()
    today = today_local(now_utc)
    monday_local = today - timedelta(days=today.weekday())
    start_local = datetime.combine(monday_local, datetime.min.time(), tzinfo=tz)
    end_local = start_local + timedelta(days=7)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def day_local_window(day: date) -> tuple[datetime, datetime]:
    """Athlete-local [day 00:00, day+1 00:00) as UTC datetimes."""
    tz = athlete_tz()
    start_local = datetime.combine(day, datetime.min.time(), tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)
