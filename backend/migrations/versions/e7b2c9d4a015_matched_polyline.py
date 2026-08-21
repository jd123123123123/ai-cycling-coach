"""The ride's track, snapped to the road graph.

A recorded GPS trace does not lie on the road: consumer GPS wanders 5-15 m and
staircases where the sample rate loses a corner. Every reduction algorithm is
faithful to THAT, so simplifying better only preserves the wander more
accurately. Map matching walks the noisy points along the OSM road graph and
returns the road's own geometry, which is why Strava, Komoot and Garmin routes
sit exactly on the road at any zoom.

Cached rather than computed on demand: a 138 km ride is twelve requests to an
external service and about eighteen seconds. NULL means not attempted, or
attempted and refused — a trail that is not in OpenStreetMap gets its recorded
trace, because a confidently wrong road is worse than an honest wobble.

Revision ID: e7b2c9d4a015
Revises: df2c6e0a71b4
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e7b2c9d4a015"
down_revision = "df2c6e0a71b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "activity_streams",
        sa.Column("matched_polyline", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("activity_streams", "matched_polyline")
