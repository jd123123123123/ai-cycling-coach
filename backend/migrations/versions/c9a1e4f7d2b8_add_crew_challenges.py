"""add crew_challenges

Adds the crew_challenges table backing custom crew challenges — a crew member
defines a metric + target over a period and the app tracks each member's
progress toward it.

Revision ID: c9a1e4f7d2b8
Revises: b7f3c2d1a9e4
Create Date: 2026-07-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9a1e4f7d2b8"
down_revision: Union[str, Sequence[str], None] = "b7f3c2d1a9e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crew_challenges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("crew_id", sa.Integer(), nullable=False),
        sa.Column("creator_user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("metric", sa.String(length=20), nullable=False),
        sa.Column("target", sa.Float(), nullable=False),
        sa.Column("period", sa.String(length=20), nullable=False, server_default="week"),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "archived", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.ForeignKeyConstraint(["crew_id"], ["crews.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["creator_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_crew_challenges_id", "crew_challenges", ["id"], unique=False)
    op.create_index(
        "ix_crew_challenges_crew_id", "crew_challenges", ["crew_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_crew_challenges_crew_id", table_name="crew_challenges")
    op.drop_index("ix_crew_challenges_id", table_name="crew_challenges")
    op.drop_table("crew_challenges")
