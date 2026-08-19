"""add bike_components — per-component odometers for the bike economy

Revision ID: bw6a2f4d81c9
Revises: br3f8a1c65d2
Create Date: 2026-08-19 16:40:00.000000

One row per rider per serviceable component (see models/bike_wear.py). Two
odometers, and the difference between them is the design: ``km_since_service``
resets on every service and drives the harvest, while ``km_total`` never does
and is the lifetime number riders actually brag about.

``last_activity_id`` is the idempotency key. Ingestion replays, and an odometer
that double-counted a ride would inflate both the Service Bonus and the rider's
lifetime chain record — the two figures this system most needs to be true.

No backfill. Rows are created lazily on first workshop read, so existing riders
start every component at zero rather than being credited for kilometres the app
was not yet tracking against a component. RLS via user_id, the same pattern as
wallets, points_ledger and garage_items.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "bw6a2f4d81c9"
down_revision: Union[str, Sequence[str], None] = "br3f8a1c65d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bike_components",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("component_id", sa.String(length=32), nullable=False),
        sa.Column("km_since_service", sa.Float(), nullable=False, server_default="0"),
        sa.Column("km_total", sa.Float(), nullable=False, server_default="0"),
        sa.Column("services", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("longest_run_km", sa.Float(), nullable=False, server_default="0"),
        sa.Column("last_service_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_activity_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "component_id", name="uq_bike_component_user_kind"
        ),
    )
    op.create_index(
        op.f("ix_bike_components_user_id"), "bike_components", ["user_id"], unique=False,
    )

    op.execute("ALTER TABLE bike_components ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON bike_components
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON bike_components;")
    op.execute("ALTER TABLE bike_components DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_bike_components_user_id"), table_name="bike_components")
    op.drop_table("bike_components")
