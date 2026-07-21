"""add detail_level to athlete_profiles

Revision ID: dl5c6d7e8f9a
Revises: qs3d8e2f4a6b
Create Date: 2026-07-21 00:00:00.000000

Persists the onboarding depth selector ('guide' | 'numbers' | 'pro') so the
choice follows the athlete across devices — Settings "Detailgrad" reads and
writes the same field. Previously localStorage-only, which reset to the
default on every new device.

    detail_level  VARCHAR(10) NULL
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "dl5c6d7e8f9a"
down_revision: Union[str, Sequence[str], None] = "qs3d8e2f4a6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "athlete_profiles",
        sa.Column("detail_level", sa.String(length=10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("athlete_profiles", "detail_level")
