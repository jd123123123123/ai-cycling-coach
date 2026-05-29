"""add user_dashboards table

Revision ID: c8e3f2a9b1d4
Revises: b9c4d1e8f2a3
Create Date: 2026-04-29 09:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c8e3f2a9b1d4"
down_revision: Union[str, Sequence[str], None] = "b9c4d1e8f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_dashboards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=400), nullable=True),
        sa.Column("layout", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("charts", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_user_dashboards_user_id"),
        "user_dashboards",
        ["user_id"],
        unique=False,
    )

    # RLS — same pattern as planned_workouts / athlete_profiles
    op.execute("ALTER TABLE user_dashboards ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON user_dashboards
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON user_dashboards;")
    op.execute("ALTER TABLE user_dashboards DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_user_dashboards_user_id"), table_name="user_dashboards")
    op.drop_table("user_dashboards")
