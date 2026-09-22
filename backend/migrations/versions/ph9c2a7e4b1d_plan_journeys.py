"""Preserve selected plans and measured outcomes across rebuilds.

Revision ID: ph9c2a7e4b1d
Revises: wr1a2b3c4d5e
"""
from alembic import op
import sqlalchemy as sa
revision = 'ph9c2a7e4b1d'
down_revision = 'wr1a2b3c4d5e'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('plan_journeys',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('started_on', sa.Date(), nullable=False),
        sa.Column('planned_end', sa.Date(), nullable=False),
        sa.Column('ended_on', sa.Date()),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('goal', sa.JSON(), nullable=False),
        sa.Column('baseline', sa.JSON(), nullable=False),
        sa.Column('revisions', sa.JSON(), nullable=False),
        sa.Column('outcome', sa.JSON()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index('ix_plan_journeys_user_id', 'plan_journeys', ['user_id'])
    op.execute('ALTER TABLE plan_journeys ENABLE ROW LEVEL SECURITY')
    op.execute("CREATE POLICY user_isolation ON plan_journeys USING (user_id = current_setting('app.current_user_id', true)::INTEGER) WITH CHECK (user_id = current_setting('app.current_user_id', true)::INTEGER)")

def downgrade():
    op.drop_table('plan_journeys')
