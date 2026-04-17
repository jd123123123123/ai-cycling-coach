"""add garmin_credentials table

Revision ID: c1f8a3d9e2b7
Revises: a076ea752213
Create Date: 2026-04-17 18:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1f8a3d9e2b7'
down_revision: Union[str, Sequence[str], None] = 'a076ea752213'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'garmin_credentials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('encrypted_email', sa.String(), nullable=False),
        sa.Column('encrypted_password', sa.String(), nullable=False),
        sa.Column('token_store_path', sa.String(), nullable=True),
        sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sync_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sync_status', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )
    op.create_index(op.f('ix_garmin_credentials_user_id'), 'garmin_credentials', ['user_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_garmin_credentials_user_id'), table_name='garmin_credentials')
    op.drop_table('garmin_credentials')
