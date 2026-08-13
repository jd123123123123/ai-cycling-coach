"""add garage assets and ride scenes

Revision ID: ga7b1e4c9d3f
Revises: ce4d5e6f7a8b
Create Date: 2026-08-13 19:00:00.000000

Makes the garage real state (see models/garage.py). `garage_assets` holds at
most one digitalised rider and one bike per rider — the vision description plus
the rendered collectible — so surfaces can finally ask "does this rider have a
bike?" instead of falling back to a stock photo. `ride_scenes` caches the
composed rider-on-bike hero per activity, because composing one is a slow paid
image-model call whose result is deterministic for a given ride.

Both RLS-protected via user_id (the wallets / referrals policy shape).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ga7b1e4c9d3f"
down_revision: Union[str, Sequence[str], None] = "ce4d5e6f7a8b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "garage_assets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "kind", name="uq_garage_asset_user_kind"),
    )
    op.create_index(
        op.f("ix_garage_assets_user_id"), "garage_assets", ["user_id"], unique=False,
    )

    op.create_table(
        "ride_scenes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("training_context", sa.Text(), nullable=True),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["activity_id"], ["activities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_id", name="uq_ride_scene_activity"),
    )
    op.create_index(
        op.f("ix_ride_scenes_user_id"), "ride_scenes", ["user_id"], unique=False,
    )
    op.create_index(
        op.f("ix_ride_scenes_activity_id"), "ride_scenes", ["activity_id"], unique=False,
    )

    for table in ("garage_assets", "ride_scenes"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(
            f"""
            CREATE POLICY user_isolation ON {table}
                USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
            """
        )


def downgrade() -> None:
    for table in ("ride_scenes", "garage_assets"):
        op.execute(f"DROP POLICY IF EXISTS user_isolation ON {table};")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_ride_scenes_activity_id"), table_name="ride_scenes")
    op.drop_index(op.f("ix_ride_scenes_user_id"), table_name="ride_scenes")
    op.drop_table("ride_scenes")
    op.drop_index(op.f("ix_garage_assets_user_id"), table_name="garage_assets")
    op.drop_table("garage_assets")
