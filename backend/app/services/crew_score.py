"""Crew standings — server-side port of the Squad Cup math.

Per the spec (docs/superpowers/specs/2026-05-13-crew-backend-design.md):
each day a rider earns `min(1.5, daily_TSS / daily_target) × 100` points,
capped at 150. Weekly score sums seven daily points (max ~1050). Days are
boundaried in the athlete's local timezone.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.crew import CrewMembership
from app.models.user import User

DAILY_TARGET_DEFAULT = 70   # TSS/day baseline when weekly_hours is unset
DAILY_CAP = 1.5             # one huge day can't carry the whole week
WEEK_LEN = 7


def _handle_from_email(email: str) -> str:
    local = (email or "").split("@", 1)[0]
    if not local:
        return "rider"
    return local.replace(".", " ").replace("_", " ").replace("-", " ").title()


def display_handle(user) -> str:
    """A user's shown name: their real display_name if set, else email-derived."""
    name = getattr(user, "display_name", None)
    if name and name.strip():
        return name.strip()
    return _handle_from_email(getattr(user, "email", "") or "")


def _daily_target_tss(weekly_hours: float | None) -> int:
    if weekly_hours is None or weekly_hours <= 0:
        return DAILY_TARGET_DEFAULT
    return max(30, round((weekly_hours * 70) / 7))


def _local_day(at_utc: datetime, tz: ZoneInfo) -> date:
    if at_utc.tzinfo is None:
        at_utc = at_utc.replace(tzinfo=timezone.utc)
    return at_utc.astimezone(tz).date()


async def _crew_member_user_ids(db: AsyncSession, crew_id: int) -> list[int]:
    stmt = (
        select(CrewMembership.user_id)
        .where(CrewMembership.crew_id == crew_id)
        .order_by(CrewMembership.joined_at.asc())
    )
    rows = await db.execute(stmt)
    return [r[0] for r in rows.all()]


async def _user_context(
    db: AsyncSession, user_id: int
) -> tuple[User | None, AthleteProfile | None]:
    user_row = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    profile_row = (
        await db.execute(select(AthleteProfile).where(AthleteProfile.user_id == user_id))
    ).scalar_one_or_none()
    return user_row, profile_row


async def _activities_for_user_in_window(
    db: AsyncSession, user_id: int, window_start_utc: datetime, window_end_utc: datetime
) -> list[Activity]:
    stmt = (
        select(Activity)
        .where(
            Activity.user_id == user_id,
            Activity.started_at >= window_start_utc,
            Activity.started_at <= window_end_utc,
        )
    )
    rows = await db.execute(stmt)
    return list(rows.scalars().all())


def _week_dates(week_start: date) -> list[date]:
    return [week_start + timedelta(days=i) for i in range(WEEK_LEN)]


def _window_dates(start_on: date, end_on: date) -> list[date]:
    """Inclusive list of local days over [start_on, end_on]."""
    if end_on < start_on:
        return []
    span = (end_on - start_on).days + 1
    return [start_on + timedelta(days=i) for i in range(span)]


def _downsample_points(points: list[int], max_buckets: int = 14) -> list[int]:
    """Collapse a per-day points series into ≤ max_buckets contiguous buckets,
    each the SUM of its days, so a row's mini-strip stays bounded regardless of
    window length. Short windows (day=1, week=7) pass through untouched; a month
    (~30 days) collapses to ~weekly buckets (4-5); a year (~365 days) to 12
    monthly-ish buckets."""
    n = len(points)
    if n <= max_buckets:
        return list(points)
    if n <= 62:
        buckets = (n + 6) // 7        # ~weekly grouping → month ≈ 4-5 buckets
    else:
        buckets = 12                  # year → 12 monthly-ish buckets
    buckets = max(1, min(max_buckets, buckets))
    out: list[int] = []
    for i in range(buckets):
        lo = i * n // buckets
        hi = (i + 1) * n // buckets
        out.append(sum(points[lo:hi]))
    return out


def _activity_kj(a: Activity) -> float:
    """Best-available work estimate in kJ. avg power × time is truest; fall back
    to NP (×0.9 to approximate avg) then to calories (kcal → kJ)."""
    dur = float(a.duration_seconds or 0.0)
    if a.average_power and dur:
        return a.average_power * dur / 1000.0
    if a.normalized_power and dur:
        return a.normalized_power * 0.9 * dur / 1000.0
    if a.calories:
        return float(a.calories) * 4.184
    return 0.0


