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


async def crew_standings(
    db: AsyncSession,
    crew_id: int,
    week_start: date,            # Monday in any of the athletes' tz; we treat
                                 # this as the canonical "week-start" calendar
                                 # date that all members share for the cup.
    caller_user_id: int,
) -> dict:
    """Compute the standings for `crew_id` for the week starting `week_start`.

    Returns the shape that maps to `StandingsResponse` in the schema module.
    """
    user_ids = await _crew_member_user_ids(db, crew_id)
    if not user_ids:
        return {
            "crew_id": crew_id,
            "week_start": week_start.isoformat(),
            "week_end": (week_start + timedelta(days=6)).isoformat(),
            "daily_target_tss": DAILY_TARGET_DEFAULT,
            "standings": [],
        }

    # Wide UTC window covers any participant tz. Slice into local days
    # per-athlete below.
    window_start_utc = datetime.combine(
        week_start - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )
    window_end_utc = datetime.combine(
        week_start + timedelta(days=WEEK_LEN), datetime.min.time(), tzinfo=timezone.utc
    )

    week_days = _week_dates(week_start)
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

        # Per-day TSS bucket
        per_day = {d: 0.0 for d in week_days}
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

        daily_pct: list[int] = []
        weekly_score = 0
        weekly_tss = 0
        for d in week_days:
            tss = per_day[d]
            weekly_tss += int(round(tss))
            # cap at DAILY_CAP * 100 = 150 points
            ratio = (tss / daily_target) if daily_target > 0 else 0.0
            pts = int(round(min(DAILY_CAP, ratio) * 100))
            daily_pct.append(pts)
            weekly_score += pts

        standings.append(
            {
                "user_id": uid,
                "handle": _handle_from_email(user.email or ""),
                "is_you": uid == caller_user_id,
                "weekly_score": weekly_score,
                "weekly_tss": weekly_tss,
                "daily_pct": daily_pct,
            }
        )

    standings.sort(key=lambda r: r["weekly_score"], reverse=True)

    # Headline daily_target_tss is the caller's own bar — the standings rows
    # already encode each athlete's own target inside daily_pct.
    caller_target = DAILY_TARGET_DEFAULT
    if caller_user_id in user_ids:
        _, caller_profile = await _user_context(db, caller_user_id)
        caller_target = _daily_target_tss(
            getattr(caller_profile, "weekly_hours_available", None) if caller_profile else None
        )

    return {
        "crew_id": crew_id,
        "week_start": week_start.isoformat(),
        "week_end": (week_start + timedelta(days=6)).isoformat(),
        "daily_target_tss": caller_target,
        "standings": standings,
    }
