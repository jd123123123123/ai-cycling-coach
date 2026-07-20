"""Absorb-and-replan (roadmap P1.4, hardened in plan-engine v2).

The single most-praised adaptive behavior in the competitive research: JOIN
silently absorbing a group ride and reshuffling the week. The most-hated:
rigid plans that shame unplanned riding.

Deterministic v1 — no LLM in the loop:

- A synced cycling ride is ABSORBABLE when it is unplanned (no plan row /
  planned rest) with TSS ≥ 40, or ≥ 140 % of its planned session's TSS.
- Rebalance: if the week's banked-so-far + remaining-planned TSS exceeds the
  week's planned total by > 10 %, ONE remaining planned session is eased.
  Victim preference (plan-engine v2): a filler ENDURANCE day is trimmed
  before any quality/key session is touched, and the trim swaps to a shorter
  Z2 variant when the overage allows — recovery spin / rest day only when
  the overage swallows the day. One swap per absorption, never a rewrite,
  and a day already eased by absorption is never eased twice.
- Every absorption writes an audit CoachBrief row (verdict='absorption')
  AND an append-only plan_adaptations feed row (source='post_workout') with
  a no-guilt bilingual message. The plan_adaptations rows double as durable
  dedup memory — each activity is absorbed at most once even if the brief
  cache is invalidated (the pre-cb0b702 sync wipe caused a re-absorption
  death-spiral that serially downgraded quality days).

The Today card reads these audits via GET /coach/absorptions; the Today/Plan
feeds read the plan_adaptations rows.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.coach_brief import CoachBrief
from app.models.plan_adaptation import PlanAdaptation
from app.models.planned_workout import PlannedWorkout
from app.services.plan_adaptation_log import log_adaptation
from app.services.workout_templates import TEMPLATES, pick_trim_variant

logger = logging.getLogger(__name__)

UNPLANNED_MIN_TSS = 40.0
BIGGER_FACTOR = 1.4
WEEK_TOLERANCE = 1.10
_REST_IDS = {"rest_day"}

# Victim categories the rebalance may ease FIRST — aerobic filler texture.
# Quality sessions (tempo/SS/threshold/vo2/anaerobic) are only touched when
# no endurance/recovery day remains in the week.
_FILLER_CATEGORIES = frozenset({"endurance", "recovery"})


def _is_rest(template_id: str | None) -> bool:
    return (template_id or "").lower() in _REST_IDS


def _tss_of(template_id: str | None) -> float:
    t = TEMPLATES.get(template_id or "")
    return float(t.base_tss) if t else 0.0


def _category_of(template_id: str | None) -> str | None:
    t = TEMPLATES.get(template_id or "")
    return t.category if t else None


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

    # Already-absorbed activity ids — union of BOTH audit stores. The
    # CoachBrief rows are the legacy memory; the append-only plan_adaptations
    # rows are the durable one (sync-side cache invalidation can never wipe
    # them), so the same ride is absorbed at most once per actual ride even
    # across brief-cache lifecycles.
    audits = (
        await db.execute(
            select(CoachBrief.evidence).where(
                CoachBrief.user_id == user_id,
                CoachBrief.verdict == "absorption",
                CoachBrief.generated_at >= since - timedelta(days=1),
            )
        )
    ).scalars().all()
    adaptation_audits = (
        await db.execute(
            select(PlanAdaptation.evidence).where(
                PlanAdaptation.user_id == user_id,
                PlanAdaptation.source == "post_workout",
                PlanAdaptation.created_at >= since - timedelta(days=1),
            )
        )
    ).scalars().all()
    absorbed_ids = {
        (a or {}).get("absorption", {}).get("activity_id")
        for a in (*audits, *adaptation_audits)
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
        # Feed row (plan-engine v2): every absorption is an athlete-visible
        # plan adaptation — no-guilt register, and durable dedup memory.
        msg_de, msg_en = _feed_messages(record)
        await log_adaptation(
            db,
            user_id,
            target_date=date.fromisoformat(rebalance["moved_date"]) if rebalance else d,
            source="post_workout",
            signal="extra_load" if rebalance else "session_done",
            rule="absorb_and_replan",
            message_de=msg_de,
            message_en=msg_en,
            before=(
                {"template_id": rebalance["from"], "title": rebalance["from_title"]}
                if rebalance else None
            ),
            after={"template_id": rebalance["to"]} if rebalance else None,
            evidence={"absorption": record},
            commit=False,
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

    # Victim preference (plan-engine v2): trim a filler ENDURANCE day before
    # ever touching the week's key/quality session, and never re-ease a day
    # absorption already eased (one downgrade per day, one swap per ride —
    # the pre-cb0b702 death-spiral serially ate the biggest session).
    fresh = [p for p in remaining if p.blocks_source != "coach_absorbed"]
    if not fresh:
        return None
    filler_pool = [
        p for p in fresh if _category_of(p.template_id) in _FILLER_CATEGORIES
    ]
    pool = filler_pool or fresh
    victim = max(pool, key=lambda p: _tss_of(p.template_id))
    victim_tss = _tss_of(victim.template_id)
    overage = projected - week_target

    # Trim duration first: swap to the largest shorter Z2 variant that clears
    # the overage. Recovery spin next; rest day only when the overage
    # swallows the session whole.
    new_tmpl = None
    if _category_of(victim.template_id) == "endurance":
        new_tmpl = pick_trim_variant(
            max(0.0, victim_tss - overage), 240, exclude_id=victim.template_id
        )
    if new_tmpl is None:
        if overage >= victim_tss * 0.75:
            new_tmpl = TEMPLATES["rest_day"]
        else:
            new_tmpl = TEMPLATES["recovery_60"]
    new_template_id = new_tmpl.id

    before = {"template_id": victim.template_id, "title": victim.title, "date": victim.date.isoformat()}
    victim.template_id = new_template_id
    victim.title = new_tmpl.name
    if new_template_id == "rest_day":
        victim.duration_seconds_target = 0
        victim.interval_structure = {"intervals": [], "source": "coach_absorbed"}
    else:
        victim.duration_seconds_target = sum(b.duration_s for b in new_tmpl.blocks)
        victim.interval_structure = {
            "intervals": [
                {
                    "name": b.name,
                    "duration_seconds": b.duration_s,
                    "power_target_pct_ftp": b.target_pct_ftp,
                    "zone": b.zone,
                    "rpe": b.target_rpe,
                }
                for b in new_tmpl.blocks
            ],
            "source": "coach_absorbed",
        }
    victim.blocks_source = "coach_absorbed"

    return {
        "moved_date": before["date"],
        "from": before["template_id"],
        "from_title": before["title"],
        "to": new_template_id,
        "freed_tss": round(victim_tss - _tss_of(new_template_id)),
    }


def _feed_messages(record: dict[str, Any]) -> tuple[str, str]:
    """(de, en) no-guilt feed copy — states the signal and the change, frames
    the plan as working FOR the athlete (plan_adaptation_log register)."""
    tss = record["actual_tss"]
    rb = record.get("rebalance")
    if rb:
        to_t = TEMPLATES.get(rb["to"])
        to_name = to_t.name if to_t else rb["to"]
        de = (
            f"Deine Ausfahrt mit {tss} TSS zählt voll — "
            f"{rb['from_title']} am {rb['moved_date']} wird zu „{to_name}“, "
            "damit die Woche im Gleichgewicht bleibt."
        )
        en = (
            f"Your {tss}-TSS ride counted in full — "
            f"{rb['from_title']} on {rb['moved_date']} eased to “{to_name}” "
            "so the week stays balanced."
        )
    else:
        de = (
            f"Deine Ausfahrt mit {tss} TSS ist eingeplant — "
            "die Woche passt weiterhin, nichts weiter geändert."
        )
        en = (
            f"Your {tss}-TSS ride is banked — "
            "the week still fits, nothing else changed."
        )
    return de, en


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
