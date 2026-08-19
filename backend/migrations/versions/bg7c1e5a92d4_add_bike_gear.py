"""add bike_gear — owned and equipped earn-modifier items

Revision ID: bg7c1e5a92d4
Revises: bw6a2f4d81c9
Create Date: 2026-08-19 17:20:00.000000

One row per rider per item (see models/bike_gear.py). A row existing means the
item was BOUGHT: there is no source column and no grant path, because nothing in
this catalogue is ever free.

UNIQUE (user_id, item_id) is the anti-double-buy guarantee. `gear.buy` inserts
before debiting and rolls back the whole transaction on conflict, so a rider can
be told "already owned" but can never be charged twice.

`equipped` is a plain boolean rather than a loadout table with one column per
slot: the slots live in the catalogue, and a slot column would mean a migration
every time one is added plus two places that can disagree about which slot an
item belongs to.

No backfill and no seed — every rider starts with an empty garage and buys their
way out of it. RLS via user_id, the same pattern as wallets and bike_components.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "bg7c1e5a92d4"
down_revision: Union[str, Sequence[str], None] = "bw6a2f4d81c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bike_gear",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.String(length=48), nullable=False),
        sa.Column("price_paid", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "equipped", sa.Boolean(), nullable=False, server_default=sa.text("false"),
        ),
        sa.Column(
            "acquired_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "item_id", name="uq_bike_gear_user_item"),
    )
    op.create_index(
        op.f("ix_bike_gear_user_id"), "bike_gear", ["user_id"], unique=False,
    )

    op.execute("ALTER TABLE bike_gear ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON bike_gear
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON bike_gear;")
    op.execute("ALTER TABLE bike_gear DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_bike_gear_user_id"), table_name="bike_gear")
    op.drop_table("bike_gear")
