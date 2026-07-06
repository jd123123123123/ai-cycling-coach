"""race_debrief_cache

Revision ID: a0a5245ea569
Revises: 0b63ce61db30
Create Date: 2026-07-06 12:57:10.932168

Per-(user, activity) cached RaceDebrief payloads. One row per activity per
user (unique user_id+activity_id). Ownership via user_id + RLS (same pattern
as period_reports / coach_briefs / user_tab_layouts).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a0a5245ea569'
down_revision: Union[str, Sequence[str], None] = '0b63ce61db30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "race_debriefs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.BigInteger(), nullable=False),
        sa.Column("report", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "activity_id", name="uq_race_debriefs_user_activity"),
    )
    op.create_index(
        op.f("ix_race_debriefs_user_id"), "race_debriefs", ["user_id"], unique=False,
    )

    op.execute("ALTER TABLE race_debriefs ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON race_debriefs
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON race_debriefs;")
    op.execute("ALTER TABLE race_debriefs DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_race_debriefs_user_id"), table_name="race_debriefs")
    op.drop_table("race_debriefs")
