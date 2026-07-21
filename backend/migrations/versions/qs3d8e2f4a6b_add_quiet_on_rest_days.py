"""add quiet_on_rest_days to athlete_profiles

Revision ID: qs3d8e2f4a6b
Revises: pe2b7c9d4e1f
Create Date: 2026-07-20 00:00:00.000000

V3 Settings toggle: when true, coach push notices (plan-adaptation push,
morning brief) are suppressed on days whose plan is rest. Default ON —
the rest-day contract is "no pressure".

    quiet_on_rest_days  BOOLEAN NOT NULL DEFAULT true
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "qs3d8e2f4a6b"
down_revision: Union[str, Sequence[str], None] = "pe2b7c9d4e1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "athlete_profiles",
        sa.Column(
            "quiet_on_rest_days",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("athlete_profiles", "quiet_on_rest_days")
