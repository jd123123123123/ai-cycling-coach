"""add activity_streams table

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-22 00:00:00.000000

Stores per-second power/HR/cadence/altitude streams + the stream-derived science
metrics (MMP curve, NP, decoupling, CP/W'/eFTP) for the Phase 0 science-engine
foundation. Keyed by activity_id; ownership via user_id + RLS (same pattern as
user_dashboards / planned_workouts). No FK to the activities hypertable.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "activity_streams",
        sa.Column("activity_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("streams", sa.JSON(), nullable=False),
        sa.Column("mmp_curve", sa.JSON(), nullable=True),
        sa.Column("normalized_power", sa.Float(), nullable=True),
        sa.Column("decoupling_pct", sa.Float(), nullable=True),
        sa.Column("total_kj", sa.Float(), nullable=True),
        sa.Column("cp_watts", sa.Float(), nullable=True),
        sa.Column("w_prime_j", sa.Float(), nullable=True),
        sa.Column("eftp_watts", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("activity_id"),
    )
    op.create_index(
        op.f("ix_activity_streams_user_id"),
        "activity_streams",
        ["user_id"],
        unique=False,
    )

    # RLS — same pattern as user_dashboards / planned_workouts / athlete_profiles
    op.execute("ALTER TABLE activity_streams ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON activity_streams
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON activity_streams;")
    op.execute("ALTER TABLE activity_streams DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_activity_streams_user_id"), table_name="activity_streams")
    op.drop_table("activity_streams")
