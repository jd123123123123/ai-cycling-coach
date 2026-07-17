"""add users.display_name

Revision ID: f1d2e3a4b5c6
Revises: a0a5245ea569
Create Date: 2026-07-16
"""
from alembic import op
import sqlalchemy as sa

revision = "f1d2e3a4b5c6"
down_revision = "a0a5245ea569"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "display_name")
