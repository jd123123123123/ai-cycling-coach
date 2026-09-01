"""a bicycle becomes a row, so a rider can own more than one

Revision ID: bk1d4e7a2c9f
Revises: sp4c1e7b9d2a
Create Date: 2026-09-01 15:10:00.000000

THE SCHEMA COULD NOT COUNT PAST ONE BIKE. `bike_components` was unique on
(user_id, component_id), so there was exactly one chain row per RIDER; there was
no `bike_id` on `activities`, so no ride could say which bicycle rode it; and
`garage_assets` was unique on (user_id, kind), so a rider had one bike asset and
one only. A rider with a road bike, a gravel bike, a winter trainer and a
project frame had all four averaged into a single drivetrain — and because
`indoor_cycling` and `virtual_ride` both map to sport="cycling", a 35 km turbo
session booked wear on tyres that never touched tarmac.

That is not a display bug. It poisons the chain-life Bayes update, which fits a
per-kilometre wear rate from measurements that were taken on four different
chains.

WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT.

It builds the shape and moves every existing row onto it, with nothing lost:

  · `bikes` — a rider's bicycles, one row each, with the one they already had
    seeded as `is_default`.
  · `bike_id` on `bike_components`, `component_measurements` and
    `garage_assets`, backfilled to that default bike, so every wear figure and
    every measurement stays attached to exactly the bicycle it was recorded
    against.
  · `bike_id` on `activities`, left NULL — see below.
  · The uniqueness rules move from per-rider to per-rider-per-bike.

It does NOT rewrite the wear pipeline to be bike-aware. Services keep reading
the default bike, so behaviour after this migration is identical to behaviour
before it. Making the workshop actually multi-bike is the next change, and it
wants its own review — a migration that also changes what the numbers MEAN is a
migration nobody can roll back with confidence.

WHY `activities.bike_id` IS NOT BACKFILLED. Every existing ride was ridden on
some bicycle, but this database has never been told which, and a rider who owned
two bikes last season would have both seasons attributed to whichever row we
picked. NULL is the honest value for "not recorded", and the service layer reads
NULL as the default bike — which preserves today's behaviour exactly while
letting new rides carry the truth. A claim we cannot support does not go in the
column just because the column is now there.

NULLS NOT DISTINCT is load-bearing. Postgres treats NULLs as distinct in a
unique index by default, so `(user_id, bike_id, component_id)` with a NULL
`bike_id` would silently allow unlimited duplicate chain rows — the exact
invariant this table exists to hold. Production runs Postgres 18, so the
modifier is available; the migration asserts the server version rather than
assuming it, because failing loudly on an old server is much better than
shipping a unique index that does not constrain anything.

Small table, small database: 10 users, 333 activities, 21 component rows, 6
garage assets at the time of writing. Every statement here is a metadata change
or a handful of updated rows.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "bk1d4e7a2c9f"
down_revision: str | Sequence[str] | None = "sp4c1e7b9d2a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # NULLS NOT DISTINCT is Postgres 15+. Without it the new unique indexes
    # would not constrain rows whose bike_id is still NULL, which is most of
    # them on day one.
    version_num = conn.exec_driver_sql("SHOW server_version_num").scalar()
    if int(version_num) < 150000:
        raise RuntimeError(
            "bikes-are-rows needs Postgres 15+ for UNIQUE NULLS NOT DISTINCT; "
            f"this server reports {version_num}."
        )

    # ── the bicycles themselves ──────────────────────────────────────────
    op.create_table(
        "bikes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(80), nullable=True),
        #: Exactly one per rider, held by a partial unique index below. Every
        #: surface that is not yet bike-aware reads this one, which is what
        #: keeps behaviour identical until they are.
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_bikes_one_default_per_user
            ON bikes (user_id) WHERE is_default;
        """
    )

    op.execute("ALTER TABLE bikes ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON bikes
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )

    # ── seed one bike for every rider who already has bike data ──────────
    # Their existing components and their existing garage bike are, by
    # definition, all about the one bicycle they were allowed to have.
    op.execute(
        """
        INSERT INTO bikes (user_id, name, is_default)
        SELECT u.id,
               (SELECT ga.name FROM garage_assets ga
                 WHERE ga.user_id = u.id AND ga.kind = 'bike'
                 LIMIT 1),
               true
          FROM users u
         WHERE EXISTS (SELECT 1 FROM bike_components bc WHERE bc.user_id = u.id)
            OR EXISTS (SELECT 1 FROM garage_assets ga
                        WHERE ga.user_id = u.id AND ga.kind = 'bike');
        """
    )

    # ── point the wear data at it ────────────────────────────────────────
    for table in ("bike_components", "component_measurements", "garage_assets"):
        op.add_column(
            table,
            sa.Column(
                "bike_id",
                sa.Integer(),
                sa.ForeignKey("bikes.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )
        # Indexed because every one of these is read BY bike once the surfaces
        # are bike-aware, and because the models declare it — a model that says
        # indexed over a table that is not is drift that autogenerate will keep
        # trying to "fix" on every future revision.
        op.create_index(f"ix_{table}_bike_id", table, ["bike_id"])

    op.execute(
        """
        UPDATE bike_components bc
           SET bike_id = b.id
          FROM bikes b
         WHERE b.user_id = bc.user_id AND b.is_default;
        """
    )
    op.execute(
        """
        UPDATE component_measurements cm
           SET bike_id = b.id
          FROM bikes b
         WHERE b.user_id = cm.user_id AND b.is_default;
        """
    )
    # ONLY the bike assets. The rider's portrait is not about a bicycle, and
    # giving it a bike_id would make the new uniqueness rule below think two
    # portraits were two different bikes' portraits.
    op.execute(
        """
        UPDATE garage_assets ga
           SET bike_id = b.id
          FROM bikes b
         WHERE b.user_id = ga.user_id AND b.is_default AND ga.kind = 'bike';
        """
    )

    # ── a ride can finally say which bicycle rode it ─────────────────────
    # Deliberately NOT backfilled: see the module docstring.
    op.add_column(
        "activities",
        sa.Column(
            "bike_id",
            sa.Integer(),
            sa.ForeignKey("bikes.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_activities_bike_id", "activities", ["bike_id"])

    # ── uniqueness moves from per-rider to per-rider-per-bike ────────────
    op.drop_constraint("uq_bike_component_user_kind", "bike_components", type_="unique")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_bike_component_user_bike_kind
            ON bike_components (user_id, bike_id, component_id) NULLS NOT DISTINCT;
        """
    )

    op.drop_constraint("uq_garage_asset_user_kind", "garage_assets", type_="unique")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_garage_asset_user_kind_bike
            ON garage_assets (user_id, kind, bike_id) NULLS NOT DISTINCT;
        """
    )


def downgrade() -> None:
    # Reversible, and it gives the rows back to the rider rather than deleting
    # them: the per-bike split collapses to the pre-migration one-per-rider
    # shape by keeping the DEFAULT bike's rows and dropping the rest, which is
    # exactly what existed before.
    op.execute("DROP INDEX IF EXISTS uq_garage_asset_user_kind_bike;")
    op.execute("DROP INDEX IF EXISTS uq_bike_component_user_bike_kind;")

    op.execute(
        """
        DELETE FROM bike_components bc
         USING bikes b
         WHERE bc.bike_id = b.id AND NOT b.is_default;
        """
    )
    op.execute(
        """
        DELETE FROM garage_assets ga
         USING bikes b
         WHERE ga.bike_id = b.id AND NOT b.is_default;
        """
    )

    op.create_unique_constraint(
        "uq_bike_component_user_kind", "bike_components", ["user_id", "component_id"]
    )
    op.create_unique_constraint(
        "uq_garage_asset_user_kind", "garage_assets", ["user_id", "kind"]
    )

    op.drop_index("ix_activities_bike_id", table_name="activities")
    op.drop_column("activities", "bike_id")
    for table in ("garage_assets", "component_measurements", "bike_components"):
        op.drop_index(f"ix_{table}_bike_id", table_name=table)
        op.drop_column(table, "bike_id")

    op.execute("DROP POLICY IF EXISTS user_isolation ON bikes;")
    op.execute("DROP INDEX IF EXISTS uq_bikes_one_default_per_user;")
    op.drop_table("bikes")
