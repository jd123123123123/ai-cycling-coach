"""add crew_events + crew_event_attendees

Revision ID: ce9f1a2b3c4d
Revises: el7a2c9d3f4b
Create Date: 2026-07-22 10:00:00.000000

Adds the two Crew-event tables that back the V3 Social "group ride / chaingang /
race" cards:

    crew_events           — one planned ride for a crew, with an optional GPX
                            tour whose parsed summary (polyline / distance /
                            elevation) is cached on the row.
    crew_event_attendees  — one RSVP per (event, user): going / maybe / out.

Cascades:
  crew_events.crew_id           → crews.id        ON DELETE CASCADE
  crew_events.creator_user_id   → users.id        ON DELETE CASCADE
  crew_event_attendees.event_id → crew_events.id  ON DELETE CASCADE
  crew_event_attendees.user_id  → users.id        ON DELETE CASCADE

Constraints:
  crew_event_attendees UNIQUE (event_id, user_id) — one RSVP per member/event

Crew-shared data (mirrors crews / crew_memberships): no row-level-security
policy — access is scoped by crew membership in the API.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "ce9f1a2b3c4d"
down_revision: str | Sequence[str] | None = "el7a2c9d3f4b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "crew_events",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "crew_id",
            sa.Integer,
            sa.ForeignKey("crews.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "creator_user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False, server_default="group_ride"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("meeting_point", sa.Text(), nullable=True),
        sa.Column("tour_filename", sa.String(255), nullable=True),
        sa.Column("tour_polyline", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("tour_distance_m", sa.Float(), nullable=True),
        sa.Column("tour_elevation_m", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_crew_events_id", "crew_events", ["id"])
    op.create_index("ix_crew_events_crew_id", "crew_events", ["crew_id"])
    op.create_index(
        "ix_crew_events_crew_starts_at", "crew_events", ["crew_id", "starts_at"]
    )

    op.create_table(
        "crew_event_attendees",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "event_id",
            sa.Integer,
            sa.ForeignKey("crew_events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(10), nullable=False, server_default="going"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "event_id", "user_id", name="uq_crew_event_attendee_event_user"
        ),
    )
    op.create_index("ix_crew_event_attendees_id", "crew_event_attendees", ["id"])
    op.create_index(
        "ix_crew_event_attendees_event_id", "crew_event_attendees", ["event_id"]
    )
    op.create_index(
        "ix_crew_event_attendees_user_id", "crew_event_attendees", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_crew_event_attendees_user_id", table_name="crew_event_attendees"
    )
    op.drop_index(
        "ix_crew_event_attendees_event_id", table_name="crew_event_attendees"
    )
    op.drop_index("ix_crew_event_attendees_id", table_name="crew_event_attendees")
    op.drop_table("crew_event_attendees")

    op.drop_index("ix_crew_events_crew_starts_at", table_name="crew_events")
    op.drop_index("ix_crew_events_crew_id", table_name="crew_events")
    op.drop_index("ix_crew_events_id", table_name="crew_events")
    op.drop_table("crew_events")
