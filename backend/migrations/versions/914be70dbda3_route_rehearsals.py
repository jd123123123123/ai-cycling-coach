"""route_rehearsals

Revision ID: 914be70dbda3
Revises: wp4b7d2e6c1a
Create Date: 2026-07-31 01:12:35.858208

Autogenerate also proposed dropping `achievements` and `race_debriefs`, a
coach_briefs column type churn and a handful of index/comment diffs -- all
artefacts of migrations/env.py importing only a subset of the models, none of
them anything to do with this feature. Deleted; this migration creates one
table and nothing else.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '914be70dbda3'
down_revision: Union[str, Sequence[str], None] = 'wp4b7d2e6c1a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'route_rehearsals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('source_kind', sa.String(length=20), nullable=False),
        sa.Column('source_ref', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=160), nullable=True),
        sa.Column('distance_m', sa.Float(), nullable=False),
        sa.Column('ascent_m', sa.Float(), nullable=False),
        sa.Column('route', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('assumptions', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('result', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_route_rehearsals_id'), 'route_rehearsals', ['id'], unique=False)
    op.create_index(
        op.f('ix_route_rehearsals_user_id'), 'route_rehearsals', ['user_id'], unique=False
    )

    # RLS — match the pattern used by athlete_profiles / activities /
    # coach_recommendations: a rehearsal is the athlete's own, never shared.
    op.execute("ALTER TABLE route_rehearsals ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON route_rehearsals
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP POLICY IF EXISTS user_isolation ON route_rehearsals;")
    op.execute("ALTER TABLE route_rehearsals DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f('ix_route_rehearsals_user_id'), table_name='route_rehearsals')
    op.drop_index(op.f('ix_route_rehearsals_id'), table_name='route_rehearsals')
    op.drop_table('route_rehearsals')
