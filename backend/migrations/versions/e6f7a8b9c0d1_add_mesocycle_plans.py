"""add_mesocycle_plans

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-05-04 00:00:00.000000

Creates the ``mesocycle_plans`` table — the output of the periodization
engine (Phase 7.0 Plan 02).  Each row is a 4-week mesocycle for one athlete
anchored at plan_start_date (always a Monday), encoding:

  - Friel phase detected at generation time
  - Issurin 3:1 weekly TSS targets (4-element JSON list)
  - Seiler TID distribution snapshot
  - Audit copy of athlete event date/type at generation time
  - Evidence JSON for debugging (CTL, FTP, days_to_goal)

Row-Level Security mirrors the athlete_profiles policy pattern:
``current_setting('app.current_user_id', true)::INTEGER = user_id``.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: str | Sequence[str] | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create mesocycle_plans table with indexes and RLS."""
    op.create_table(
        "mesocycle_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("plan_start_date", sa.Date(), nullable=False),
        sa.Column("plan_end_date", sa.Date(), nullable=False),
        sa.Column("phase", sa.String(length=20), nullable=False),
        sa.Column("block_index", sa.Integer(), nullable=False),
        sa.Column("weekly_tss_targets", sa.JSON(), nullable=False),
        sa.Column("seiler_distribution", sa.JSON(), nullable=False),
        sa.Column("target_event_date", sa.Date(), nullable=True),
        sa.Column("target_event_type", sa.String(length=20), nullable=True),
        sa.Column("evidence", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "plan_start_date", name="uq_mesocycle_user_start"),
    )
    op.create_index(op.f("ix_mesocycle_plans_id"), "mesocycle_plans", ["id"], unique=False)
    op.create_index(
        op.f("ix_mesocycle_plans_user_id"), "mesocycle_plans", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_mesocycle_plans_plan_start_date"),
        "mesocycle_plans",
        ["plan_start_date"],
        unique=False,
    )
    op.create_index(
        "ix_mesocycle_user_end", "mesocycle_plans", ["user_id", "plan_end_date"], unique=False
    )

    # ----------------------------------------------------------------
    # RLS: Enable Row-Level Security — same pattern as athlete_profiles
    # The policy uses current_setting('app.current_user_id', true) which
    # returns NULL (not an error) when the variable is not set, protecting
    # against unauthenticated access.
    # ----------------------------------------------------------------
    op.execute("ALTER TABLE mesocycle_plans ENABLE ROW LEVEL SECURITY;")
    op.execute("""
        CREATE POLICY user_isolation ON mesocycle_plans
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
    """)


def downgrade() -> None:
    """Drop mesocycle_plans table."""
    op.execute("DROP POLICY IF EXISTS user_isolation ON mesocycle_plans;")
    op.drop_table("mesocycle_plans")
