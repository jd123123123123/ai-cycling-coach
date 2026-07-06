"""activity_stream weather has_gps

Revision ID: 0b63ce61db30
Revises: e1f2a3b4c5d6
Create Date: 2026-07-06 11:05:53.068472

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0b63ce61db30'
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("activity_streams", sa.Column("weather", sa.JSON(), nullable=True))
    op.add_column("activity_streams", sa.Column("has_gps", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("activity_streams", "has_gps")
    op.drop_column("activity_streams", "weather")
