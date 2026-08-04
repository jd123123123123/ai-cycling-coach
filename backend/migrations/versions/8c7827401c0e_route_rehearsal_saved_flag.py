"""route_rehearsal saved flag

Revision ID: 8c7827401c0e
Revises: b9d106ca0f6e
Create Date: 2026-08-04 08:24:48.131188

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8c7827401c0e'
down_revision: Union[str, Sequence[str], None] = 'b9d106ca0f6e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default so every pre-existing rehearsal reads as not-kept without
    # a backfill pass; nullable=False because "unknown" is not a third state.
    op.add_column(
        "route_rehearsals",
        sa.Column("saved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("route_rehearsals", "saved")
