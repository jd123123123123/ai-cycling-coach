"""RideCoin economy — the reward currency's two durable tables.

Spec: docs/superpowers/specs/2026-08-12-ridecoin-point-system-design.md

- ``wallets``      — one row per user, the current RideCoin balance (a cached
  running sum of the ledger; the ledger is the source of truth).
- ``points_ledger`` — the append-only history of every earn/spend, one row per
  event, carrying enough context (base TSS, multiplier, activity) to explain
  *why* a rider earned what they did.

RideCoin is earn-only / spend-only, non-tradable, integer, cosmetic-only. It is
earned from TSS (training stress), never distance. Balances are permanent — only
competitions reset.

Both tables are RLS-protected via ``user_id`` (same pattern as achievements /
ride_feedback), so a rider only ever sees their own wallet and history.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Ledger reasons — the closed vocabulary of why RideCoin moved.
REASON_ONBOARDING_PHOTO = "onboarding_photo"
REASON_ONBOARDING_DEVICE = "onboarding_device"
REASON_ONBOARDING_BIKE = "onboarding_bike"
REASON_RIDE_EARN = "ride_earn"
REASON_STREAK_BONUS = "streak_bonus"
REASON_CHALLENGE_BONUS = "challenge_bonus"
REASON_REFERRAL_BONUS = "referral_bonus"
REASON_PART_PURCHASE = "part_purchase"
#: The harvest. Credited when a rider services a component, sized by the
#: kilometres they rode on it — the counterpart to `ride_earn`, and the reason
#: the maintenance loop can exist without any reason code that debits for
#: neglect. See `services/workshop.service`.
REASON_SERVICE_BONUS = "service_bonus"
#: Reaching a new Eddington number. Rare, one-off, superlinear.
REASON_EDDINGTON = "eddington"
#: What a conditional equipment bonus added to a ride, banked alongside the
#: ride's own earn so the ledger can show WHY a ride paid more than its TSS.
REASON_GEAR_BONUS = "gear_bonus"
REASON_ADJUSTMENT = "adjustment"

ONBOARDING_REASONS = {
    REASON_ONBOARDING_PHOTO,
    REASON_ONBOARDING_DEVICE,
    REASON_ONBOARDING_BIKE,
}


class Wallet(Base):
    """A rider's current RideCoin balance. One row per user, created lazily on
    the first credit. ``balance`` is a cached running total of the ledger."""

    __tablename__ = "wallets"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True,
    )
    balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


class PointsLedger(Base):
    """Append-only RideCoin event history. Every earn/spend is one row.

    ``amount`` is the signed RideCoin delta (positive earn, negative spend).
    ``base_tss`` and ``multiplier`` are present on ride earns so the UI can show
    the honest "65 TSS × 1.4 streak" breakdown. ``activity_id`` links a ride
    earn back to its ride; a ``(user_id, activity_id, reason)`` uniqueness rule
    makes re-ingestion of the same ride idempotent — a ride is never
    double-awarded.
    """

    __tablename__ = "points_ledger"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "activity_id", "reason", name="uq_points_ledger_ride_reason",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    activity_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    base_tss: Mapped[int | None] = mapped_column(Integer, nullable=True)
    multiplier: Mapped[float | None] = mapped_column(Float, nullable=True)
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True,
    )
