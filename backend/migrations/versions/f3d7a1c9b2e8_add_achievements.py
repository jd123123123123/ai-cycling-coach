"""add_achievements

Revision ID: f3d7a1c9b2e8
Revises: e2f3a4b5c6d7
Create Date: 2026-07-18

Server-detected training milestones: one row per (user, key) with the date of
the triggering ride/day and a JSONB context. Ownership via user_id + RLS
(same pattern as race_debriefs / period_reports).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f3d7a1c9b2e8'
down_revision: Union[str, Sequence[str], None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "achievements",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "key", name="uq_achievements_user_key"),
    )
    op.create_index(
        op.f("ix_achievements_user_id"), "achievements", ["user_id"], unique=False,
    )

    op.execute("ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON achievements
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON achievements;")
    op.execute("ALTER TABLE achievements DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_achievements_user_id"), table_name="achievements")
    op.drop_table("achievements")
