"""garmin sync: count auth failures, and bring back the riders one of them disabled

Revision ID: ga2c8f1e6b3d
Revises: gs1b7d4e9c2a
Create Date: 2026-08-25

The previous migration re-enabled the riders that a RATE LIMIT had switched off.
Within a minute both were off again — this time with a real `GarminAuthError`,
sixty seconds after those same credentials had authenticated and pulled seven
rides. Two causes, both now fixed in code:

  · the client mapped EVERY unexpected exception during login onto
    `GarminAuthError`, so a network blip read as a wrong password;
  · the sync disabled a rider on the FIRST auth failure, and Garmin's login sits
    behind bot detection that refuses intermittently.

`auth_failures` is the counter that makes the second one impossible: three in a
row, with a growing backoff between them, before anybody is switched off.
"""
from alembic import op
import sqlalchemy as sa

revision = "ga2c8f1e6b3d"
down_revision = "gs1b7d4e9c2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "garmin_credentials",
        sa.Column(
            "auth_failures", sa.Integer(), nullable=False, server_default="0"
        ),
    )

    # BACK ON — but only where there is EVIDENCE the credential works, which is
    # a successful sync within the last day. Both riders disabled on 2026-08-25
    # completed a full sync minutes beforehand; that is the proof, and it is a
    # far better signal than `sync_status`, which the manual sync button
    # overwrites on its way past. A credential that has not synced in weeks is
    # left alone for its owner to reconnect.
    op.execute(
        """
        UPDATE garmin_credentials
           SET sync_enabled = true,
               auth_failures = 0,
               backoff_until = NULL
         WHERE sync_enabled = false
           AND last_sync_at IS NOT NULL
           AND last_sync_at > NOW() - INTERVAL '1 day'
        """
    )


def downgrade() -> None:
    op.drop_column("garmin_credentials", "auth_failures")
