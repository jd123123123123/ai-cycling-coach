"""PlanAdaptation — the append-only, athlete-visible record of every change
the adaptive plan engine makes and WHY.

The plan-engine goal (July 2026): the plan re-evaluates hourly against fresh
signals (sleep, HRV, workouts done/missed, illness) and the athlete is ALWAYS
told what changed and what drove it — adaptation without transparency reads
as flakiness, transparency without adaptation reads as noise. One row per
material change; the Today/Plan feeds render `message_de`/`message_en`
verbatim (no-guilt register: the plan works FOR the athlete — a missed
session is reflowed, never scolded).

`signal` is the machine-readable driver ('short_sleep', 'low_hrv',
'missed_key_session', 'extra_load', 'illness', 'user_change', …);
`rule` names the deterministic rule that fired; `before`/`after` carry the
compact day-level diff ({date, template_id, title, target_tss}) so the UI
can render a precise before→after row and support demand future undo.

Append-only by convention (mirrors coach_briefs audit rows): rows are never
mutated; a reverted adaptation gets its own row with rule='revert'.
"""
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PlanAdaptation(Base):
    __tablename__ = "plan_adaptations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # The athlete-local calendar day the CHANGE applies to (not when it was made).
    target_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # 'hourly' | 'post_workout' | 'user_change' | 'onboarding' | 'plan_change'
    source: Mapped[str] = mapped_column(String(24), nullable=False)
    signal: Mapped[str] = mapped_column(String(40), nullable=False)
    rule: Mapped[str] = mapped_column(String(60), nullable=False)
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Signal snapshot at decision time (sleep hours, HRV delta, TSB …) — the
    # transparency payload behind "why".
    evidence: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    message_de: Mapped[str] = mapped_column(String(400), nullable=False)
    message_en: Mapped[str] = mapped_column(String(400), nullable=False)
