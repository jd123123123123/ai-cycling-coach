"""ride photos and a ride description

Revision ID: rp7c2e9a41b8
Revises: bk1d4e7a2c9f
Create Date: 2026-09-02

THE STRAVA MOMENT NEEDS SOMEWHERE TO PUT THE ANSWER. A rider finishes, the ride
syncs, and the app asks for a photo and a sentence — and until now there was
nowhere to keep either. `activities.description` holds the sentence;
`ride_photos` holds where the pictures are on the volume, never the bytes.

Both are additive and nullable, so the deploy is safe in either order against a
running app: the old code ignores a column it does not select, and the new code
reads null for every ride taken before today.
"""
from alembic import op
import sqlalchemy as sa

revision = "rp7c2e9a41b8"
down_revision = "bk1d4e7a2c9f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("activities", sa.Column("description", sa.Text(), nullable=True))

    op.create_table(
        "ride_photos",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("activity_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        # Relative to the configured root: an absolute path would break the day
        # the volume moves, which is the kind of thing that moves.
        sa.Column("rel_path", sa.String(length=512), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("sort", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        # NO FOREIGN KEY TO `activities`, and that is not an oversight — it is
        # written down in `bd9f2a4c7e13`'s docblock and I put one here anyway,
        # which took production down on boot. `activities` is a TimescaleDB
        # hypertable, so its primary key must include the partition column and
        # is composite `(id, started_at)`; `activities.id` alone has no unique
        # constraint for Postgres to reference. `ride_scenes` and
        # `ride_feedback` carry bare BigInteger activity ids for exactly this
        # reason, and so does this.
        #
        # The cost is that a deleted activity leaves orphan photo rows. That is
        # handled where the app deletes an activity, not by a constraint the
        # database cannot express.
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ride_photos_activity", "ride_photos", ["activity_id", "sort"])
    op.create_index("ix_ride_photos_user", "ride_photos", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_ride_photos_user", table_name="ride_photos")
    op.drop_index("ix_ride_photos_activity", table_name="ride_photos")
    op.drop_table("ride_photos")
    op.drop_column("activities", "description")
