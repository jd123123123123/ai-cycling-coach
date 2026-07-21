"""add ride_feedback (post-ride RPE)

Revision ID: rf9a1b2c3d4e
Revises: dl5c6d7e8f9a
Create Date: 2026-07-21 09:00:00.000000

One row per (user, activity) holding the athlete's 1-tap post-ride RPE from the
V3 Ride Recap. Ownership via user_id + RLS (same pattern as race_debriefs).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "rf9a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "dl5c6d7e8f9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ride_feedback",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.BigInteger(), nullable=False),
        sa.Column("rpe", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "activity_id", name="uq_ride_feedback_user_activity"
        ),
    )
    op.create_index(
        op.f("ix_ride_feedback_user_id"), "ride_feedback", ["user_id"], unique=False,
    )

    op.execute("ALTER TABLE ride_feedback ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON ride_feedback
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON ride_feedback;")
    op.execute("ALTER TABLE ride_feedback DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_ride_feedback_user_id"), table_name="ride_feedback")
    op.drop_table("ride_feedback")
