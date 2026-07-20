"""CoachRecommendation — the immutable record of "what the coach prescribed
for THIS specific date" so post-ride compliance grading scores against the
recommendation that was actually shown to the athlete, not against a
re-pick of the template at evaluation time.

Without this row, `ride_compliance.score()` would re-run the template
picker against post-ride state, which means the picker would be grading
itself — cosmetically nice scores but no real signal on whether the
athlete followed the plan.

One row per (user_id, target_date). `source_brief_id` ties it back to
the brief that produced the prescription. `eval_*` columns are filled in
when post-ride compliance scoring runs.

RLS-protected by `user_id` matching the existing `current_setting('app.current_user_id')`
pattern (see migrations/versions/a076ea752213).
"""
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CoachRecommendation(Base):
    __tablename__ = "coach_recommendations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # The local-calendar date this recommendation was prescribed for.
    # Indexed (composite with user_id below in the migration) because the
    # primary lookup is "find the rec for this user on this day".
    target_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Workout identity — what was prescribed.
    template_id: Mapped[str] = mapped_column(String(80), nullable=False)
    # Sport of the prescription ('cycling' | 'running' | 'gym'). NULL on
    # legacy rows means 'cycling' (the library was cycling-only before the
    # sport-gate landed — usability audit P0-2). Read via
    # `rec.sport or "cycling"`; compliance grading only proceeds when
    # `sport.same_sport_family(activity.sport, rec.sport or "cycling")`.
    sport: Mapped[str | None] = mapped_column(String(20), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    predicted_tss: Mapped[int] = mapped_column(Integer, nullable=False)
    framework_cited: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Full block structure (warm-up / main / cool-down with watts/duration).
    blocks: Mapped[list] = mapped_column(JSONB, nullable=False)

    # Coach's "why this workout" rationale shown to the athlete.
    why_this_workout: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Provenance — which brief produced this recommendation.
    source_brief_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("coach_briefs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Evaluation — populated when ride_compliance.score() runs against this row.
    evaluated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    eval_grade: Mapped[str | None] = mapped_column(String(30), nullable=True)
    eval_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True,
    )
