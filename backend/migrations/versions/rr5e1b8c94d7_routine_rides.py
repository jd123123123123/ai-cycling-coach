"""routine-ride overrides and the viewer's hide switch

Revision ID: rr5e1b8c94d7
Revises: rp7c2e9a41b8
Create Date: 2026-09-07

A crew-mate who commutes twice a day owns the feed. The detector that
recognises the pattern lives in `services/routine_rides.py`; this migration
gives it the two pieces of state it is not allowed to guess:

  athlete_profiles.hide_routine_rides — the VIEWER's switch. Default FALSE, so
      this deploy changes what nobody sees. It is turned on by a rider who has
      first been shown, by `GET /rides/routine/preview`, exactly which rides it
      would remove from their feed.

  ride_routine_overrides — the rider's own ruling on ONE of their rides, which
      outranks the detector forever and in both directions. Absent row means
      "detector decides"; deleting the row hands the decision back.

── THE ONE THING THIS MIGRATION MUST NOT DO ────────────────────────────────

`activities` is a TimescaleDB hypertable whose primary key must include the
partition column and is therefore composite `(id, started_at)`. `activities.id`
alone has NO unique constraint, so no foreign key may reference it — a
migration that adds one fails and the container crash-loops on boot. That is
written down in `bd9f2a4c7e13`'s docblock, was done anyway once, and took
production down. `ride_routine_overrides.activity_id` is therefore a bare
BigInteger, exactly like `ride_photos.activity_id`, `ride_scenes` and
`ride_feedback`.

This migration also does not ALTER the hypertable at all: the override lives in
its own ordinary table rather than as a nullable column on `activities`, which
keeps every chunk (including compressed ones) untouched.

Both changes are additive and the column has a server default, so the deploy is
safe in either order against a running app: old code ignores a column it never
selects, and new code reads FALSE for every profile written before today.
"""
from alembic import op
import sqlalchemy as sa

revision = "rr5e1b8c94d7"
down_revision = "rp7c2e9a41b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The viewer's switch. NOT NULL with a server default so existing rows are
    # backfilled to OFF in one pass and the app never reads NULL.
    op.add_column(
        "athlete_profiles",
        sa.Column(
            "hide_routine_rides",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    op.create_table(
        "ride_routine_overrides",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        # BARE BigInteger. NO ForeignKeyConstraint to `activities` — see the
        # docblock above; `activities.id` has no unique constraint to reference
        # because the hypertable's PK is composite `(id, started_at)`.
        sa.Column("activity_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        # True = "routine, keep it out of the feed";
        # False = "this one WAS worth posting".
        # No third value: clearing the ruling deletes the row.
        sa.Column("is_routine", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        # One ruling per ride, enforced by the database rather than by every
        # future caller remembering to upsert.
        sa.UniqueConstraint("activity_id", name="uq_ride_routine_overrides_activity"),
    )
    op.create_index(
        "ix_ride_routine_overrides_user", "ride_routine_overrides", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ride_routine_overrides_user", table_name="ride_routine_overrides"
    )
    op.drop_table("ride_routine_overrides")
    op.drop_column("athlete_profiles", "hide_routine_rides")
