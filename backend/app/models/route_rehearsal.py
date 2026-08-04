"""A stored rehearsal: the route as parsed, the assumptions, and the result.

Stored rather than recomputed so a rehearsal is revisitable and comparable --
"what did I think the Maratona would take in March?" is the interesting
question, and it needs the March answer to still exist. Re-running the
simulator today with today's CP would silently answer a different question.

The parsed route is stored alongside the result so changing an assumption
(PATCH) never needs the original GPX again -- the upload is not kept.

User-owned data, so row-level security applies (see the migration), matching
athlete_profiles / coach_recommendations rather than the crew-shared tables.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RouteRehearsal(Base):
    __tablename__ = "route_rehearsals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    #: 'gpx' | 'crew_event' | 'activity' | 'target_event' (only 'gpx' so far).
    source_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    #: The crew event / activity id the route came from; null for an upload.
    source_ref: Mapped[int | None] = mapped_column(Integer, nullable=True)
    name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    distance_m: Mapped[float] = mapped_column(Float, nullable=False)
    ascent_m: Mapped[float] = mapped_column(Float, nullable=False)
    #: RehearsalRoute points, so a re-run needs no re-parse.
    route: Mapped[dict] = mapped_column(JSONB, nullable=False)
    assumptions: Mapped[dict] = mapped_column(JSONB, nullable=False)
    #: Full SimulationResult + band + fuelling, as returned to the client.
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # Kept-by-the-athlete flag. A rehearsal is persisted the moment it is
    # created, so "saved" cannot mean "written down" -- it means the athlete
    # chose to keep this one, which is what makes it findable later. Nullable
    # with a server default so every pre-existing row reads as not-kept without
    # a backfill.
    saved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
