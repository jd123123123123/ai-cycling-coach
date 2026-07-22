"""add crew_messages + crew_reactions

Revision ID: f7a1c2b3d4e5
Revises: ce9f1a2b3c4d
Create Date: 2026-07-22 12:00:00.000000

Adds the two Crew-social tables that back the V3 Social chat wall + reactions:

    crew_messages   — one chat line per (crew, author): free text (≤2000 chars).
    crew_reactions  — a flexible emoji reaction keyed by (target_type, target_id):
                      'message' | 'crew_week' | 'event' | 'ride'. target_id is
                      NULL for 'crew_week' (cheer the crew this week).

Cascades:
  crew_messages.crew_id     → crews.id   ON DELETE CASCADE
  crew_messages.user_id     → users.id   ON DELETE CASCADE
  crew_reactions.crew_id    → crews.id   ON DELETE CASCADE
  crew_reactions.user_id    → users.id   ON DELETE CASCADE

Constraints:
  crew_reactions UNIQUE (user_id, target_type, target_id, emoji) — a reaction
  toggles. (Postgres treats NULLs as distinct, so this does not dedupe the
  NULL-target 'crew_week' rows at the DB level; the API's read-then-toggle does.)

Crew-shared data (mirrors crews / crew_memberships / crew_events): no
row-level-security policy — access is scoped by crew membership in the API.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f7a1c2b3d4e5"
down_revision: str | Sequence[str] | None = "ce9f1a2b3c4d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "crew_messages",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "crew_id",
            sa.Integer,
            sa.ForeignKey("crews.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_crew_messages_id", "crew_messages", ["id"])
    op.create_index("ix_crew_messages_crew_id", "crew_messages", ["crew_id"])
    op.create_index(
        "ix_crew_messages_crew_id_id", "crew_messages", ["crew_id", "id"]
    )

    op.create_table(
        "crew_reactions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "crew_id",
            sa.Integer,
            sa.ForeignKey("crews.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("target_type", sa.String(16), nullable=False),
        sa.Column("target_id", sa.Integer, nullable=True),
        sa.Column("emoji", sa.String(16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "user_id",
            "target_type",
            "target_id",
            "emoji",
            name="uq_crew_reaction_user_target_emoji",
        ),
    )
    op.create_index("ix_crew_reactions_id", "crew_reactions", ["id"])
    op.create_index("ix_crew_reactions_crew_id", "crew_reactions", ["crew_id"])
    op.create_index(
        "ix_crew_reactions_target",
        "crew_reactions",
        ["crew_id", "target_type", "target_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_crew_reactions_target", table_name="crew_reactions")
    op.drop_index("ix_crew_reactions_crew_id", table_name="crew_reactions")
    op.drop_index("ix_crew_reactions_id", table_name="crew_reactions")
    op.drop_table("crew_reactions")

    op.drop_index("ix_crew_messages_crew_id_id", table_name="crew_messages")
    op.drop_index("ix_crew_messages_crew_id", table_name="crew_messages")
    op.drop_index("ix_crew_messages_id", table_name="crew_messages")
    op.drop_table("crew_messages")
