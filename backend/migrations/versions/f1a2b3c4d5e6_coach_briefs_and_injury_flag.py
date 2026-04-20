"""coach_briefs table and injury flag on athlete_profiles

Revision ID: f1a2b3c4d5e6
Revises: e5c8f4a1
Create Date: 2026-04-20 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'e5c8f4a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -------------------------------------------------------------------
    # coach_briefs — cached AI briefs, 6h read-through TTL per user.
    # We keep history (never overwrite) so every generation is auditable;
    # get_or_generate_brief simply reads the most-recent row and regenerates
    # if it's older than COACH_BRIEF_CACHE_HOURS.
    # -------------------------------------------------------------------
    op.execute("""
        CREATE TABLE coach_briefs (
            id               BIGSERIAL    PRIMARY KEY,
            user_id          INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            generated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            verdict          TEXT         NOT NULL,
            rationale        TEXT         NOT NULL,
            evidence         JSONB        NOT NULL,
            options          JSONB        NOT NULL,
            outlook_7d       JSONB,
            frameworks_cited TEXT[],
            raw_prompt       TEXT,
            model_used       VARCHAR(50)  NOT NULL
        );
    """)
    op.execute("""
        CREATE INDEX idx_coach_briefs_user_generated
            ON coach_briefs(user_id, generated_at DESC);
    """)

    # RLS — same pattern as planned_workouts / daily_metric_samples
    op.execute("ALTER TABLE coach_briefs ENABLE ROW LEVEL SECURITY;")
    op.execute("""
        CREATE POLICY coach_briefs_owner_isolation ON coach_briefs
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
    """)

    # -------------------------------------------------------------------
    # athlete_profiles: injury_flag + injury_note
    # injury_flag=TRUE forces safety_rails.intensity_ceiling to 'rest' regardless
    # of any other signal — first-match-wins rule 1.
    # -------------------------------------------------------------------
    op.execute("""
        ALTER TABLE athlete_profiles
            ADD COLUMN IF NOT EXISTS injury_flag BOOLEAN NOT NULL DEFAULT FALSE;
    """)
    op.execute("""
        ALTER TABLE athlete_profiles
            ADD COLUMN IF NOT EXISTS injury_note TEXT;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE athlete_profiles DROP COLUMN IF EXISTS injury_note;")
    op.execute("ALTER TABLE athlete_profiles DROP COLUMN IF EXISTS injury_flag;")

    op.execute("DROP POLICY IF EXISTS coach_briefs_owner_isolation ON coach_briefs;")
    op.execute("ALTER TABLE coach_briefs DISABLE ROW LEVEL SECURITY;")
    op.execute("DROP INDEX IF EXISTS idx_coach_briefs_user_generated;")
    op.execute("DROP TABLE IF EXISTS coach_briefs;")
