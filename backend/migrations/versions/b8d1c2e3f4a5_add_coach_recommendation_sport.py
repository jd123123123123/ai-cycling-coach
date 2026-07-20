"""add_coach_recommendation_sport

Revision ID: b8d1c2e3f4a5
Revises: 7d54464d26a1
Create Date: 2026-07-20 00:00:00.000000

Adds a nullable `sport` column to coach_recommendations so compliance
grading can enforce the sport gate (usability audit P0-2): a completed
activity is only graded against a prescription when the sport families
match — a gym session must never be graded as a bike Z2 ride.

NULL means 'cycling' (all recommendations predating this column came from
the cycling-only template library), so no backfill is needed — the read
side treats `rec.sport or 'cycling'` as the prescription sport.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8d1c2e3f4a5"
down_revision: str | Sequence[str] | None = "7d54464d26a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "coach_recommendations",
        sa.Column("sport", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("coach_recommendations", "sport")
