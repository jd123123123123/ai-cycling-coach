"""The Fahrten dock's three grains — SAISON / MONAT / WOCHE.

The rides screen gets a grain switch, and whichever grain is selected owns the
whole dock: its own totals in the headline (km, rides, hours, ascent) and its
own bar series underneath. So the payload is three self-contained blocks, not
one window plus three ways of slicing it.

── THE RULE THAT MAKES IT HONEST ──────────────────────────────────────────
A grain's totals ARE the sum of that grain's own buckets. They are not a
second, separately-scanned number that happens to look similar: the headline
and the bars are the same arithmetic, so they cannot drift apart, and a rider
who adds the bars up with their finger gets the number printed above them.

That is also why every grain's bucket span EQUALS its window. A MONAT headline
over the last 30 days beside bars covering a quarter would be two different
periods stacked on one card — the exact disagreement this module exists to
make impossible.

── AND WHY EVERY BUCKET IS PRESENT ────────────────────────────────────────
Bucketing is `achievement_service.tally_by_bucket`, the same helper the Erfolge
rhythm card uses, seeded from the bucket starts. An empty week is a real zero
and gets drawn; a chart that omitted it would draw a season the rider did not
have.

Null-safe throughout: a ride whose device recorded no distance, no moving time
or no ascent still counts as a ride and contributes 0 to those sums.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Callable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.services.achievement_service import (
    RideRow,
    day_bucket_starts,
    month_bucket_starts,
    month_start,
    tally_by_bucket,
    week_bucket_starts,
    week_start,
)

#: The MONAT grain. Thirty days including today, which is what a rider means by
#: "this past month" — not the calendar month, whose first two days would make
#: the screen say the rider had almost stopped.
MONTH_DAYS = 30
#: The WOCHE grain. Seven days including today.
WEEK_DAYS = 7

MONTH_LABEL = "Letzte 30 Tage"
WEEK_LABEL = "Letzte 7 Tage"


def _in_window(rides: Sequence[RideRow], lo: date, hi: date) -> list[RideRow]:
    """The rides this grain is allowed to see, inclusive on both ends.

    Filtering happens BEFORE bucketing rather than being left to the bucket
    starts, because a window can begin mid-bucket: the last 30 days start on
    some Wednesday, whose Monday is a real bucket. Without this, riding from
    the four days before the window would leak into its first bar and the
    headline would no longer be the sum of the bars.
    """
    return [
        r for r in rides
        if r.started_at is not None and lo <= r.started_at.date() <= hi
    ]


def _grain(
    rides: Sequence[RideRow],
    *,
    label: str,
    lo: date,
    hi: date,
    starts: Sequence[date],
    bucket_of: Callable[[date], date],
) -> dict[str, Any]:
    """One grain: its buckets, and its totals as the sum of those buckets."""
    tallied = tally_by_bucket(_in_window(rides, lo, hi), starts, bucket_of)
    buckets = [{
        "start": s.isoformat(),
        "km": round(tallied[s]["metres"] / 1000, 1),
        "rides": int(tallied[s]["rides"]),
        "hours": round(tallied[s]["seconds"] / 3600, 1),
        "elevation_m": int(round(tallied[s]["elevation_m"])),
    } for s in starts]

    # Summed from the buckets, not re-derived from the rides: rounding a total
    # separately can put it a tenth away from its own bars, and a headline that
    # disagrees with the chart under it is the bug this whole module avoids.
    return {
        "label": label,
        "km": round(sum(b["km"] for b in buckets), 1),
        "rides": sum(b["rides"] for b in buckets),
        "hours": round(sum(b["hours"] for b in buckets), 1),
        "elevation_m": sum(b["elevation_m"] for b in buckets),
        "buckets": buckets,
    }


def scan_start(now: datetime) -> date:
    """The earliest day any grain needs — the one date filter for the query."""
    today = now.date()
    return min(date(today.year, 1, 1), today - timedelta(days=MONTH_DAYS - 1))


def build_rhythm(rides: Sequence[RideRow], now: datetime) -> dict[str, Any]:
    """SAISON / MONAT / WOCHE, each one grain finer than the last.

    - **season** — the current calendar year to date, drawn as its twelve
      months. The months after today are present and empty: a year chart that
      stopped at August would read as a season that ended.
    - **month** — the last 30 days, drawn as the ISO weeks (Monday starts)
      those days fall in. The first bar is the tail of its week, because the
      window starts mid-week; it counts only days inside the window.
    - **week** — the last 7 days, drawn as those days. Rest days included:
      on this grain the gaps are the information.
    """
    today = now.date()

    season_lo = date(today.year, 1, 1)
    season_starts = month_bucket_starts(date(today.year, 12, 1), 12)

    month_lo = today - timedelta(days=MONTH_DAYS - 1)
    month_weeks = ((week_start(today) - week_start(month_lo)).days // 7) + 1
    month_starts = week_bucket_starts(today, month_weeks)

    week_lo = today - timedelta(days=WEEK_DAYS - 1)

    return {
        "season": _grain(
            rides, label=str(today.year), lo=season_lo, hi=today,
            starts=season_starts, bucket_of=month_start,
        ),
        "month": _grain(
            rides, label=MONTH_LABEL, lo=month_lo, hi=today,
            starts=month_starts, bucket_of=week_start,
        ),
        "week": _grain(
            rides, label=WEEK_LABEL, lo=week_lo, hi=today,
            starts=day_bucket_starts(today, WEEK_DAYS), bucket_of=lambda d: d,
        ),
    }


async def rhythm_for_user(
    db: AsyncSession, user_id: int, now: datetime
) -> dict[str, Any]:
    """Read the rides the three grains need, then aggregate them in memory.

    ONE query for all three grains — the same read the Erfolge detectors do,
    narrowed to the earliest day any grain can reach. Cycling only: this is the
    Fahrten screen, and the app is a bike app.
    """
    res = await db.execute(
        select(
            Activity.id, Activity.started_at, Activity.distance_meters,
            Activity.duration_seconds, Activity.elevation_gain_m, Activity.title,
        )
        .where(
            Activity.user_id == user_id,
            Activity.sport == "cycling",
            Activity.started_at >= datetime.combine(scan_start(now), datetime.min.time(),
                                                    tzinfo=now.tzinfo),
        )
        .order_by(Activity.started_at.asc())
    )
    rides = [RideRow(r[0], r[1], r[2], r[3], r[4], r[5]) for r in res.all()]
    return build_rhythm(rides, now)
