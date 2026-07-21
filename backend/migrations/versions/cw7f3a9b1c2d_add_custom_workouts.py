"""add custom_workouts (athlete-authored structured sessions)

Revision ID: cw7f3a9b1c2d
Revises: rf9a1b2c3d4e
Create Date: 2026-07-21 12:00:00.000000

Athlete-authored structured interval workouts from the in-app builder. Blocks
stored as parametric %FTP JSON; TSS/duration cached server-computed. Ownership
via user_id + RLS (same pattern as ride_feedback / race_debriefs).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "cw7f3a9b1c2d"
down_revision: Union[str, Sequence[str], None] = "rf9a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "custom_workouts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column("sport", sa.String(length=30), server_default="cycling", nullable=False),
        sa.Column("blocks", sa.JSON(), nullable=False),
        sa.Column("estimated_tss", sa.Float(), server_default="0", nullable=False),
        sa.Column("estimated_duration_s", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_custom_workouts_user_id"), "custom_workouts", ["user_id"], unique=False,
    )

    op.execute("ALTER TABLE custom_workouts ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON custom_workouts
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON custom_workouts;")
    op.execute("ALTER TABLE custom_workouts DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_custom_workouts_user_id"), table_name="custom_workouts")
    op.drop_table("custom_workouts")
