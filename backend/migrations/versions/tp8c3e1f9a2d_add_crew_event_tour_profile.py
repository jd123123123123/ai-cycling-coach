"""add crew_events tour profile / descent / max grade

Three nullable columns caching the richer GPX summary the crew-event detail page
renders (the Social card only ever needed polyline + distance + ascent):

    tour_profile        JSONB  [[cumulative_distance_m, elevation_m], …], ≤120
                               points — the elevation-profile chart's series.
                               NULL when the uploaded GPX carried no <ele> data,
                               so the chart can hide instead of drawing a fake
                               flat line at zero.
    tour_descent_m      FLOAT  total descent in metres, as a positive number.
    tour_max_grade_pct  FLOAT  steepest gradient sustained over ≥100 m of travel
                               (a per-point delta is barometric noise, not a
                               gradient — see app/services/crew_tour.py).

All nullable with no backfill: the values are derived from the raw GPX, which
lives on the tour volume, and existing rows simply re-populate on the next
upload. Crew-shared data, so — like the rest of crew_events — no RLS policy.

Revision ID: tp8c3e1f9a2d
Revises: f7a1c2b3d4e5
Create Date: 2026-07-28 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "tp8c3e1f9a2d"
down_revision: Union[str, Sequence[str], None] = "f7a1c2b3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "crew_events",
        sa.Column("tour_profile", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("crew_events", sa.Column("tour_descent_m", sa.Float(), nullable=True))
    op.add_column(
        "crew_events", sa.Column("tour_max_grade_pct", sa.Float(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("crew_events", "tour_max_grade_pct")
    op.drop_column("crew_events", "tour_descent_m")
    op.drop_column("crew_events", "tour_profile")
