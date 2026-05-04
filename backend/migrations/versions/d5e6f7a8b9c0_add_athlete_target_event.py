"""add_athlete_target_event

Revision ID: d5e6f7a8b9c0
Revises: b2c3d4e5f6a7
Create Date: 2026-05-03 00:00:00.000000

Adds three first-class columns to athlete_profiles for the periodization
engine (Phase 7). Previously this data lived inside the goals JSONB blob;
promoting to columns gives the mesocycle generator a typed contract and
avoids JSON-key drift.

  target_event_date  - ISO date of the A/B/C event (nullable; null = maintenance)
  target_event_type  - 'race' | 'fondo' | 'audax' | 'maintenance'
  target_priority    - 'A' | 'B' | 'C' priority tier

All columns are nullable so existing rows remain valid without a backfill.
The legacy goals JSONB is NOT touched (back-compat: old code can still read
goals.target_event_date; future cleanup plan will consolidate).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d5e6f7a8b9c0"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "athlete_profiles",
        sa.Column("target_event_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "athlete_profiles",
        sa.Column("target_event_type", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "athlete_profiles",
        sa.Column("target_priority", sa.String(length=1), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("athlete_profiles", "target_priority")
    op.drop_column("athlete_profiles", "target_event_type")
    op.drop_column("athlete_profiles", "target_event_date")
