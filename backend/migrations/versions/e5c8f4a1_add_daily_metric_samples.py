"""add daily_metric_samples hypertable with RLS and HRV backfill

Revision ID: e5c8f4a1
Revises: d2f9b4c7a1e5
Create Date: 2026-04-19 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5c8f4a1'
down_revision: Union[str, Sequence[str], None] = 'd2f9b4c7a1e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the table with composite PK (id, recorded_at) for TimescaleDB
    op.execute("""
        CREATE TABLE daily_metric_samples (
            id          BIGSERIAL        NOT NULL,
            recorded_at TIMESTAMPTZ      NOT NULL,
            user_id     INTEGER          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            metric_type VARCHAR(20)      NOT NULL,
            value       DOUBLE PRECISION NOT NULL,
            created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
            PRIMARY KEY (id, recorded_at)
        );
    """)

    # Convert to TimescaleDB hypertable partitioned on recorded_at (7-day chunks)
    op.execute("""
        SELECT create_hypertable(
            'daily_metric_samples',
            'recorded_at',
            chunk_time_interval => INTERVAL '7 days',
            if_not_exists => TRUE
        );
    """)

    # Indexes for common query patterns
    op.execute("""
        CREATE INDEX ix_daily_metric_samples_user_type_time
            ON daily_metric_samples (user_id, metric_type, recorded_at DESC);
    """)
    op.execute("""
        CREATE INDEX ix_daily_metric_samples_user_time
            ON daily_metric_samples (user_id, recorded_at DESC);
    """)

    # Row-Level Security — same pattern as planned_workouts / athlete_profiles
    op.execute("ALTER TABLE daily_metric_samples ENABLE ROW LEVEL SECURITY;")
    op.execute("""
        CREATE POLICY user_isolation ON daily_metric_samples
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
    """)

    # Backfill HRV intraday samples from existing raw_data stored in daily_metrics.
    # daily_metrics.raw_data->'hrv'->'hrvReadings' is a JSON array of:
    #   { "readingTimeGMT": "2026-04-19T00:03:43.0", "hrvValue": 62 }
    # readingTimeGMT is UTC without tz suffix — cast to timestamptz treats it as UTC.
    op.execute("""
        INSERT INTO daily_metric_samples (recorded_at, user_id, metric_type, value)
        SELECT
            (reading->>'readingTimeGMT')::timestamptz   AS recorded_at,
            dm.user_id                                   AS user_id,
            'hrv'                                        AS metric_type,
            (reading->>'hrvValue')::double precision     AS value
        FROM daily_metrics dm,
             jsonb_array_elements(dm.raw_data->'hrv'->'hrvReadings') reading
        WHERE dm.raw_data->'hrv'->'hrvReadings' IS NOT NULL
          AND (reading->>'hrvValue') IS NOT NULL
          AND (reading->>'readingTimeGMT') IS NOT NULL
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON daily_metric_samples;")
    op.execute("ALTER TABLE daily_metric_samples DISABLE ROW LEVEL SECURITY;")
    # Dropping a hypertable cascades to all its chunks automatically
    op.execute("DROP TABLE IF EXISTS daily_metric_samples;")
