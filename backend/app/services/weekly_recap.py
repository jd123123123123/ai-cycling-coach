"""Weekly recap assembly (roadmap P1.3).

One payload for the Monday-morning story: last completed week (Mon–Sun),
self-referential only — the athlete vs their own history, never a
leaderboard. Every number is real; panels the data can't back are omitted
by the client rather than faked.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.planned_workout import PlannedWorkout
from app.services.breakthrough_detector import detect_breakthroughs
from app.services.pmc_service import compute_user_pmc
from app.services.streak import build_streak


def _week_bounds(anchor: date) -> tuple[date, date]:
    """Last COMPLETED week (Mon..Sun) strictly before `anchor`'s week."""
    this_monday = anchor - timedelta(days=anchor.weekday())
    start = this_monday - timedelta(days=7)
    return start, start + timedelta(days=6)


def _dt(d: date, end: bool = False) -> datetime:
    return datetime.combine(d, time.max if end else time.min, tzinfo=timezone.utc)


async def build_weekly_recap(
    db: AsyncSession, user_id: int, lang: str = "en", anchor: date | None = None
) -> dict[str, Any]:
    anchor = anchor or date.today()
    start, end = _week_bounds(anchor)
    prev_start, prev_end = start - timedelta(days=7), start - timedelta(days=1)

    rows = await db.execute(
        select(Activity).where(
            Activity.user_id == user_id,
            Activity.started_at >= _dt(prev_start),
            Activity.started_at <= _dt(end, end=True),
        )
    )
    acts = list(rows.scalars().all())

    def _bucket(a: Activity) -> str:
        d = a.started_at.date() if a.started_at else None
        if d is None:
            return "other"
        return "week" if d >= start else "prev"

    week = [a for a in acts if _bucket(a) == "week"]
    prev = [a for a in acts if _bucket(a) == "prev"]

    def _totals(items: list[Activity]) -> dict[str, float]:
        return {
            "sessions": len(items),
            "hours": round(sum((a.duration_seconds or 0) for a in items) / 3600, 1),
            "km": round(sum((a.distance_meters or 0) for a in items) / 1000, 1),
            "tss": round(sum((a.tss or 0) for a in items)),
            "active_days": len({a.started_at.date() for a in items if a.started_at}),
        }

    totals = _totals(week)
    prev_totals = _totals(prev)

    # Plan vs actual — planned TSS proxied via templates (same mapping the
    # recovery-eta projection uses); absent plan rows → null, never 0.
    plan_rows = await db.execute(
        select(PlannedWorkout.template_id).where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date >= start,
            PlannedWorkout.date <= end,
        )
    )
    from app.services.workout_templates import TEMPLATES
    planned_tss: float | None = None
    tids = [r[0] for r in plan_rows.all()]
    if tids:
        planned_tss = round(sum(float(TEMPLATES[t].base_tss) for t in tids if t in TEMPLATES))

    # Fitness movement across the week (CTL at week end vs week start).
    pmc = (await compute_user_pmc(db, user_id, days=90)).get("total") or []
    by_date = {p["date"]: p for p in pmc}
    ctl_start = (by_date.get(start) or {}).get("ctl")
    ctl_end = (by_date.get(end) or {}).get("ctl")
    ctl_delta = round(ctl_end - ctl_start, 1) if ctl_start is not None and ctl_end is not None else None

    # Best moment: breakthroughs inside the week, else the biggest ride.
    breakthroughs = await detect_breakthroughs(
        db, user_id, lang=lang, range_start=_dt(start), range_end=_dt(end, end=True)
    )
    best_ride = max(week, key=lambda a: (a.tss or 0), default=None)

    streak = await build_streak(db, user_id)

    return {
        "week_start": start.isoformat(),
        "week_end": end.isoformat(),
        "totals": totals,
        "prev_totals": prev_totals,
        "planned_tss": planned_tss,
        "ctl_delta": ctl_delta,
        "breakthroughs": breakthroughs[:3],
        "best_ride": (
            {
                "activity_id": best_ride.id,
                "title": best_ride.title,
                "date": best_ride.started_at.date().isoformat() if best_ride.started_at else None,
                "tss": round(best_ride.tss or 0),
                "km": round((best_ride.distance_meters or 0) / 1000, 1),
                "hours": round((best_ride.duration_seconds or 0) / 3600, 1),
            }
            if best_ride is not None
            else None
        ),
        "streak": {"days": streak["streak"], "paused": streak["paused"]},
    }
