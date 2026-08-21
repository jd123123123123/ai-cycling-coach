"""the sealed chest: a ride's coins wait in the ledger until the rider opens them

Revision ID: ch5e1d2a9b3f
Revises: e7b2c9d4a015
Create Date: 2026-08-21 12:10:00.000000

Until now a ride's RideCoin moved the balance the moment the ride synced, and
the celebration screen's "slide to claim" was theatre — the coins were already
in the wallet before the rider ever saw the screen. That is the one thing a
reward loop cannot afford: the payoff has to land WHEN the rider acts.

So the ledger keeps recording the truth ("earned at ingestion") and gains one
column that says whether the line has reached the wallet yet. NULL means the
coins are sitting in the ride's chest; a stamp means they are banked and
counted in `wallets.balance`.

THE BACKFILL IS THE LOAD-BEARING PART. Every existing line is already in the
balance, so all of them are stamped with their own `created_at`. Without that,
the first claim would pay a rider their entire history a second time.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ch5e1d2a9b3f"
down_revision: Union[str, Sequence[str], None] = "e7b2c9d4a015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "points_ledger",
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Everything written before this migration is already banked.
    op.execute("UPDATE points_ledger SET claimed_at = created_at WHERE claimed_at IS NULL;")
    # The Today screen asks "is there an unclaimed ride?" on every load, so the
    # index is partial: it covers exactly the handful of rows that are NULL and
    # ignores the rider's whole banked history.
    op.execute(
        """
        CREATE INDEX ix_points_ledger_unclaimed
            ON points_ledger (user_id, activity_id)
            WHERE claimed_at IS NULL;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_points_ledger_unclaimed;")
    op.drop_column("points_ledger", "claimed_at")
