"""add challenge_enrollments

Revision ID: ch2b3c4d5e6f
Revises: rc1a2b3c4d5e
Create Date: 2026-08-12 11:00:00.000000

A rider's stake in one monthly challenge (services/challenges.py catalog). One
row per (user, challenge_key, period); the reward is paid once via points_ledger
on completion. RLS-protected via user_id.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ch2b3c4d5e6f"
down_revision: Union[str, Sequence[str], None] = "rc1a2b3c4d5e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "challenge_enrollments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("challenge_key", sa.String(length=48), nullable=False),
        sa.Column("period", sa.String(length=7), nullable=False),
        sa.Column("metric", sa.String(length=20), nullable=False),
        sa.Column("target", sa.Float(), nullable=False),
        sa.Column("tier", sa.String(length=12), nullable=False),
        sa.Column("reward_rc", sa.Integer(), nullable=False),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("awarded_rc", sa.Integer(), nullable=True),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "challenge_key", "period",
            name="uq_challenge_enrollment_user_key_period",
        ),
    )
    op.create_index(
        op.f("ix_challenge_enrollments_user_id"),
        "challenge_enrollments", ["user_id"], unique=False,
    )

    op.execute("ALTER TABLE challenge_enrollments ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON challenge_enrollments
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON challenge_enrollments;")
    op.execute("ALTER TABLE challenge_enrollments DISABLE ROW LEVEL SECURITY;")
    op.drop_index(
        op.f("ix_challenge_enrollments_user_id"),
        table_name="challenge_enrollments",
    )
    op.drop_table("challenge_enrollments")
