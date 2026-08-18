"""add W3 shop garage_items + garage_loadout

Revision ID: sh7d4e1f9c2a3
Revises: st5e9a2c7d1b
Create Date: 2026-08-18 09:00:00.000000

The RideCoin sink's two durable tables (see models/shop.py):

- ``garage_items``   — what a rider owns; UNIQUE (user_id, item_id) is what makes
  the starter grant replayable and a double-buy impossible.
- ``garage_loadout`` — one row per rider: the bike plus the four cosmetic slots.

Both RLS-protected via user_id (same pattern as wallets / points_ledger).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "sh7d4e1f9c2a3"
down_revision: Union[str, Sequence[str], None] = "st5e9a2c7d1b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "garage_items",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.String(length=48), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("price_paid", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "acquired_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "item_id", name="uq_garage_item_user_item"),
    )
    op.create_index(
        op.f("ix_garage_items_user_id"), "garage_items", ["user_id"], unique=False,
    )

    op.create_table(
        "garage_loadout",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("bike_id", sa.String(length=48), nullable=False),
        sa.Column("frame_id", sa.String(length=48), nullable=True),
        sa.Column("wheels_id", sa.String(length=48), nullable=True),
        sa.Column("bars_id", sa.String(length=48), nullable=True),
        sa.Column("saddle_id", sa.String(length=48), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )

    for table in ("garage_items", "garage_loadout"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(
            f"""
            CREATE POLICY user_isolation ON {table}
                USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
            """
        )


def downgrade() -> None:
    for table in ("garage_loadout", "garage_items"):
        op.execute(f"DROP POLICY IF EXISTS user_isolation ON {table};")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")
    op.drop_table("garage_loadout")
    op.drop_index(op.f("ix_garage_items_user_id"), table_name="garage_items")
    op.drop_table("garage_items")
