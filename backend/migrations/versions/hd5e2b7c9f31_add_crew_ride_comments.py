"""crew_messages gains a target — the ride comment thread

Revision ID: hd5e2b7c9f31
Revises: gc4f1a8b6d2e
Create Date: 2026-08-26 12:00:00.000000

The Today feed shows a crew-mate's ride and lets the rider write under it. That
comment is the same object as a wall line — same author join, same crew scoping,
same 2000-char limit — so it lives in `crew_messages` with a target rather than
in a second table:

    target_type='crew', target_id NULL  → the crew wall (what every existing row is)
    target_type='ride', target_id=<activity id> → a comment under that ride

`target_type` is NOT NULL with server_default 'crew' precisely so the rows that
already exist come back as wall lines. Without the default they would read NULL,
the wall's `WHERE target_type = 'crew'` would drop every one of them, and the
deploy would silently empty every crew's chat history.

Mirrors the (target_type, target_id) shape `crew_reactions` has carried since
f7a1c2b3d4e5. No RLS policy, like the rest of the crew-shared tables — access is
scoped by crew membership in the API.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "hd5e2b7c9f31"
down_revision: str | Sequence[str] | None = "gc4f1a8b6d2e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "crew_messages",
        sa.Column(
            "target_type",
            sa.String(16),
            nullable=False,
            server_default="crew",
        ),
    )
    op.add_column(
        "crew_messages",
        sa.Column("target_id", sa.Integer, nullable=True),
    )
    # A thread reads (crew_id, 'ride', activity_id) ordered by id; the feed
    # counts the same key for a page of rides in one grouped query.
    op.create_index(
        "ix_crew_messages_thread",
        "crew_messages",
        ["crew_id", "target_type", "target_id", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_crew_messages_thread", table_name="crew_messages")
    op.drop_column("crew_messages", "target_id")
    op.drop_column("crew_messages", "target_type")
