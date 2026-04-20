"""coach_briefs prescribed_workout + alternates (Phase 5.1)

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-04-20 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -------------------------------------------------------------------
    # Phase 5.1: prescription-mode coach brief
    #
    # - Add prescribed_workout JSONB (one precisely structured workout)
    # - Add alternates JSONB (exactly 2 fallbacks: less_time + recover)
    # - Relax `options` to NULLABLE (keep column for rollback / reading
    #   pre-5.1 rows; new generations set it to NULL)
    # -------------------------------------------------------------------
    op.execute(
        "ALTER TABLE coach_briefs "
        "ADD COLUMN IF NOT EXISTS prescribed_workout JSONB;"
    )
    op.execute(
        "ALTER TABLE coach_briefs "
        "ADD COLUMN IF NOT EXISTS alternates JSONB;"
    )
    op.execute(
        "ALTER TABLE coach_briefs ALTER COLUMN options DROP NOT NULL;"
    )


def downgrade() -> None:
    # Restore NOT NULL on options (pre-5.1 rows always had it). Any rows with
    # NULL options must be backfilled first; in practice the only rows in
    # prod are post-5.1 so we fill with an empty array as a safe default.
    op.execute(
        "UPDATE coach_briefs SET options = '[]'::jsonb WHERE options IS NULL;"
    )
    op.execute(
        "ALTER TABLE coach_briefs ALTER COLUMN options SET NOT NULL;"
    )
    op.execute("ALTER TABLE coach_briefs DROP COLUMN IF EXISTS alternates;")
    op.execute("ALTER TABLE coach_briefs DROP COLUMN IF EXISTS prescribed_workout;")
