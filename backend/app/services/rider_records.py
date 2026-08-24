"""The rider's lifetime bests — the handful of numbers a profile is built on.

WHY A SERVICE AND NOT A CLIENT-SIDE SCAN. A record is a LIFETIME fact, and the
client only ever holds a window of activities (`useActivitiesRange`). Computing
"longest ride" from ninety days of data would produce a number that quietly
shrinks as the rider's best ride ages out of the window — a personal record that
gets worse over time is the one thing a record must never do.

WHAT COUNTS AS A RECORD HERE. Only figures the activity engine measures
directly: distance, climbing, time in the saddle, training load. Deliberately
NOT power records — `effort_matching` already owns those, keyed by duration,
and a second answer to "your best watts" computed a different way is how two
screens end up disagreeing about the same rider.

EVERY RECORD CARRIES THE RIDE IT CAME FROM, because "212 km" is a number and
"212 km, Harzrunde, 4. Mai" is a memory. A profile made of numbers with no
rides behind them is a scoreboard; the rides are what make it worth opening.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity


@dataclass(frozen=True)
class Record:
    key: str
    value: float
    unit: str
    activity_id: int | None
    title: str | None
    at: datetime | None


#: (key, column, unit, minimum worth calling a record). The floor keeps a
#: rider's first ten-minute test ride from being enshrined as their "longest".
_FIELDS: tuple[tuple[str, str, str, float], ...] = (
    ("longest_ride_km", "distance_meters", "km", 5_000),
    ("highest_climb_m", "elevation_gain_m", "m", 100),
    ("longest_time_s", "duration_seconds", "s", 900),
    ("hardest_ride_tss", "tss", "TSS", 40),
)


async def lifetime(db: AsyncSession, user_id: int) -> dict:
    """Every lifetime best this rider has, keyed by record.

    One query per record rather than one scan in Python: each is an ORDER BY on
    an indexed column with LIMIT 1, which the database answers from the index
    while a full scan would pull every activity this rider has ever logged into
    memory to look at one field.
    """
    out: dict[str, dict | None] = {}
    for key, column, unit, floor in _FIELDS:
        col = getattr(Activity, column)
        row = (await db.execute(
            select(Activity)
            .where(
                Activity.user_id == user_id,
                Activity.sport == "cycling",
                col.is_not(None),
                col >= floor,
            )
            .order_by(col.desc())
            .limit(1)
        )).scalar_one_or_none()
        if row is None:
            out[key] = None
            continue
        raw = float(getattr(row, column) or 0)
        value = raw / 1000 if unit == "km" else raw
        out[key] = asdict(Record(
            key=key,
            value=round(value, 1),
            unit=unit,
            activity_id=row.id,
            title=row.title,
            at=row.started_at,
        ))
    return out
