"""engine_decisions: record what the adaptation engine decided, and from what

Revision ID: gb3d9e2f7a1c
Revises: ga2c8f1e6b3d
Create Date: 2026-08-25

The scientific audit of the training engine found that its central weakness was
not any single threshold but that **no part of it has ever been tested against
an outcome**. The engine makes strong present-tense claims from a chain of
unvalidated thresholds and never asks whether the athlete who was told "green
light, load hard" actually trained well the next day.

That study cannot be run retrospectively on data nobody kept. The daily verdict
and every input behind it were computed, rendered and discarded: `coach_briefs`
keeps prose, `plan_adaptations` keeps plan CHANGES, and neither records the
decision or its evidence. This table is the instrument that makes the research
programme possible at all — the first move toward defensibility is not a better
model, it is a measurement.

One row per (user_id, date), upserted, so the engine's many runs per day leave
the decision that stood. `evidence` is JSONB because the input vector will grow
and a new study field should not need a migration. `engine_version` is stamped
at write time because a cohort mixing days from different decision rules is not
a cohort, and the mixing is invisible afterwards.

Nothing athlete-facing reads this table.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "gb3d9e2f7a1c"
down_revision = "ga2c8f1e6b3d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "engine_decisions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
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
        sa.Column("engine_version", sa.String(length=32), nullable=False),
        sa.Column("directive", sa.String(length=16), nullable=True),
        sa.Column("intensity_ceiling", sa.String(length=16), nullable=True),
        sa.Column("volume_modifier", sa.Float(), nullable=True),
        sa.Column("hrv_state", sa.String(length=16), nullable=True),
        sa.Column("readiness_score", sa.Integer(), nullable=True),
        sa.Column("readiness_tier", sa.String(length=16), nullable=True),
        sa.Column("push_intensity", sa.String(length=16), nullable=True),
        sa.Column(
            "evidence",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "date", name="uq_engine_decisions_user_date"),
    )
    op.create_index(
        "ix_engine_decisions_user_id", "engine_decisions", ["user_id"], unique=False
    )
    op.create_index("ix_engine_decisions_date", "engine_decisions", ["date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_engine_decisions_date", table_name="engine_decisions")
    op.drop_index("ix_engine_decisions_user_id", table_name="engine_decisions")
    op.drop_table("engine_decisions")
