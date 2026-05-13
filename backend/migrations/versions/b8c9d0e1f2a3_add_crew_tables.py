"""add_crew_tables

Revision ID: b8c9d0e1f2a3
Revises: f7a8b9c0d1e2
Create Date: 2026-05-13 00:00:00.000000

Adds the three Crew tables — crews, crew_memberships, crew_invites — per
docs/superpowers/specs/2026-05-13-crew-backend-design.md.

Cascades:
  crews.owner_user_id    → users.id        ON DELETE CASCADE
  crew_memberships.*     → crews / users   ON DELETE CASCADE
  crew_invites.*         → crews / users   ON DELETE CASCADE

Constraints:
  crew_memberships UNIQUE (user_id)            — one crew per athlete
  crew_memberships UNIQUE (crew_id, user_id)   — defense-in-depth
  crew_invites     UNIQUE (token)              — token lookup is unique
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: str | Sequence[str] | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "crews",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column(
            "owner_user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_crews_id", "crews", ["id"])
    op.create_index("ix_crews_owner_user_id", "crews", ["owner_user_id"])

    op.create_table(
        "crew_memberships",
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
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("role", sa.String(10), nullable=False, server_default="member"),
        sa.UniqueConstraint("user_id", name="uq_crew_memberships_user_id"),
        sa.UniqueConstraint(
            "crew_id", "user_id", name="uq_crew_memberships_crew_user"
        ),
    )
    op.create_index("ix_crew_memberships_id", "crew_memberships", ["id"])
    op.create_index("ix_crew_memberships_crew_id", "crew_memberships", ["crew_id"])

    op.create_table(
        "crew_invites",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "crew_id",
            sa.Integer,
            sa.ForeignKey("crews.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "inviter_user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("invitee_email", sa.String(254), nullable=False),
        sa.Column("token", sa.String(48), nullable=False, unique=True),
        sa.Column(
            "status", sa.String(10), nullable=False, server_default="pending"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_crew_invites_id", "crew_invites", ["id"])
    op.create_index("ix_crew_invites_token", "crew_invites", ["token"])
    op.create_index(
        "ix_crew_invites_invitee_email_status",
        "crew_invites",
        ["invitee_email", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_crew_invites_invitee_email_status", table_name="crew_invites")
    op.drop_index("ix_crew_invites_token", table_name="crew_invites")
    op.drop_index("ix_crew_invites_id", table_name="crew_invites")
    op.drop_table("crew_invites")

    op.drop_index("ix_crew_memberships_crew_id", table_name="crew_memberships")
    op.drop_index("ix_crew_memberships_id", table_name="crew_memberships")
    op.drop_table("crew_memberships")

    op.drop_index("ix_crews_owner_user_id", table_name="crews")
    op.drop_index("ix_crews_id", table_name="crews")
    op.drop_table("crews")
