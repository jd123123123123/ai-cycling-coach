"""add crew_events tour waypoints

One nullable column caching the named pins parsed out of the uploaded GPX's
<wpt> elements:

    tour_waypoints  JSONB  [{"name", "lat", "lng", "sym", "desc"}, …], ≤12
                           entries spread along the route — the labelled pins
                           the crew-event detail map drops ("Starnberger See",
                           "Kloster Andechs"). NULL when the GPX carried no
                           *named* waypoints (unnamed pins are dropped at parse
                           time: an unlabelled dot is noise, see
                           app/services/crew_tour.py), so the map skips the pin
                           layer entirely rather than rendering an empty one.

Nullable with no backfill: the value is derived from the raw GPX, which lives on
the tour volume, and existing rows re-populate on their next upload. Crew-shared
data, so — like the rest of crew_events — no RLS policy.

Revision ID: wp4b7d2e6c1a
Revises: tp8c3e1f9a2d
Create Date: 2026-07-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "wp4b7d2e6c1a"
down_revision: Union[str, Sequence[str], None] = "tp8c3e1f9a2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "crew_events",
        sa.Column(
            "tour_waypoints", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("crew_events", "tour_waypoints")