async def weekly_rich_stats(
    db: AsyncSession, uid: int, week_start: date
) -> dict:
    """Rich head-to-head stats for one athlete for the week starting `week_start`,
    boundaried in their local tz. Only training outputs — never body data."""
    user, profile = await _user_context(db, uid)
    tz_name = (profile.timezone if profile else None) or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
    week_days = _week_dates(week_start)
    day_set = set(week_days)

    window_start_utc = datetime.combine(week_start - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    window_end_utc = datetime.combine(week_start + timedelta(days=WEEK_LEN), datetime.min.time(), tzinfo=timezone.utc)
    acts = await _activities_for_user_in_window(db, uid, window_start_utc, window_end_utc)

    ftp = getattr(profile, "ftp_watts", None) if profile else None
    per_day: dict[date, float] = {d: 0.0 for d in week_days}
    tss = km = hours = kj = 0.0
    rides = 0
    best_tss = 0.0
    active: set[date] = set()
    if_sum = 0.0
    if_n = 0
    for a in acts:
        d = _local_day(a.started_at, tz)
        if d not in day_set:
            continue
        rides += 1
        active.add(d)
        t = float(a.tss or 0.0)
        tss += t
        per_day[d] += t
        best_tss = max(best_tss, t)
        km += float(a.distance_meters or 0.0) / 1000.0
        hours += float(a.duration_seconds or 0.0) / 3600.0
        kj += _activity_kj(a)
        # Intensity factor = NP / FTP — the crew-fair intensity metric.
        if a.normalized_power and ftp and ftp > 0:
            if_sum += float(a.normalized_power) / float(ftp)
            if_n += 1

    daily_target = _daily_target_tss(getattr(profile, "weekly_hours_available", None) if profile else None)
    ring_score = 0
    for d in week_days:
        ratio = (per_day[d] / daily_target) if daily_target > 0 else 0.0
        ring_score += int(round(min(DAILY_CAP, ratio) * 100))

    return {
        "handle": display_handle(user) if user else "rider",
        "tss": int(round(tss)),
        "distance_km": round(km, 1),
        "hours": round(hours, 1),
        "kj": int(round(kj)),
        "rides": rides,
        "active_days": len(active),
        "best_tss": int(round(best_tss)),
        "ring_score": ring_score,
        "avg_if": round(if_sum / if_n, 2) if if_n else 0.0,
    }


CHALLENGE_METRICS = ("tss", "distance_km", "active_days", "hours", "kj", "rides")


async def challenge_value_for_user(
    db: AsyncSession, uid: int, start_on: date, end_on: date, metric: str
) -> float:
    """One athlete's cumulative `metric` over the inclusive local-day window
    [start_on, end_on]. Units match `weekly_rich_stats`: tss (rounded int),
    distance_km (1dp), hours (1dp), kj (rounded int), rides (count), active_days
    (distinct active local days). Days are boundaried in the athlete's local tz.
    """
    _, profile = await _user_context(db, uid)
    tz_name = (profile.timezone if profile else None) or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")

    # Wide UTC window (±1 day) covers any tz offset; slice into local days.
    window_start_utc = datetime.combine(
        start_on - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )
    window_end_utc = datetime.combine(
        end_on + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )
    acts = await _activities_for_user_in_window(db, uid, window_start_utc, window_end_utc)

    tss = km = hours = kj = 0.0
    rides = 0
    active: set[date] = set()
    for a in acts:
        d = _local_day(a.started_at, tz)
        if d < start_on or d > end_on:
            continue
        rides += 1
        active.add(d)
        tss += float(a.tss or 0.0)
        km += float(a.distance_meters or 0.0) / 1000.0
        hours += float(a.duration_seconds or 0.0) / 3600.0
        kj += _activity_kj(a)

    if metric == "tss":
        return float(round(tss))
    if metric == "distance_km":
        return round(km, 1)
    if metric == "hours":
        return round(hours, 1)
    if metric == "kj":
        return float(round(kj))
    if metric == "rides":
        return float(rides)
    if metric == "active_days":
        return float(len(active))
    return 0.0


async def crew_duel(
    db: AsyncSession, caller_user_id: int, crew_id: int | None, week_start: date
) -> dict:
    """You-this-week + you-last-week (always) and each crew-mate's this-week rich
    stats (when in a crew). Single source of truth so the Past-You and Crew duels
    never disagree with each other."""
    you_this = await weekly_rich_stats(db, caller_user_id, week_start)
    you_last = await weekly_rich_stats(db, caller_user_id, week_start - timedelta(days=WEEK_LEN))
    crew: list[dict] = []
    if crew_id is not None:
        for uid in await _crew_member_user_ids(db, crew_id):
            if uid == caller_user_id:
                continue
            s = await weekly_rich_stats(db, uid, week_start)
            crew.append({"user_id": uid, **s})
    return {
        "week_start": week_start.isoformat(),
        "week_end": (week_start + timedelta(days=6)).isoformat(),
        "you_this_week": you_this,
        "you_last_week": you_last,
        "crew": crew,
    }


async def crew_standings_window(
    db: AsyncSession,
    crew_id: int,
    start_on: date,             # first local day of the window (inclusive)
    end_on: date,               # last local day of the window (inclusive)
    caller_user_id: int,
) -> dict:
    """Compute the standings for `crew_id` over the inclusive local-day window
    [start_on, end_on]. Same scoring math as the weekly cup — each day a rider
    earns min(DAILY_CAP, dayTSS/daily_target)×100 points — just summed over an
    arbitrary number of days. The `daily_pct` mini-strip is downsampled to
    ≤14 summed buckets so it stays bounded on long windows.

    Returns the shape that maps to `StandingsResponse` in the schema module;
    week_start/week_end (and period_start/period_end) are the window bounds.
    """
    if end_on < start_on:
        end_on = start_on

    caller_target = DAILY_TARGET_DEFAULT
    user_ids = await _crew_member_user_ids(db, crew_id)
    if not user_ids:
        return {
            "crew_id": crew_id,
            "week_start": start_on.isoformat(),
            "week_end": end_on.isoformat(),
            "period_start": start_on.isoformat(),
            "period_end": end_on.isoformat(),
            "daily_target_tss": caller_target,
            "standings": [],
        }

    # Wide UTC window (±1 day) covers any participant tz. Slice into local days
    # per-athlete below.
    window_start_utc = datetime.combine(
        start_on - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )
    window_end_utc = datetime.combine(
        end_on + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )

    window_days = _window_dates(start_on, end_on)
    standings: list[dict] = []

    for uid in user_ids:
        user, profile = await _user_context(db, uid)
        if user is None:
            continue
        tz_name = (profile.timezone if profile else None) or "UTC"
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("UTC")

        # Per-day TSS bucket over the window.
        per_day = {d: 0.0 for d in window_days}
        acts = await _activities_for_user_in_window(
            db, uid, window_start_utc, window_end_utc
        )
        for a in acts:
            d = _local_day(a.started_at, tz)
            if d in per_day:
                per_day[d] += float(a.tss or 0.0)

        weekly_hours = (
            getattr(profile, "weekly_hours_available", None) if profile else None
        )
        daily_target = _daily_target_tss(weekly_hours)

        day_points: list[int] = []
        score = 0
        total_tss = 0
        for d in window_days:
            tss = per_day[d]
            total_tss += int(round(tss))
            # cap at DAILY_CAP * 100 = 150 points
            ratio = (tss / daily_target) if daily_target > 0 else 0.0
            pts = int(round(min(DAILY_CAP, ratio) * 100))
            day_points.append(pts)
            score += pts

        standings.append(
            {
                "user_id": uid,
                "handle": display_handle(user),
                "is_you": uid == caller_user_id,
                # Response keeps the weekly_* field names for back-compat;
                # they now carry the whole-window totals.
                "weekly_score": score,
                "weekly_tss": total_tss,
                "daily_pct": _downsample_points(day_points),
            }
        )

    standings.sort(key=lambda r: r["weekly_score"], reverse=True)

    # Headline daily_target_tss is the caller's own bar — the standings rows
    # already encode each athlete's own target inside daily_pct.
    if caller_user_id in user_ids:
        _, caller_profile = await _user_context(db, caller_user_id)
        caller_target = _daily_target_tss(
            getattr(caller_profile, "weekly_hours_available", None) if caller_profile else None
        )

    return {
        "crew_id": crew_id,
        "week_start": start_on.isoformat(),
        "week_end": end_on.isoformat(),
        "period_start": start_on.isoformat(),
        "period_end": end_on.isoformat(),
        "daily_target_tss": caller_target,
        "standings": standings,
    }


async def crew_standings(
    db: AsyncSession,
    crew_id: int,
    week_start: date,            # Monday in any of the athletes' tz; we treat
                                 # this as the canonical "week-start" calendar
                                 # date that all members share for the cup.
    caller_user_id: int,
) -> dict:
    """Weekly Squad Cup standings — thin wrapper over `crew_standings_window`
    for the Mon..Sun week starting `week_start`."""
    return await crew_standings_window(
        db, crew_id, week_start, week_start + timedelta(days=6), caller_user_id
    )
