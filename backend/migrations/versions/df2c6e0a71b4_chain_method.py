"""How the rider maintains their chain.

"Wann hast du zuletzt geölt ODER GEWACHST" is one question with two very
different answers behind it. A wet-lubed chain is degreased and re-oiled; a waxed
one is dunked in melted paraffin — a different action, on a different interval,
leaving a different drivetrain behind. Treating them as one job gets both wrong,
so the chain's interval, its action word and its fresh-drivetrain threshold all
follow the rider's own method.

NULL means oil, which is what most bicycles arrive with. Not a judgement — the
common case, and the one that needs no question asked.

Only the chain reads this today, but the column is on every component row
because it costs nothing there and a future part (tyre sealant vs tubes, disc vs
rim) would want the same shape.

Revision ID: df2c6e0a71b4
Revises: ce1a8b4d09f2
"""
import sqlalchemy as sa
from alembic import op

revision = "df2c6e0a71b4"
down_revision = "ce1a8b4d09f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bike_components",
        sa.Column("method", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bike_components", "method")
