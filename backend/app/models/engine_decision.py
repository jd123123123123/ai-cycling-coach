"""EngineDecision — what the adaptation engine said, and what it saw when it
said it. One row per athlete per day.

WHY THIS TABLE EXISTS. The scientific audit's central finding was not any
single threshold; it was that **no part of the engine has ever been tested
against an outcome**. The engine makes strong present-tense claims — "Grünes
Licht — belaste hart" — from a chain of thresholds, and never asks whether the
athlete who was told that actually trained well the next day.

That study cannot be run retrospectively on data nobody kept. Until this table
existed, the daily verdict and every input behind it were computed, rendered
and thrown away: `coach_briefs` stores prose, `plan_adaptations` stores plan
CHANGES, and neither records the decision or the evidence. So the first move
toward defensibility is not a better model — it is an instrument.

WHAT IT IS FOR, concretely:

  * **Does the directive predict anything?** Join a day's `directive` to the
    NEXT day's activities (already stored) and ask whether escalate days are
    followed by better-executed sessions than hold days. The comparison that
    matters is against a null model using TSB alone — if the multi-signal
    engine cannot beat CTL/ATL arithmetic, that is the finding.
  * **Does the convention agree with the variance-correct test?** `evidence`
    carries both the band verdict and `z_mean` for every day, so the question
    the audit had to leave open (§4.2) becomes a query.
  * **How often is the engine speaking from thin evidence?** `evidence` carries
    `n_recent`, `n_baseline` and the readiness `coverage`.

DESIGN NOTES.

`evidence` is JSONB rather than fifty columns on purpose: the input vector will
change as the engine gains signals, and a study that needs a new field should
not need a migration. The handful of columns promoted to first class are the
ones a study filters or groups by.

`engine_version` is load-bearing and easy to forget. A cohort that mixes days
produced by different decision rules is not a cohort. Bump it in
`decision_log.ENGINE_VERSION` whenever the rules change, and any analysis can
then exclude or stratify.

One row per (user_id, date), upserted: the engine may run many times a day and
the log records the day's decision, not every invocation. The row carries the LAST
decision of the day, which is the one that stood.

Not athlete-facing. This is instrumentation.
"""
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EngineDecision(Base):
    """One athlete-day of adaptation-engine decision + evidence."""

    __tablename__ = "engine_decisions"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_engine_decisions_user_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: Athlete-local calendar day the decision was FOR.
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    #: Bump whenever the decision RULES change — see the module docstring.
    engine_version: Mapped[str] = mapped_column(String(32), nullable=False)

    # ── The verdict ──────────────────────────────────────────────────────
    directive: Mapped[str | None] = mapped_column(String(16), nullable=True)
    intensity_ceiling: Mapped[str | None] = mapped_column(String(16), nullable=True)
    volume_modifier: Mapped[float | None] = mapped_column(Float, nullable=True)
    hrv_state: Mapped[str | None] = mapped_column(String(16), nullable=True)
    readiness_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    readiness_tier: Mapped[str | None] = mapped_column(String(16), nullable=True)

    #: The athlete's push-intensity preference on the day. A study MUST
    #: stratify on this: it shifts the escalation boundary, so leaving it out
    #: confounds preference with physiological response (audit §7.3).
    push_intensity: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # ── Everything the verdict was made from ─────────────────────────────
    evidence: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
