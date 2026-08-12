"""add referrals

Revision ID: rf3c4d5e6f7a
Revises: ch2b3c4d5e6f
Create Date: 2026-08-12 12:00:00.000000

A recruiter → referred-rider link with a 30-day accrual window (see
models/referral.py + services/referral.py). One row per referred rider; the
recruiter's accrued 10% cut is paid once via points_ledger on claim.
RLS-protected via referrer_user_id (same pattern as wallets / challenges).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "rf3c4d5e6f7a"
down_revision: Union[str, Sequence[str], None] = "ch2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "referrals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("referrer_user_id", sa.Integer(), nullable=False),
        sa.Column("referred_user_id", sa.Integer(), nullable=True),
        sa.Column("code", sa.String(length=12), nullable=False),
        sa.Column(
            "started_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column("ends_on", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "accrued_rc", sa.Integer(), server_default="0", nullable=False,
        ),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["referrer_user_id"], ["users.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["referred_user_id"], ["users.id"], ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "referred_user_id", name="uq_referral_referred_user",
        ),
    )
    op.create_index(
        op.f("ix_referrals_referrer_user_id"),
        "referrals", ["referrer_user_id"], unique=False,
    )
    op.create_index(
        op.f("ix_referrals_referred_user_id"),
        "referrals", ["referred_user_id"], unique=False,
    )

    # RLS: a recruiter only ever sees their own referrals. The live cross-user
    # accrual + read paths use the system (RLS-bypassing) session in
    # services/referral, scoped manually by referrer_user_id (scheduler pattern).
    op.execute("ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON referrals
            USING (referrer_user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON referrals;")
    op.execute("ALTER TABLE referrals DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_referrals_referred_user_id"), table_name="referrals")
    op.drop_index(op.f("ix_referrals_referrer_user_id"), table_name="referrals")
    op.drop_table("referrals")
