"""add sleep-vitals columns to daily_metrics + backfill from stored raw payloads

Adds 13 nullable columns for the sleep stages / SpO₂ / respiration vitals that
Garmin's free sleep payload already delivers (we were storing the payload in
raw_data but never surfacing the fields as columns), then backfills every
existing row from its stored raw_data — no Garmin API calls needed.

Also backfills the pre-existing (never populated) hrv_overnight_avg column
from the sleep payload's top-level avgOvernightHrv.

Hypertable + RLS safety:
- daily_metrics is a TimescaleDB hypertable — additive nullable columns only,
  and the backfill UPDATE never touches user_id or recorded_at (the partition
  column), so no row can cross a chunk boundary.
- The table has ROW LEVEL SECURITY enabled (user_isolation policy) but not
  FORCE RLS; migrations run as the table owner, which bypasses the policy, so
  the backfill covers every user's rows without needing app.current_user_id.
- Backfill casts go through ::numeric + round() for integer targets because
  Garmin mixes ints and floats ("84.0") per field; a direct ::int would abort
  the migration on float-formatted strings.

Honesty rules (mirrors services/garmin_sleep_parser.py):
- Only rows whose payload shows a genuinely tracked night
  (sleepTimeSeconds > 0) get stage/vitals values — no fabricated zeros.
- REM seconds are left NULL when deviceRemCapable is false (an incapable
  device reports 0, which means "unknown", not "no REM").
- No skin-temperature column: the free feed reports skinTempDataExists=false.

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-07-18 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f3a4b5c6d7e8"
down_revision: str | Sequence[str] | None = "e2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_INT_COLUMNS = (
    "sleep_total_s",
    "sleep_deep_s",
    "sleep_light_s",
    "sleep_rem_s",
    "sleep_awake_s",
    "sleep_awake_count",
    "spo2_low",
    "spo2_high",
)

_FLOAT_COLUMNS = (
    "spo2_avg",
    "respiration_avg",
    "respiration_low",
    "respiration_high",
    "sleep_stress_avg",
)


def upgrade() -> None:
    # All-nullable so existing rows in the hypertable keep working.
    for name in _INT_COLUMNS:
        op.add_column("daily_metrics", sa.Column(name, sa.Integer(), nullable=True))
    for name in _FLOAT_COLUMNS:
        op.add_column("daily_metrics", sa.Column(name, sa.Float(), nullable=True))

    # Backfill sleep stages / SpO₂ / respiration from the raw sleep payload we
    # already store on every row. Guarded to genuinely tracked nights only.
    op.execute(
        """
        UPDATE daily_metrics
        SET
          sleep_total_s     = round((raw_data #>> '{sleep,dailySleepDTO,sleepTimeSeconds}')::numeric)::int,
          sleep_deep_s      = round((raw_data #>> '{sleep,dailySleepDTO,deepSleepSeconds}')::numeric)::int,
          sleep_light_s     = round((raw_data #>> '{sleep,dailySleepDTO,lightSleepSeconds}')::numeric)::int,
          sleep_rem_s       = CASE
                                WHEN (raw_data #>> '{sleep,dailySleepDTO,deviceRemCapable}') = 'false'
                                THEN NULL
                                ELSE round((raw_data #>> '{sleep,dailySleepDTO,remSleepSeconds}')::numeric)::int
                              END,
          sleep_awake_s     = round((raw_data #>> '{sleep,dailySleepDTO,awakeSleepSeconds}')::numeric)::int,
          sleep_awake_count = round((raw_data #>> '{sleep,dailySleepDTO,awakeCount}')::numeric)::int,
          spo2_avg          = (raw_data #>> '{sleep,dailySleepDTO,averageSpO2Value}')::float8,
          spo2_low          = round((raw_data #>> '{sleep,dailySleepDTO,lowestSpO2Value}')::numeric)::int,
          spo2_high         = round((raw_data #>> '{sleep,dailySleepDTO,highestSpO2Value}')::numeric)::int,
          respiration_avg   = (raw_data #>> '{sleep,dailySleepDTO,averageRespirationValue}')::float8,
          respiration_low   = (raw_data #>> '{sleep,dailySleepDTO,lowestRespirationValue}')::float8,
          respiration_high  = (raw_data #>> '{sleep,dailySleepDTO,highestRespirationValue}')::float8,
          sleep_stress_avg  = (raw_data #>> '{sleep,dailySleepDTO,avgSleepStress}')::float8
        WHERE jsonb_typeof(raw_data #> '{sleep,dailySleepDTO}') = 'object'
          AND COALESCE(round((raw_data #>> '{sleep,dailySleepDTO,sleepTimeSeconds}')::numeric)::int, 0) > 0
        """
    )

    # Backfill the pre-existing hrv_overnight_avg column (progressively — only
    # where still NULL) from the sleep payload's top-level avgOvernightHrv.
    op.execute(
        """
        UPDATE daily_metrics
        SET hrv_overnight_avg = round((raw_data #>> '{sleep,avgOvernightHrv}')::numeric)::int
        WHERE hrv_overnight_avg IS NULL
          AND (raw_data #>> '{sleep,avgOvernightHrv}') IS NOT NULL
        """
    )


def downgrade() -> None:
    for name in reversed(_FLOAT_COLUMNS):
        op.drop_column("daily_metrics", name)
    for name in reversed(_INT_COLUMNS):
        op.drop_column("daily_metrics", name)
    # hrv_overnight_avg predates this migration — its backfilled values are
    # left in place (the column itself belongs to b2c3d4e5f6a7).
