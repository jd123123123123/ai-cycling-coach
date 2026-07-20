"""Plan-adaptation log — the single write/read path for athlete-visible
plan changes (plan-engine v2 transparency layer).

Every material change the adaptive engine makes — hourly signal-driven,
post-workout reflow, user-initiated plan change — goes through
``log_adaptation`` so the Today/Plan feeds, push notices and future undo all
read one consistent, append-only stream. Writers NEVER mutate rows.

Message register (no-guilt, audit-aligned): state the signal and the change,
frame the plan as working for the athlete. Examples the engine should emit:
    de: 'Schlaf 5,2 h — heutige Einheit von Schwelle auf locker gestellt.'
    en: 'Sleep 5.2 h — today's session eased from threshold to easy.'
    de: 'Dienstag verpasst — die Qualitätseinheit liegt jetzt auf Donnerstag.'
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plan_adaptation import PlanAdaptation

# Stability guard (evidence: HRV-guided protocols adjust at most daily; more
# churn erodes trust): per (user, target_date, signal) at most ONE adaptation
# row per athlete-local day. Callers use `already_adapted_today` to enforce.


async def log_adaptation(
    db: AsyncSession,
    user_id: int,
    *,
    target_date: date,
    source: str,
    signal: str,
    rule: str,
    message_de: str,
    message_en: str,
    before: dict | None = None,
    after: dict | None = None,
    evidence: dict | None = None,
    commit: bool = True,
) -> PlanAdaptation:
    row = PlanAdaptation(
        user_id=user_id,
        target_date=target_date,
        source=source,
        signal=signal,
        rule=rule,
        before=before,
        after=after,
        evidence=evidence,
        message_de=message_de[:400],
        message_en=message_en[:400],
    )
    db.add(row)
    if commit:
        await db.commit()
    else:
        await db.flush()
    return row


async def recent_adaptations(
    db: AsyncSession,
    user_id: int,
    *,
    days: int = 14,
    limit: int = 40,
) -> list[PlanAdaptation]:
    """Newest-first feed for the Today slim card + Plan timeline."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    res = await db.execute(
        select(PlanAdaptation)
        .where(PlanAdaptation.user_id == user_id, PlanAdaptation.created_at >= cutoff)
        .order_by(PlanAdaptation.created_at.desc())
        .limit(limit)
    )
    return list(res.scalars().all())


async def already_adapted(
    db: AsyncSession,
    user_id: int,
    *,
    target_date: date,
    signal: str,
    since: datetime,
) -> bool:
    """Stability guard: has this signal already adapted this day since `since`?"""
    res = await db.execute(
        select(PlanAdaptation.id)
        .where(
            PlanAdaptation.user_id == user_id,
            PlanAdaptation.target_date == target_date,
            PlanAdaptation.signal == signal,
            PlanAdaptation.created_at >= since,
        )
        .limit(1)
    )
    return res.scalar_one_or_none() is not None
