"""add strength subsystem + crew_nudges

Adds the strength training tables (strength_routines, routine_exercises,
strength_sessions, strength_set_logs) and the crew_nudges table in a single
migration.

Revision ID: b7f3c2d1a9e4
Revises: f1d2e3a4b5c6
Create Date: 2026-07-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7f3c2d1a9e4"
down_revision: Union[str, Sequence[str], None] = "f1d2e3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Strength: routines ─────────────────────────────────────────────
    op.create_table(
        "strength_routines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "archived", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_strength_routines_id", "strength_routines", ["id"], unique=False
    )
    op.create_index(
        "ix_strength_routines_user_id", "strength_routines", ["user_id"], unique=False
    )

    # ── Strength: routine exercises ────────────────────────────────────
    op.create_table(
        "routine_exercises",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("routine_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("target_sets", sa.Integer(), nullable=False, server_default="3"),
        sa.Column(
            "target_reps", sa.String(length=20), nullable=False, server_default="8-12"
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["routine_id"], ["strength_routines.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_routine_exercises_id", "routine_exercises", ["id"], unique=False
    )
    op.create_index(
        "ix_routine_exercises_routine_id",
        "routine_exercises",
        ["routine_id"],
        unique=False,
    )

    # ── Strength: sessions ─────────────────────────────────────────────
    op.create_table(
        "strength_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("routine_id", sa.Integer(), nullable=True),
        sa.Column("performed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["routine_id"], ["strength_routines.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_strength_sessions_id", "strength_sessions", ["id"], unique=False
    )
    op.create_index(
        "ix_strength_sessions_user_id", "strength_sessions", ["user_id"], unique=False
    )

    # ── Strength: set logs ─────────────────────────────────────────────
    op.create_table(
        "strength_set_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("exercise_name", sa.String(length=120), nullable=False),
        sa.Column("set_index", sa.Integer(), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=False),
        sa.Column("rpe", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(
            ["session_id"], ["strength_sessions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_strength_set_logs_id", "strength_set_logs", ["id"], unique=False
    )
    op.create_index(
        "ix_strength_set_logs_session_id",
        "strength_set_logs",
        ["session_id"],
        unique=False,
    )

    # ── Crew nudges ────────────────────────────────────────────────────
    op.create_table(
        "crew_nudges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("from_user_id", sa.Integer(), nullable=False),
        sa.Column("to_user_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=280), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["from_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_crew_nudges_id", "crew_nudges", ["id"], unique=False)
    op.create_index(
        "ix_crew_nudges_from_user_id", "crew_nudges", ["from_user_id"], unique=False
    )
    op.create_index(
        "ix_crew_nudges_to_user_id", "crew_nudges", ["to_user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_crew_nudges_to_user_id", table_name="crew_nudges")
    op.drop_index("ix_crew_nudges_from_user_id", table_name="crew_nudges")
    op.drop_index("ix_crew_nudges_id", table_name="crew_nudges")
    op.drop_table("crew_nudges")

    op.drop_index("ix_strength_set_logs_session_id", table_name="strength_set_logs")
    op.drop_index("ix_strength_set_logs_id", table_name="strength_set_logs")
    op.drop_table("strength_set_logs")

    op.drop_index("ix_strength_sessions_user_id", table_name="strength_sessions")
    op.drop_index("ix_strength_sessions_id", table_name="strength_sessions")
    op.drop_table("strength_sessions")

    op.drop_index("ix_routine_exercises_routine_id", table_name="routine_exercises")
    op.drop_index("ix_routine_exercises_id", table_name="routine_exercises")
    op.drop_table("routine_exercises")

    op.drop_index("ix_strength_routines_user_id", table_name="strength_routines")
    op.drop_index("ix_strength_routines_id", table_name="strength_routines")
    op.drop_table("strength_routines")
