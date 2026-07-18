"""merge sleep vitals + achievements

Revision ID: 7d54464d26a1
Revises: f3a4b5c6d7e8, f3d7a1c9b2e8
Create Date: 2026-07-18 20:42:58.534743

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d54464d26a1'
down_revision: Union[str, Sequence[str], None] = ('f3a4b5c6d7e8', 'f3d7a1c9b2e8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
