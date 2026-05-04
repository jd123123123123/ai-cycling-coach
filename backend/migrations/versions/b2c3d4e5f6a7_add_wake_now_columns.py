"""add wake/now biometric columns to daily_metrics

Adds 8 nullable columns to support the wake-vs-now snapshot surface
introduced in today-runthrough Step 5. The columns are populated by the
biometrics_snapshot service from the daily_metric_samples hypertable
(intraday) and from Garmin's training_readiness endpoint.

All columns are nullable — historic rows backfill as None and the
service tolerates missing values gracefully.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-03 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # All-nullable so existing rows in the hypertable keep working.
    op.add_column(
        "daily_metrics",
        sa.Column("body_battery_wake", sa.Integer(), nullable=True),
    )
    op.add_column(
        "daily_metrics",
        sa.Column("body_battery_now", sa.Integer(), nullable=True),
    )
    op.add_column(
        "daily_metrics",
        sa.Column("body_battery_now_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "daily_metrics",
        sa.Column("stress_wake", sa.Integer(), nullable=True),
    )
    op.add_column(
        "daily_metrics",
        sa.Column("stress_now", sa.Integer(), nullable=True),
    )
    op.add_column(
        "daily_metrics",
        sa.Column("hrv_overnight_avg", sa.Integer(), nullable=True),
    )
    op.add_column(
        "daily_metrics",
        sa.Column("training_readiness", sa.Integer(), nullable=True),
    )
    op.add_column(
        "daily_metrics",
        sa.Column("recovery_time_hours", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("daily_metrics", "recovery_time_hours")
    op.drop_column("daily_metrics", "training_readiness")
    op.drop_column("daily_metrics", "hrv_overnight_avg")
    op.drop_column("daily_metrics", "stress_now")
    op.drop_column("daily_metrics", "stress_wake")
    op.drop_column("daily_metrics", "body_battery_now_at")
    op.drop_column("daily_metrics", "body_battery_now")
    op.drop_column("daily_metrics", "body_battery_wake")
