"""add activities.elevation_gain_m

Total ascent in metres (Höhenmeter) for a ride. Nullable — a cycling-only
concept left NULL for indoor/no-GPS rides. Surfaced from the Garmin activity
summary at sync time and backfilled from stored raw_data for historical rows.

The `activities` table is a TimescaleDB hypertable; adding a plain nullable
column is a metadata-only change and is safe on hypertables (no chunk rewrite).

Revision ID: el7a2c9d3f4b
Revises: co3d8e2f1a5b
Create Date: 2026-07-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "el7a2c9d3f4b"
down_revision: Union[str, Sequence[str], None] = "co3d8e2f1a5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "activities",
        sa.Column("elevation_gain_m", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("activities", "elevation_gain_m")
