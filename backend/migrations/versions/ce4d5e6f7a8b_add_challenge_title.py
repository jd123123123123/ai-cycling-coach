"""add challenge_enrollments.title (for rider-created custom challenges)

Revision ID: ce4d5e6f7a8b
Revises: rf3c4d5e6f7a
Create Date: 2026-08-13 09:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ce4d5e6f7a8b"
down_revision: Union[str, Sequence[str], None] = "rf3c4d5e6f7a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "challenge_enrollments",
        sa.Column("title", sa.String(length=80), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("challenge_enrollments", "title")
