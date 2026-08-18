"""garage_loadout.bike_id becomes nullable (the first bike is claimed, not given)

Revision ID: cl9b2e7f4a1d
Revises: sh7d4e1f9c2a3
Create Date: 2026-08-18 12:00:00.000000

The starter bike used to be auto-granted on the first `GET /shop`, so every
loadout row was born with a bike in it and NOT NULL was free. It is now claimed
(`POST /shop/claim/{item_id}`), and a rider who has claimed nothing owns only
the free stock parts — equipping one of those creates their loadout row before
any bike exists.

DATA-SAFE BY CONSTRUCTION: dropping a NOT NULL rewrites no rows and rejects
nothing that was previously valid. Every rider already carrying an auto-granted
`rustbucket` keeps their row exactly as it is.

The downgrade cannot simply re-add the constraint — by then some rows may
legitimately hold NULL — so it drops those bikeless rows first. That is the only
correct reversal: a loadout with no bike cannot be represented under NOT NULL,
and the parts in it are still owned in `garage_items` either way.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "cl9b2e7f4a1d"
down_revision: Union[str, Sequence[str], None] = "sh7d4e1f9c2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "garage_loadout",
        "bike_id",
        existing_type=sa.String(length=48),
        nullable=True,
    )


def downgrade() -> None:
    op.execute("DELETE FROM garage_loadout WHERE bike_id IS NULL;")
    op.alter_column(
        "garage_loadout",
        "bike_id",
        existing_type=sa.String(length=48),
        nullable=False,
    )
