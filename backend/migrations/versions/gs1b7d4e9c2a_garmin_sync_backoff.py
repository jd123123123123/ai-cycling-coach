"""garmin sync: backoff instead of disabling, and gates for the costly work

Revision ID: gs1b7d4e9c2a
Revises: ch5e1d2a9b3f
Create Date: 2026-08-25

A rate limit used to disable a rider's sync permanently, because
`GarminRateLimitError` subclassed `GarminAuthError`. `backoff_until` is what a
transient refusal earns instead: the rider stays enabled and the sweep skips
them until it passes.

`metrics_synced_at` and `maintenance_at` gate the two expensive halves of a
sync so the every-minute run stops re-asking Garmin the same questions.
"""
from alembic import op
import sqlalchemy as sa

revision = "gs1b7d4e9c2a"
down_revision = "ch5e1d2a9b3f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "garmin_credentials",
        sa.Column("backoff_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "garmin_credentials",
        sa.Column("metrics_synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "garmin_credentials",
        sa.Column("maintenance_at", sa.DateTime(timezone=True), nullable=True),
    )

    # THE RIDERS THIS BUG ALREADY SWITCHED OFF.
    # Every credential in production was sync_enabled = false on 2026-08-25 —
    # two of them still reading sync_status = 'ok', because the manual sync
    # button ignores the flag and resets the status on its way past. Turning
    # them back on is part of the fix, not a separate chore: without this the
    # code change lands and nobody's data starts moving again.
    #
    # Scoped to exactly that shape. A credential disabled for a genuinely bad
    # password reads 'auth_error' and is left alone — that one really does need
    # the rider to reconnect.
    op.execute(
        """
        UPDATE garmin_credentials
           SET sync_enabled = true
         WHERE sync_enabled = false
           AND (sync_status IS NULL OR sync_status <> 'auth_error')
        """
    )


def downgrade() -> None:
    op.drop_column("garmin_credentials", "maintenance_at")
    op.drop_column("garmin_credentials", "metrics_synced_at")
    op.drop_column("garmin_credentials", "backoff_until")
