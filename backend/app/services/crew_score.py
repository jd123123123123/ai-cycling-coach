"""Crew standings — server-side port of the Squad Cup math.

Each day a rider earns `min(1.5, daily_TSS / daily_target) × 100` points,
capped at 150. Weekly score sums seven daily points (max ~1050). Days are
boundaried in the athlete's local timezone.

Scaled-to-the-athlete targets (2026-07 usability audit, P1-10): the daily
target is each rider's OWN bar — their 4-week average weekly TSS × 1.05,
divided by 7 — never a fixed wall. No history → a sane 60-TSS weekly floor,
so a new rider's first spin already scores instead of reading "0% failed".
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.crew import CrewMembership
from app.models.daily_metric import DailyMetric
from app.models.user import User

DAILY_CAP = 1.5             # one huge day can't carry the whole week
WEEK_LEN = 7

# ── Personal targets (P1-10: competition scaled to the athlete) ──────────
WEEKLY_TARGET_FLOOR = 60      # sane weekly TSS bar when the athlete has no history
WEEKLY_TARGET_MARGIN = 1.05   # own 4-week average × 1.05 — a nudge, not a wall
TARGET_HISTORY_WEEKS = 4      # how much history the personal bar is built from
ACTIVE_DAYS_TARGET_MIN = 3    # active-days default is 3-4 …
ACTIVE_DAYS_TARGET_MAX = 6    # … and NEVER 7 — rest days are part of the plan

# Membership role value meaning "opted into pre-existing crew challenges".
# Lives in the existing crew_memberships.role column (String(10)) so no
# migration is needed; everything except "owner" reads as "member" in the UI.
CHALLENGE_OPT_IN_ROLE = "challenger"


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


def _local_day(at_utc: datetime, tz: ZoneInfo) -> date:
    if at_utc.tzinfo is None:
        at_utc = at_utc.replace(tzinfo=timezone.utc)
    return at_utc.astimezone(tz).date()


def _resolve_tz(profile: AthleteProfile | None) -> ZoneInfo:
    tz_name = (profile.timezone if profile else None) or "UTC"
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("UTC")


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


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


async def personal_week_targets(
    db: AsyncSession, uid: int, ref_monday: date
) -> dict:
    """The athlete's OWN weekly bars, computed from their history — never a
    fixed 800-TSS wall or a 7-days-a-week demand.

    History window = the ``TARGET_HISTORY_WEEKS`` (4) full weeks strictly
    before ``ref_monday``, boundaried in the athlete's local tz.

    Returns:
        weekly_target_tss   — 4-week avg weekly TSS × 1.05, floor 60
        active_days_target  — 4-week avg active days/week, clamped 3..6 (never 7);
                              3 when there is no history
        daily_target_tss    — weekly_target_tss / 7 (scoring denominator)
        has_history         — False when the window holds no activities
    """
    _, profile = await _user_context(db, uid)
    tz = _resolve_tz(profile)

    hist_start = ref_monday - timedelta(days=TARGET_HISTORY_WEEKS * WEEK_LEN)
    hist_end = ref_monday - timedelta(days=1)
    window_start_utc = datetime.combine(
        hist_start - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )
    window_end_utc = datetime.combine(
        hist_end + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )
    acts = await _activities_for_user_in_window(db, uid, window_start_utc, window_end_utc)

    total_tss = 0.0
    active: set[date] = set()
    for a in acts:
        d = _local_day(a.started_at, tz)
        if d < hist_start or d > hist_end:
            continue
        total_tss += float(a.tss or 0.0)
        active.add(d)

    avg_weekly = total_tss / TARGET_HISTORY_WEEKS
    weekly_target = max(WEEKLY_TARGET_FLOOR, int(round(avg_weekly * WEEKLY_TARGET_MARGIN)))

    if active:
        avg_days = len(active) / TARGET_HISTORY_WEEKS
        days_target = min(
            ACTIVE_DAYS_TARGET_MAX, max(ACTIVE_DAYS_TARGET_MIN, int(round(avg_days)))
        )
    else:
        days_target = ACTIVE_DAYS_TARGET_MIN

    return {
        "weekly_target_tss": weekly_target,
        "active_days_target": days_target,
        "daily_target_tss": max(1, int(round(weekly_target / WEEK_LEN))),
        "has_history": bool(active),
    }


async def tss_at_same_point_last_week(
    db: AsyncSession, uid: int, week_start: date, now_utc: datetime | None = None
) -> int:
    """Last week's TSS accumulated up to the same weekday + time-of-day.

    The honest early-week pace basis: on Monday morning this is ~0 too, so the
    UI can say "on pace vs last week" instead of rendering a guaranteed-loss
    0 : 60 scoreboard against the full last-week total.
    """
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)
    elif now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    _, profile = await _user_context(db, uid)
    tz = _resolve_tz(profile)

    last_start = week_start - timedelta(days=WEEK_LEN)
    last_days = set(_week_dates(last_start))
    window_start_utc = datetime.combine(
        last_start - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )
    window_end_utc = datetime.combine(
        last_start + timedelta(days=WEEK_LEN), datetime.min.time(), tzinfo=timezone.utc
    )
    acts = await _activities_for_user_in_window(db, uid, window_start_utc, window_end_utc)

    cutoff = now_utc - timedelta(days=WEEK_LEN)
    total = 0.0
    for a in acts:
        started = a.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if started > cutoff:
            continue
        if _local_day(a.started_at, tz) not in last_days:
            continue
        total += float(a.tss or 0.0)
    return int(round(total))


def member_in_challenge(
    *,
    member_user_id: int,
    role: str | None,
    joined_at: datetime | None,
    creator_user_id: int,
    challenge_created_at: datetime | None,
) -> bool:
    """Whether a crew member participates in a challenge (P1-10: no auto-entry).

    A member is IN when any of:
      - they created the challenge;
      - they explicitly opted in (role == CHALLENGE_OPT_IN_ROLE, set when they
        accept a crew invite with join_challenges=true);
      - they were already in the crew when the challenge was created
        (joined_at <= challenge.created_at).

    Friends added AFTER a challenge exists are therefore never silently
    entered into a scoreboard they didn't ask for.
    """
    if member_user_id == creator_user_id:
        return True
    if (role or "") == CHALLENGE_OPT_IN_ROLE:
        return True
    if joined_at is None or challenge_created_at is None:
        # Defensive: both columns are server-defaulted NOT NULL; if data is
        # somehow missing, keep the legacy (inclusive) behaviour.
        return True
    j = joined_at if joined_at.tzinfo else joined_at.replace(tzinfo=timezone.utc)
    c = (
        challenge_created_at
        if challenge_created_at.tzinfo
        else challenge_created_at.replace(tzinfo=timezone.utc)
    )
    return j <= c


async def weekly_rich_stats(
    db: AsyncSession, uid: int, week_start: date
) -> dict:
    """Rich head-to-head stats for one athlete for the week starting `week_start`,
    boundaried in their local tz. Only training outputs — never body data."""
    user, profile = await _user_context(db, uid)
    tz = _resolve_tz(profile)
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

    # Personal bar: this rider's own 4-week history, never a fixed wall.
    targets = await personal_week_targets(db, uid, week_start)
    daily_target = targets["daily_target_tss"]
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
        # This rider's own bars — so the UI can label shares honestly.
        "weekly_target_tss": targets["weekly_target_tss"],
        "active_days_target": targets["active_days_target"],
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
    tz = _resolve_tz(profile)

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


async def challenge_series_for_user(
    db: AsyncSession, uid: int, start_on: date, end_on: date, metric: str
) -> list[float]:
    """The SAME metric as `challenge_value_for_user`, split per local day.

    WHY THE TOTAL IS NOT THE SUM OF THIS. `challenge_value_for_user` rounds
    once, at the end; rounding each day and adding them up drifts. So the two
    are computed separately and only one of them is the number a rider is
    judged on — this one exists to show WHICH DAYS moved it, never to restate
    how far along they are.

    Returns one entry per day in [start_on, end_on], oldest first, in the
    athlete's own timezone. `active_days` comes back as 1.0 or 0.0, which is
    what that metric means on a single day.
    """
    _, profile = await _user_context(db, uid)
    tz = _resolve_tz(profile)

    window_start_utc = datetime.combine(
        start_on - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )
    window_end_utc = datetime.combine(
        end_on + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )
    acts = await _activities_for_user_in_window(db, uid, window_start_utc, window_end_utc)

    days = _window_dates(start_on, end_on)
    per_day: dict[date, float] = {d: 0.0 for d in days}
    for a in acts:
        d = _local_day(a.started_at, tz)
        if d not in per_day:
            continue
        if metric == "tss":
            per_day[d] += float(a.tss or 0.0)
        elif metric == "distance_km":
            per_day[d] += float(a.distance_meters or 0.0) / 1000.0
        elif metric == "hours":
            per_day[d] += float(a.duration_seconds or 0.0) / 3600.0
        elif metric == "kj":
            per_day[d] += _activity_kj(a)
        elif metric == "rides":
            per_day[d] += 1.0
        elif metric == "active_days":
            per_day[d] = 1.0

    return [per_day[d] for d in days]


async def crew_duel(
    db: AsyncSession,
    caller_user_id: int,
    crew_id: int | None,
    week_start: date,
    now_utc: datetime | None = None,
) -> dict:
    """You-this-week + you-last-week (always) and each crew-mate's this-week rich
    stats (when in a crew). Single source of truth so the Past-You and Crew duels
    never disagree with each other.

    `last_week_at_now` is last week's TSS at the same weekday+time — the pace
    basis, so early in the week the UI compares like-for-like instead of
    rendering a guaranteed Monday defeat against the full last-week total.
    """
    you_this = await weekly_rich_stats(db, caller_user_id, week_start)
    you_last = await weekly_rich_stats(db, caller_user_id, week_start - timedelta(days=WEEK_LEN))
    pace = await tss_at_same_point_last_week(db, caller_user_id, week_start, now_utc)
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
        # Caller's own bars, hoisted for the personal-challenge defaults.
        "weekly_target_tss": you_this["weekly_target_tss"],
        "active_days_target": you_this["active_days_target"],
        "last_week_at_now": pace,
        "crew": crew,
    }


def _wkg_from_profile(profile: AthleteProfile | None) -> float | None:
    """Watts-per-kilo at threshold = ftp_watts / weight_kg. None when either
    input is missing/zero — never fabricated."""
    if profile is None:
        return None
    ftp = getattr(profile, "ftp_watts", None)
    weight = getattr(profile, "weight_kg", None)
    if not ftp or not weight or weight <= 0:
        return None
    return round(float(ftp) / float(weight), 2)


def _extract_vo2max(raw) -> float | None:
    """Pull the Garmin VO2max estimate out of a daily_metric raw_data blob.
    Mirrors app/api/daily_metrics.py: training_status.mostRecentVO2Max.generic
    .vo2MaxValue. Tolerates raw stored as a JSON string."""
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            import json

            raw = json.loads(raw)
        except Exception:
            return None
    if not isinstance(raw, dict):
        return None
    ts = raw.get("training_status") or {}
    val = (((ts.get("mostRecentVO2Max") or {}).get("generic")) or {}).get("vo2MaxValue")
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


async def _latest_vo2max_for_user(
    db: AsyncSession, uid: int, end_on: date
) -> float | None:
    """The member's most recent VO2max on/before `end_on` (window end). Scans
    daily_metric rows newest-first and returns the first that carries a value;
    None when the athlete has no VO2max data at all. Honest — never invented."""
    stmt = (
        select(DailyMetric.raw_data)
        .where(
            DailyMetric.user_id == uid,
            DailyMetric.date <= end_on,
        )
        .order_by(DailyMetric.date.desc(), DailyMetric.recorded_at.desc())
        .limit(60)
    )
    rows = await db.execute(stmt)
    for (raw,) in rows.all():
        vo2 = _extract_vo2max(raw)
        if vo2 is not None:
            return round(vo2, 1)
    return None


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

    P1-10: daily_target is each rider's OWN bar (their 4-week avg weekly TSS
    × 1.05, / 7) — points are the share of your own target, so a 4h/week rider
    and a 12h/week rider compete on effort-vs-self, not raw volume.

    Returns the shape that maps to `StandingsResponse` in the schema module;
    week_start/week_end (and period_start/period_end) are the window bounds.
    """
    if end_on < start_on:
        end_on = start_on

    ref_monday = _monday_of(start_on)
    user_ids = await _crew_member_user_ids(db, crew_id)
    if not user_ids:
        caller_targets = await personal_week_targets(db, caller_user_id, ref_monday)
        return {
            "crew_id": crew_id,
            "week_start": start_on.isoformat(),
            "week_end": end_on.isoformat(),
            "period_start": start_on.isoformat(),
            "period_end": end_on.isoformat(),
            "daily_target_tss": caller_targets["daily_target_tss"],
            "weekly_target_tss": caller_targets["weekly_target_tss"],
            "points_basis": "own_weekly_target",
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

    caller_daily_target: int | None = None
    caller_weekly_target: int | None = None

    for uid in user_ids:
        user, profile = await _user_context(db, uid)
        if user is None:
            continue
        tz = _resolve_tz(profile)

        # Per-day TSS bucket over the window + cumulative distance.
        per_day = {d: 0.0 for d in window_days}
        distance_km = 0.0
        acts = await _activities_for_user_in_window(
            db, uid, window_start_utc, window_end_utc
        )
        for a in acts:
            d = _local_day(a.started_at, tz)
            if d in per_day:
                per_day[d] += float(a.tss or 0.0)
                distance_km += float(a.distance_meters or 0.0) / 1000.0

        # This rider's OWN bar — 4-week avg × 1.05, never a shared fixed wall.
        targets = await personal_week_targets(db, uid, ref_monday)
        daily_target = targets["daily_target_tss"]
        if uid == caller_user_id:
            caller_daily_target = daily_target
            caller_weekly_target = targets["weekly_target_tss"]

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

        vo2max = await _latest_vo2max_for_user(db, uid, end_on)

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
                # Per-member real values over the SAME window, for metric
                # re-ranking on the frontend. Null where the source is missing
                # (never fabricated). Elevation + 5K PR have no source → omitted.
                "distance_km": round(distance_km, 1),
                "wkg": _wkg_from_profile(profile),
                "vo2max": vo2max,
                # This rider's own bars — the footnote's honest denominator.
                "weekly_target_tss": targets["weekly_target_tss"],
                "daily_target_tss": daily_target,
            }
        )

    standings.sort(key=lambda r: r["weekly_score"], reverse=True)

    # Headline targets are the caller's own bar — the standings rows carry
    # each rider's own target explicitly.
    if caller_daily_target is None or caller_weekly_target is None:
        caller_targets = await personal_week_targets(db, caller_user_id, ref_monday)
        caller_daily_target = caller_targets["daily_target_tss"]
        caller_weekly_target = caller_targets["weekly_target_tss"]

    return {
        "crew_id": crew_id,
        "week_start": start_on.isoformat(),
        "week_end": end_on.isoformat(),
        "period_start": start_on.isoformat(),
        "period_end": end_on.isoformat(),
        "daily_target_tss": caller_daily_target,
        "weekly_target_tss": caller_weekly_target,
        "points_basis": "own_weekly_target",
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
