"""add RideCoin wallets + points_ledger

Revision ID: rc1a2b3c4d5e
Revises: 8c7827401c0e
Create Date: 2026-08-12 10:00:00.000000

The RideCoin economy's two durable tables (spec:
docs/superpowers/specs/2026-08-12-ridecoin-point-system-design.md):

- ``wallets``       — one row per user, cached current balance.
- ``points_ledger`` — append-only earn/spend history; a
  (user_id, activity_id, reason) uniqueness rule makes ride awards idempotent.

Both RLS-protected via user_id (same pattern as achievements / ride_feedback).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "rc1a2b3c4d5e"
down_revision: Union[str, Sequence[str], None] = "8c7827401c0e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wallets",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.create_table(
        "points_ledger",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.BigInteger(), nullable=True),
        sa.Column("base_tss", sa.Integer(), nullable=True),
        sa.Column("multiplier", sa.Float(), nullable=True),
        sa.Column("context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "activity_id", "reason", name="uq_points_ledger_ride_reason",
        ),
    )
    op.create_index(
        op.f("ix_points_ledger_user_id"), "points_ledger", ["user_id"], unique=False,
    )
    op.create_index(
        op.f("ix_points_ledger_created_at"),
        "points_ledger",
        ["created_at"],
        unique=False,
    )

    for table in ("wallets", "points_ledger"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(
            f"""
            CREATE POLICY user_isolation ON {table}
                USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
            """
        )


def downgrade() -> None:
    for table in ("points_ledger", "wallets"):
        op.execute(f"DROP POLICY IF EXISTS user_isolation ON {table};")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_points_ledger_created_at"), table_name="points_ledger")
    op.drop_index(op.f("ix_points_ledger_user_id"), table_name="points_ledger")
    op.drop_table("points_ledger")
    op.drop_table("wallets")
