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

REBASED ONTO `cl1a2b3c4d5e`, WHICH IS NOT MINE. A parallel worktree deployed the
chain-life migration while this one was being written, so both claimed
`df2c6e0a71b4` as their parent. Two heads means `alembic upgrade head` cannot
choose, the container dies on boot, and the API goes to 502 — which is exactly
what happened. Its file is vendored into this tree so the history resolves; the
owning branch keeps it.

Revision ID: e7b2c9d4a015
Revises: cl1a2b3c4d5e
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e7b2c9d4a015"
down_revision = "cl1a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "activity_streams",
        sa.Column("matched_polyline", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("activity_streams", "matched_polyline")
