"""Crew events — group rides / chaingangs / races a crew plans together, plus
each member's RSVP.

Two tables:

    crew_events          — one planned ride for a crew: name, kind, start time,
                           optional meeting point + description, and (optionally)
                           an uploaded GPX tour whose parsed summary is cached on
                           the row (polyline / distance / elevation) so the V3
                           Social card renders without re-parsing the file.
    crew_event_attendees — one RSVP per (event, user): going / maybe / out.

Crew-shared data (every crew member reads the same events), so — like the crews
/ crew_memberships tables — there is NO row-level-security policy here; access
is scoped in the API by crew membership. Cascading deletes on the crew and event
rows clean up attendees.
"""

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CrewEvent(Base):
    __tablename__ = "crew_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    crew_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("crews.id", ondelete="CASCADE"),
        nullable=False,
    )
    creator_user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Short free-form tag: 'sunrise_ride' | 'chaingang' | 'group_ride' | 'race' …
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="group_ride")
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    meeting_point: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Uploaded GPX tour (optional) ──────────────────────────────────────
    # The raw file lives on disk at {CREW_TOURS_ROOT}/{event_id}.gpx; these
    # columns cache its parsed summary so the card renders without re-parsing.
    tour_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Simplified [[lat, lng], …] track (~200 points) for the card mini-map.
    tour_polyline: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    tour_distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    tour_elevation_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    # [[cumulative_distance_m, elevation_m], …] (≤120 points) for the event
    # detail page's elevation-profile chart. NULL when the GPX had no <ele>
    # data — the chart then hides rather than drawing a fake flat line.
    tour_profile: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    tour_descent_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Steepest gradient sustained over ≥100 m (see services/crew_tour.py for why
    # a per-point delta would be meaningless here).
    tour_max_grade_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Named pins from the GPX's <wpt> elements (≤12), spread along the route:
    # [{"name", "lat", "lng", "sym", "desc"}, …] — what the detail-page map
    # labels. NULL when the upload carried no *named* waypoints (unnamed pins
    # are dropped at parse time — see services/crew_tour.py), so the map draws
    # no pin layer at all rather than an empty one.
    tour_waypoints: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    attendees: Mapped[list["CrewEventAttendee"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_crew_events_crew_id", "crew_id"),
        Index("ix_crew_events_crew_starts_at", "crew_id", "starts_at"),
    )


class CrewEventAttendee(Base):
    __tablename__ = "crew_event_attendees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("crew_events.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # 'going' | 'maybe' | 'out'
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="going")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    event: Mapped[CrewEvent] = relationship(back_populates="attendees")

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_crew_event_attendee_event_user"),
        Index("ix_crew_event_attendees_event_id", "event_id"),
        Index("ix_crew_event_attendees_user_id", "user_id"),
    )
