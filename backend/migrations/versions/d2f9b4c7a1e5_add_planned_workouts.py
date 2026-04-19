"""add planned_workouts table

Revision ID: d2f9b4c7a1e5
Revises: c1f8a3d9e2b7
Create Date: 2026-04-19 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd2f9b4c7a1e5'
down_revision: Union[str, Sequence[str], None] = 'c1f8a3d9e2b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'planned_workouts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('sport', sa.String(length=30), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('duration_seconds_target', sa.Integer(), nullable=True),
        sa.Column('description', sa.String(length=2000), nullable=True),
        sa.Column('interval_structure', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_planned_workouts_user_id'), 'planned_workouts', ['user_id'], unique=False)
    op.create_index(op.f('ix_planned_workouts_date'), 'planned_workouts', ['date'], unique=False)
    op.create_index('ix_planned_workouts_user_date', 'planned_workouts', ['user_id', 'date'], unique=False)

    # RLS — same pattern as athlete_profiles / consent_records (see a076ea752213)
    op.execute("ALTER TABLE planned_workouts ENABLE ROW LEVEL SECURITY;")
    op.execute("""
        CREATE POLICY user_isolation ON planned_workouts
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON planned_workouts;")
    op.execute("ALTER TABLE planned_workouts DISABLE ROW LEVEL SECURITY;")
    op.drop_index('ix_planned_workouts_user_date', table_name='planned_workouts')
    op.drop_index(op.f('ix_planned_workouts_date'), table_name='planned_workouts')
    op.drop_index(op.f('ix_planned_workouts_user_id'), table_name='planned_workouts')
    op.drop_table('planned_workouts')
