"""add coach_recommendations table

Revision ID: a1b2c3d4e5f6
Revises: c8e3f2a9b1d4
Create Date: 2026-05-03 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "c8e3f2a9b1d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "coach_recommendations",
        sa.Column("id", sa.BigInteger(), nullable=False, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("template_id", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("predicted_tss", sa.Integer(), nullable=False),
        sa.Column("framework_cited", sa.String(length=120), nullable=True),
        sa.Column("blocks", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("why_this_workout", sa.Text(), nullable=True),
        sa.Column("source_brief_id", sa.BigInteger(), nullable=True),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("eval_grade", sa.String(length=30), nullable=True),
        sa.Column("eval_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_brief_id"], ["coach_briefs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Single-column index on user_id (for FK joins / RLS predicate).
    op.create_index(
        op.f("ix_coach_recommendations_user_id"),
        "coach_recommendations",
        ["user_id"],
        unique=False,
    )
    # Single-column index on target_date (for "what's prescribed today" scans).
    op.create_index(
        op.f("ix_coach_recommendations_target_date"),
        "coach_recommendations",
        ["target_date"],
        unique=False,
    )
    # Composite index — primary lookup pattern from ride_compliance.score():
    #   WHERE user_id = :uid AND target_date = :d
    op.create_index(
        "ix_coach_recommendations_user_date",
        "coach_recommendations",
        ["user_id", "target_date"],
        unique=False,
    )
    # FK helper index for source_brief_id back-references.
    op.create_index(
        op.f("ix_coach_recommendations_source_brief_id"),
        "coach_recommendations",
        ["source_brief_id"],
        unique=False,
    )

    # RLS — match the pattern used by athlete_profiles / activities / user_dashboards.
    op.execute("ALTER TABLE coach_recommendations ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON coach_recommendations
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON coach_recommendations;")
    op.execute("ALTER TABLE coach_recommendations DISABLE ROW LEVEL SECURITY;")
    op.drop_index(
        op.f("ix_coach_recommendations_source_brief_id"),
        table_name="coach_recommendations",
    )
    op.drop_index(
        "ix_coach_recommendations_user_date",
        table_name="coach_recommendations",
    )
    op.drop_index(
        op.f("ix_coach_recommendations_target_date"),
        table_name="coach_recommendations",
    )
    op.drop_index(
        op.f("ix_coach_recommendations_user_id"),
        table_name="coach_recommendations",
    )
    op.drop_table("coach_recommendations")
