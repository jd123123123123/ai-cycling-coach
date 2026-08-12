"""Referrals — a recruiter's 10% cut on a referred rider's first 30 days.

A recruiter shares their personal code. When a new rider signs up with it, one
``Referral`` row links the two and opens a 30-day accrual window. For every ride
the referred rider *earns* RideCoin on during that window, 10% of that ride's
total is added to the recruiter's ``accrued_rc`` (see services/referral —
accrued live at ride-award time via a system session, since the referred
rider's award runs in an RLS session scoped to *them*, not the recruiter).

At the end of the window the recruiter *claims* the accrued bonus, which pays
``accrued_rc`` into their points ledger (reason ``referral_bonus``) once.

RLS-protected via ``referrer_user_id`` — a recruiter only ever sees their own
referrals (same policy shape as wallets / challenge_enrollments). The one row
per referred rider is enforced by a unique constraint on ``referred_user_id``.
"""
from datetime import datetime

from sqlalchemy import (
    DateTime, ForeignKey, Integer, String, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# The referral window and the recruiter's cut — the two economy knobs. Kept
# here so the model, service and tests share one source of truth.
REFERRAL_WINDOW_DAYS = 30
REFERRAL_BONUS_RATE = 0.10


class Referral(Base):
    """One recruiter → one referred rider, with a 30-day accrual window.

    ``referred_user_id`` is nullable so a code can exist as an unclaimed invite
    before anyone signs up with it; once a rider joins via the code it is set and
    the (referred_user_id) uniqueness rule guarantees a rider is referred at most
    once. ``ends_on`` is a timestamp (``started_at`` + 30 days) so the UI can run
    a live "16d 12h 33m" countdown. ``claimed_at`` flips the row from a promise
    (violet) to a paid receipt (lime); ``accrued_rc`` is the running 10% cut.
    """

    __tablename__ = "referrals"
    __table_args__ = (
        UniqueConstraint("referred_user_id", name="uq_referral_referred_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    referrer_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    referred_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    code: Mapped[str] = mapped_column(String(12), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    ends_on: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    accrued_rc: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    claimed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
