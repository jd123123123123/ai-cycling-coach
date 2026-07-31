"""target_event_gpx

Revision ID: b9d106ca0f6e
Revises: 914be70dbda3
Create Date: 2026-07-31 01:57:39.114569

The official GPX of the athlete's target event, so a rehearsal can project a
time on the ACTUAL course rather than on a route that merely resembles it.
Nullable text: an athlete who has not uploaded one simply has no target-event
rehearsal, never a fabricated course.

No RLS change is needed -- athlete_profiles already carries its user_isolation
policy, and a policy is per ROW, not per column, so the new column inherits it.

── What autogenerate proposed, and what was deleted ──────────────────────────
`alembic revision --autogenerate` also proposed, in this order:

    op.drop_table('achievements')
    op.drop_table('race_debriefs')
    op.alter_column('coach_briefs', 'frameworks_cited', ARRAY(TEXT)->ARRAY(String))
    op.create_index('ix_coach_briefs_user_id', ...)
    op.create_index('ix_daily_metric_samples_metric_type', ...)
    op.create_index('ix_daily_metric_samples_user_id', ...)
    op.create_table_comment('mesocycle_plans', ...)
    op.create_index('ix_planned_workouts_id', ...)
    op.create_index('ix_user_dashboards_id', ...)
    op.create_index('ix_user_tab_layouts_id', ...)

Every one of those is an artefact of migrations/env.py importing only a subset
of the models, so tables it never sees look "removed" and models it does see
look out of date. The two drop_table lines would have destroyed live data.
ALL of it is deleted; this migration adds one column and nothing else.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b9d106ca0f6e'
down_revision: Union[str, Sequence[str], None] = '914be70dbda3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'athlete_profiles', sa.Column('target_event_gpx', sa.Text(), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('athlete_profiles', 'target_event_gpx')
