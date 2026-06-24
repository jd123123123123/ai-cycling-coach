"""add period_reports cache table

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-06-24 00:00:00.000000

Per-(user, days) cached PeriodReport payloads. One row per window per user
(unique user_id+days). Ownership via user_id + RLS (same pattern as
coach_briefs / user_tab_layouts).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "period_reports",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("report", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "days", name="uq_period_reports_user_days"),
    )
    op.create_index(
        op.f("ix_period_reports_user_id"), "period_reports", ["user_id"], unique=False,
    )

    op.execute("ALTER TABLE period_reports ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON period_reports
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON period_reports;")
    op.execute("ALTER TABLE period_reports DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_period_reports_user_id"), table_name="period_reports")
    op.drop_table("period_reports")
