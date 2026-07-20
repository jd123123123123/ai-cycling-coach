"""add plan_adaptations — append-only, athlete-visible plan-change log

Revision ID: pa54170d1dab
Revises: b8d1c2e3f4a5
Create Date: 2026-07-20 00:00:00.000000

Plan-engine v2: every material change the adaptive engine makes (hourly
signal-driven, post-workout, user-initiated) lands here with its driving
signal, before→after diff and bilingual athlete-facing message. Feeds the
Today/Plan adaptation timelines. Append-only by convention.
Ownership via user_id + RLS (same pattern as period_reports / coach_briefs).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "pa54170d1dab"
down_revision: Union[str, Sequence[str], None] = "b8d1c2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plan_adaptations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("source", sa.String(length=24), nullable=False),
        sa.Column("signal", sa.String(length=40), nullable=False),
        sa.Column("rule", sa.String(length=60), nullable=False),
        sa.Column("before", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("message_de", sa.String(length=400), nullable=False),
        sa.Column("message_en", sa.String(length=400), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_plan_adaptations_user_id"), "plan_adaptations", ["user_id"], unique=False,
    )
    op.create_index(
        op.f("ix_plan_adaptations_target_date"), "plan_adaptations", ["target_date"], unique=False,
    )

    op.execute("ALTER TABLE plan_adaptations ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON plan_adaptations
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON plan_adaptations;")
    op.execute("ALTER TABLE plan_adaptations DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_plan_adaptations_target_date"), table_name="plan_adaptations")
    op.drop_index(op.f("ix_plan_adaptations_user_id"), table_name="plan_adaptations")
    op.drop_table("plan_adaptations")
