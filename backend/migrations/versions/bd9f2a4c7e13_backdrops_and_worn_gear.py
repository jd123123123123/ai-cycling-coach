"""stages: the day scene gains a backdrop, and places become shared property

Revision ID: bd9f2a4c7e13
Revises: bg7c1e5a92d4
Create Date: 2026-08-20 12:10:00.000000

Three changes, all for the backdrop picker (`services/backdrops`).

1. `day_scenes.backdrop` — the stage a pose was composed on becomes part of the
   cache key, so switching stages and switching back is free rather than billing
   a fresh render for a picture the rider already has. Existing rows adopt the
   starter road, which is what they actually depict: every scene rendered before
   today used `ride_scene.STARTER_BACKDROP` and nothing else.

2. The unique constraint widens from (user, pose) to (user, pose, backdrop).
   NOT NULL with a server default is load-bearing here — Postgres treats NULLs
   as distinct, so a nullable column would silently stop the constraint from
   deduplicating anything.

3. `rider_stages` — one row per rider holding the stage they picked. Absent
   means the starter road; see the model for why this is not a column on
   `users` and not inferred from the newest scene.

NO FOREIGN KEY POINTS AT `activities`, and that is not an oversight. It is a
Timescale hypertable whose primary key must include the partition column, so it
is composite `(id, started_at)` and `activities.id` alone has no unique
constraint for Postgres to reference. `RideScene` and `RideFeedback` already
carry bare BigInteger activity ids for exactly this reason; these do too.

CACHED SCENES ARE DELETED, and this is the part worth reading twice. Today's
hero changed shape in the same release: the camera turned from a flat side
profile to a front three-quarter so the face and any worn helmet or glasses are
visible (`cyclr_studio._scene_prompt`), the effort is now played to the camera
(`ride_scene._PERFORMANCE`), and the rider's equipped headwear composes into the
picture (`rider_wear`). Every cached row predates all three, and the cache keys
know nothing about the recipe — so a rider who kept their rows would keep the
old side-on art forever and never see the feature at all.

Derived data, cheap to lose: each row regenerates on demand from garage assets
the rider still owns. Nothing in `garage_assets` is touched, so no photograph is
lost and nobody re-uploads anything.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "bd9f2a4c7e13"
down_revision: Union[str, Sequence[str], None] = "bg7c1e5a92d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The old art, before the new key exists — cheaper than migrating rows we
    # are about to invalidate anyway, and it leaves nothing keyed the old way.
    op.execute("DELETE FROM day_scenes")

    op.add_column(
        "day_scenes",
        sa.Column(
            "backdrop", sa.String(length=64), nullable=False, server_default="starter_road",
        ),
    )
    op.drop_constraint("uq_day_scene_user_pose", "day_scenes", type_="unique")
    op.create_unique_constraint(
        "uq_day_scene_user_pose_backdrop", "day_scenes", ["user_id", "pose", "backdrop"],
    )

    op.create_table(
        "rider_stages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("backdrop", sa.String(length=64), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_rider_stage_user"),
    )
    op.create_index(
        op.f("ix_rider_stages_user_id"), "rider_stages", ["user_id"], unique=False,
    )

    op.create_table(
        "rider_backdrops",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("backdrop", sa.String(length=64), nullable=False),
        sa.Column("activity_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "unlocked_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "backdrop", name="uq_rider_backdrop"),
    )
    op.create_index(
        op.f("ix_rider_backdrops_user_id"), "rider_backdrops", ["user_id"], unique=False,
    )

    # ── the shared half: places riders have actually ridden ─────────────────
    # GLOBAL, and therefore NOT row-level-secured like the rest of this schema.
    # The catalogue is common ground: one rider putting the Dolomites on the map
    # is what makes them available to every other rider who has been there.
    op.create_table(
        "places",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("country", sa.String(length=80), nullable=True),
        sa.Column("prose", sa.Text(), nullable=False),
        sa.Column("plate_url", sa.Text(), nullable=True),
        sa.Column("price_rc", sa.Integer(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column("discovered_by_user_id", sa.Integer(), nullable=True),
        sa.Column("discovered_by_activity_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(["discovered_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_place_slug"),
    )
    op.create_index(op.f("ix_places_slug"), "places", ["slug"], unique=False)

    op.create_table(
        "rider_place_stamps",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("place_id", sa.Integer(), nullable=False),
        sa.Column("rides", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "first_ridden_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "place_id", name="uq_rider_place_stamp"),
    )
    op.create_index(
        op.f("ix_rider_place_stamps_user_id"), "rider_place_stamps", ["user_id"], unique=False,
    )
    op.create_index(
        op.f("ix_rider_place_stamps_place_id"), "rider_place_stamps", ["place_id"], unique=False,
    )

    # ── row-level security ──────────────────────────────────────────────────
    # Every per-rider table in this schema carries the same isolation policy,
    # and these three are no exception: what a rider picked, what they own and
    # where they have been are all theirs. The application already filters by
    # user_id in every query — this is the layer that holds when one of those
    # queries is written wrong.
    #
    # `places` DELIBERATELY HAS NONE. It is the shared catalogue: one rider
    # putting the Dolomites on the map is precisely what makes them available to
    # everyone else who has been there, so isolating it would break the feature
    # rather than protect anything. There is nothing private in the row.
    for table in ("rider_stages", "rider_backdrops", "rider_place_stamps"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(
            f"""
            CREATE POLICY user_isolation ON {table}
                USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
            """
        )


def downgrade() -> None:
    for table in ("rider_stages", "rider_backdrops", "rider_place_stamps"):
        op.execute(f"DROP POLICY IF EXISTS user_isolation ON {table};")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")

    op.drop_index(op.f("ix_rider_place_stamps_place_id"), table_name="rider_place_stamps")
    op.drop_index(op.f("ix_rider_place_stamps_user_id"), table_name="rider_place_stamps")
    op.drop_table("rider_place_stamps")
    op.drop_index(op.f("ix_places_slug"), table_name="places")
    op.drop_table("places")
    op.drop_index(op.f("ix_rider_backdrops_user_id"), table_name="rider_backdrops")
    op.drop_table("rider_backdrops")
    op.drop_index(op.f("ix_rider_stages_user_id"), table_name="rider_stages")
    op.drop_table("rider_stages")

    # Back to one row per pose. The rows have to go again: with several stages
    # per pose in the table, restoring the narrower constraint would fail on the
    # duplicates the wider one legitimately allowed.
    op.execute("DELETE FROM day_scenes")
    op.drop_constraint("uq_day_scene_user_pose_backdrop", "day_scenes", type_="unique")
    op.create_unique_constraint(
        "uq_day_scene_user_pose", "day_scenes", ["user_id", "pose"],
    )
    op.drop_column("day_scenes", "backdrop")
