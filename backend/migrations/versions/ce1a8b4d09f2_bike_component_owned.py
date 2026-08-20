"""Whether the bicycle even has this part.

Three states, and the third one is the whole reason this column is nullable:

  TRUE   the rider confirmed it (or serviced it), so its clock runs.
  FALSE  they told us they run rim brakes or inner tubes — never ask again.
  NULL   we have never asked, so it is a QUESTION and not a job.

A boolean cannot tell "no" apart from "not yet asked", so with one the app would
either nag a rim-brake rider about brake fluid forever or silently decide for
them. Both are worse than asking once.

Existing rows stay NULL, which is correct: nobody has been asked yet. The two
components this actually gates — `sealant` and `brakefluid` — do not exist in
anyone's table yet either, because rows are created lazily on first read.

Revision ID: ce1a8b4d09f2
Revises: bd9f2a4c7e13
"""
import sqlalchemy as sa
from alembic import op

revision = "ce1a8b4d09f2"
down_revision = "bd9f2a4c7e13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bike_components",
        sa.Column("owned", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bike_components", "owned")
