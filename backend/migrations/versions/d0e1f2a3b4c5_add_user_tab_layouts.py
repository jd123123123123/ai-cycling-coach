"""add user_tab_layouts table

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-06-24 00:00:00.000000

Per-user card ordering/visibility for the fixed dashboard tabs. One row per
user; layouts stored as a JSON blob keyed by tab id. Ownership via user_id +
RLS (same pattern as user_dashboards).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, Sequence[str], None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_tab_layouts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("layouts", sa.JSON(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_user_tab_layouts_user_id"),
        "user_tab_layouts",
        ["user_id"],
        unique=True,
    )

    op.execute("ALTER TABLE user_tab_layouts ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON user_tab_layouts
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON user_tab_layouts;")
    op.execute("ALTER TABLE user_tab_layouts DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_user_tab_layouts_user_id"), table_name="user_tab_layouts")
    op.drop_table("user_tab_layouts")
