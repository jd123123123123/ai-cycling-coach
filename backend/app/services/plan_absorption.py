"""Absorb-and-replan (roadmap P1.4).

The single most-praised adaptive behavior in the competitive research: JOIN
silently absorbing a group ride and reshuffling the week. The most-hated:
rigid plans that shame unplanned riding.

Deterministic v1 — no LLM in the loop:

- A synced cycling ride is ABSORBABLE when it is unplanned (no plan row /
  planned rest) with TSS ≥ 40, or ≥ 140 % of its planned session's TSS.
- Rebalance: if the week's banked-so-far + remaining-planned TSS exceeds the
  week's planned total by > 10 %, the biggest remaining planned session is
  downgraded (recovery spin, or a rest day when the overage swallows it
  whole). One swap per absorption — gentle, never a rewrite.
- Every absorption writes an audit CoachBrief row (verdict='absorption')
  with a non-guilt narrative; each activity is absorbed at most once.

The Today card reads these audits via GET /coach/absorptions.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.coach_brief import CoachBrief
from app.models.planned_workout import PlannedWorkout
from app.services.workout_templates import TEMPLATES

logger = logging.getLogger(__name__)

UNPLANNED_MIN_TSS = 40.0
BIGGER_FACTOR = 1.4
WEEK_TOLERANCE = 1.10
_REST_IDS = {"rest_day"}


def _is_rest(template_id: str | None) -> bool:
    return (template_id or "").lower() in _REST_IDS


def _tss_of(template_id: str | None) -> float:
    t = TEMPLATES.get(template_id or "")
    return float(t.base_tss) if t else 0.0


async def absorb_new_activities(
    db: AsyncSession, user_id: int, window_days: int = 3
) -> list[dict[str, Any]]:
    """Detect + absorb recent unplanned/oversized rides. Returns absorption
    records (also persisted as audit rows). Never raises — sync must survive."""
    try:
        return await _absorb(db, user_id, window_days)
    except Exception:  # noqa: BLE001 — absorption is best-effort by contract
        logger.exception("plan absorption failed (user_id=%s) — non-fatal", user_id)
        return []


async def _absorb(db: AsyncSession, user_id: int, window_days: int) -> list[dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    acts = (
        await db.execute(
            select(Activity).where(
                Activity.user_id == user_id,
                Activity.sport == "cycling",
                Activity.started_at >= since,
                Activity.tss.isnot(None),
            )
        )
    ).scalars().all()
    if not acts:
        return []

    # Already-absorbed activity ids (from audit rows in the window).
    audits = (
        await db.execute(
            select(CoachBrief.evidence).where(
                CoachBrief.user_id == user_id,
                CoachBrief.verdict == "absorption",
                CoachBrief.generated_at >= since - timedelta(days=1),
            )
        )
    ).scalars().all()
    absorbed_ids = {
        (a or {}).get("absorption", {}).get("activity_id") for a in audits
    }

    out: list[dict[str, Any]] = []
    for act in acts:
        if act.id in absorbed_ids or act.started_at is None:
            continue
        d = act.started_at.date()
        plan_rows = (
            await db.execute(
                select(PlannedWorkout).where(
                    PlannedWorkout.user_id == user_id, PlannedWorkout.date == d
                )
            )
        ).scalars().all()
        planned_tss = sum(_tss_of(p.template_id) for p in plan_rows)
        actual = float(act.tss or 0.0)

        if not plan_rows or all(_is_rest(p.template_id) for p in plan_rows):
            kind = "unplanned"
            if actual < UNPLANNED_MIN_TSS:
                continue
        elif planned_tss > 0 and actual >= planned_tss * BIGGER_FACTOR:
            kind = "bigger"
        else:
            continue

        rebalance = await _rebalance_week(db, user_id, d, actual, planned_tss)
        record = {
            "activity_id": act.id,
            "date": d.isoformat(),
            "kind": kind,
            "actual_tss": round(actual),
            "planned_tss": round(planned_tss),
            "rebalance": rebalance,
        }
        db.add(
            CoachBrief(
                user_id=user_id,
                verdict="absorption",
                rationale=_narrative(record),
                evidence={"absorption": record},
                model_used="rule-based-absorption",
            )
        )
        out.append(record)

    if out:
        await db.commit()
    return out


async def _rebalance_week(
    db: AsyncSession, user_id: int, ride_date: date, actual_tss: float, planned_that_day: float
) -> dict[str, Any] | None:
    """One gentle swap: downgrade the biggest remaining planned session when
    the week is now running > 10 % over its planned total."""
    monday = ride_date - timedelta(days=ride_date.weekday())
    sunday = monday + timedelta(days=6)

    week_plans = (
        await db.execute(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.date >= monday,
                PlannedWorkout.date <= sunday,
            )
        )
    ).scalars().all()
    if not week_plans:
        return None
    week_target = sum(_tss_of(p.template_id) for p in week_plans)
    if week_target <= 0:
        return None

    week_acts = (
        await db.execute(
            select(Activity.tss).where(
                Activity.user_id == user_id,
                Activity.started_at >= datetime.combine(monday, time.min, tzinfo=timezone.utc),
                Activity.started_at <= datetime.combine(ride_date, time.max, tzinfo=timezone.utc),
                Activity.tss.isnot(None),
            )
        )
    ).all()
    banked = sum(float(r[0]) for r in week_acts)

    remaining = [
        p for p in week_plans
        if p.date > ride_date and not _is_rest(p.template_id)
    ]
    remaining_tss = sum(_tss_of(p.template_id) for p in remaining)
    projected = banked + remaining_tss
    if projected <= week_target * WEEK_TOLERANCE or not remaining:
        return None

    victim = max(remaining, key=lambda p: _tss_of(p.template_id))
    victim_tss = _tss_of(victim.template_id)
    overage = projected - week_target
    new_template_id = "rest_day" if overage >= victim_tss * 0.75 else "recovery_60"
    new_tmpl = TEMPLATES.get(new_template_id)

    before = {"template_id": victim.template_id, "title": victim.title, "date": victim.date.isoformat()}
    victim.template_id = new_template_id
    victim.title = new_tmpl.name if new_tmpl else new_template_id
    victim.duration_seconds_target = int((30 if new_template_id == "rest_day" else 60) * 60) if new_template_id != "rest_day" else 0
    victim.blocks_source = "coach_absorbed"
    victim.interval_structure = {"intervals": [], "source": "coach_absorbed"}

    return {
        "moved_date": before["date"],
        "from": before["template_id"],
        "from_title": before["title"],
        "to": new_template_id,
        "freed_tss": round(victim_tss - _tss_of(new_template_id)),
    }


def _narrative(record: dict[str, Any]) -> str:
    base = (
        f"Absorbed a {record['actual_tss']}-TSS "
        f"{'unplanned ride' if record['kind'] == 'unplanned' else 'bigger-than-planned ride'} "
        f"on {record['date']}."
    )
    rb = record.get("rebalance")
    if rb:
        return base + (
            f" Rebalanced the week: {rb['from_title']} on {rb['moved_date']} "
            f"eased to {rb['to']} (−{rb['freed_tss']} TSS)."
        )
    return base + " The week still fits — nothing else changed."
