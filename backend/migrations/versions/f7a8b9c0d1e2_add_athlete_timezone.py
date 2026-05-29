"""add_athlete_timezone

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-05-07 00:00:00.000000

Adds a `timezone` IANA string column to athlete_profiles so the coach
service can compute athlete-local "today" / "this week" windows without
the hardcoded Europe/Berlin constant (today-runthrough Step 2). Backfills
existing rows to 'Europe/Berlin' to preserve current behaviour for the
single MVP user.

Nullable + server_default so existing rows keep working without an
application-level write; new rows default to Berlin until the onboarding
flow learns to set this from the browser tz.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: str | Sequence[str] | None = "e6f7a8b9c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "athlete_profiles",
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=True,
            server_default="Europe/Berlin",
        ),
    )


def downgrade() -> None:
    op.drop_column("athlete_profiles", "timezone")
