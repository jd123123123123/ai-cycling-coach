"""planned_workouts: modification tracking fields (Phase 6.2)

Adds three columns to support the ``modify_planned_workout`` tool introduced
in Phase 6 Wave 2:
    - ``indoor`` (boolean, default false) — set when athlete swaps a planned
      outdoor session to a trainer ride via chat. Power targets + template
      stay unchanged.
    - ``blocks_source`` (varchar(30), default 'ai_prescribed') — tracks
      provenance so the UI can distinguish AI-prescribed plans from
      user-modified plans (enables undo in 06-04).
    - ``template_id`` (varchar(50), nullable) — reference to the 12-template
      library. Nullable for legacy rows; populated on modification so the
      cascade has an anchor point.

Backfill: server_default on ``indoor`` and ``blocks_source`` means existing
rows get ``false`` / ``'ai_prescribed'`` without a separate backfill step.
``template_id`` stays NULL on legacy rows — the modification tool falls back
to ``z2_endurance_60`` when it encounters a NULL template_id.

Revision ID: b9c4d1e8f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-04-21 14:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b9c4d1e8f2a3'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'planned_workouts',
        sa.Column(
            'indoor',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )
    op.add_column(
        'planned_workouts',
        sa.Column(
            'blocks_source',
            sa.String(length=30),
            nullable=False,
            server_default='ai_prescribed',
        ),
    )
    op.add_column(
        'planned_workouts',
        sa.Column(
            'template_id',
            sa.String(length=50),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column('planned_workouts', 'template_id')
    op.drop_column('planned_workouts', 'blocks_source')
    op.drop_column('planned_workouts', 'indoor')
