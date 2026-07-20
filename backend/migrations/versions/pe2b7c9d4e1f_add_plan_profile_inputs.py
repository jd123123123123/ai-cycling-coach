"""add plan-engine v2 profile inputs to athlete_profiles

Revision ID: pe2b7c9d4e1f
Revises: pa54170d1dab
Create Date: 2026-07-20 00:00:00.000000

Plan-engine v2 (PlanProfile inputs): five nullable columns feeding the
plan builder + plan-change interview. All nullable — onboarding stays at
3 screens; motivation/variety default from the depth selector and are
learned later, never interrogated.

    days_available      JSONB  {"mon": bool, ..., "sun": bool, "long_day": "sat"}
    motivation_style    VARCHAR(20)  race_focused | fitness_builder | fun_variety
    variety_dial        VARCHAR(12)  steady | mixed | adventurous
    experience_level    VARCHAR(12)  new | returning | seasoned
    hard_day_blackouts  JSONB  ["mon", "fri"] — no quality sessions on these days
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "pe2b7c9d4e1f"
down_revision: Union[str, Sequence[str], None] = "pa54170d1dab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "athlete_profiles",
        sa.Column("days_available", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "athlete_profiles",
        sa.Column("motivation_style", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "athlete_profiles",
        sa.Column("variety_dial", sa.String(length=12), nullable=True),
    )
    op.add_column(
        "athlete_profiles",
        sa.Column("experience_level", sa.String(length=12), nullable=True),
    )
    op.add_column(
        "athlete_profiles",
        sa.Column("hard_day_blackouts", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("athlete_profiles", "hard_day_blackouts")
    op.drop_column("athlete_profiles", "experience_level")
    op.drop_column("athlete_profiles", "variety_dial")
    op.drop_column("athlete_profiles", "motivation_style")
    op.drop_column("athlete_profiles", "days_available")
