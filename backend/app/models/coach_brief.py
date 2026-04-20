"""Cached AI coaching brief — one row per generation, 6h read-through TTL per user.

Cache strategy:
    coach_service.get_or_generate_brief queries the latest row for the user; if
    generated_at is within COACH_BRIEF_CACHE_HOURS (default 6), it's returned.
    Otherwise a new brief is generated and appended (we KEEP history — each row
    is an immutable audit trail of what the coach said when).

Transparency:
    raw_prompt + evidence (snapshot JSON) are stored so the athlete can hit
    GET /coach/transparency and see exactly what the LLM saw.
"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CoachBrief(Base):
    __tablename__ = "coach_briefs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Primary payload
    verdict: Mapped[str] = mapped_column(Text, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)

    # Full feature snapshot (what the LLM saw). JSONB for indexed querying.
    evidence: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Legacy: 4 options (phase 5). Kept nullable for backward compat / rollback.
    # Phase 5.1 switched to prescribed_workout + alternates below.
    options: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Phase 5.1: the ONE precisely prescribed workout (template_id, blocks, watts, TSS).
    # Nullable for rollback / pre-5.1 rows; new generations always populate it.
    prescribed_workout: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Phase 5.1: exactly 2 compact alternates (less_time / recover).
    alternates: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Forward 7-day outlook (suggested TSS per day with coach notes)
    outlook_7d: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Framework citations (e.g. "Seiler polarized", "Banister fitness-fatigue")
    frameworks_cited: Mapped[list | None] = mapped_column(ARRAY(String), nullable=True)

    # Raw system+user prompt for the "show me what the AI saw" transparency toggle
    raw_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    # "claude-opus-4-7" | "claude-sonnet-4-6" | "rule-based-fallback" | ...
    model_used: Mapped[str] = mapped_column(String(50), nullable=False)
