"""RideCoin economy — the award/spend engine.

Spec: docs/superpowers/specs/2026-08-12-ridecoin-point-system-design.md

Pure earn rules (``base_ride_rc``, ``streak_multiplier``, ``challenge_bonus``)
are separated from the persistence (``award_ride``, ``grant_onboarding``,
``get_wallet``) so the money math is unit-testable without a database.

Guardrails baked in here, from the spec's evidence base:
- earn is 1 RC per TSS point, capped at 150 RC/ride (a single epic can't mint a
  week of currency);
- the streak multiplier is tiered and hard-capped at ×1.5;
- the challenge bonus is computed on *base* earnings and added (never multiplied
  onto the streak-boosted total), so the faucet can't run away;
- onboarding grants are fixed, identical for every rider, and idempotent.
"""
from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rewards import (
    ONBOARDING_REASONS,
    REASON_CHALLENGE_BONUS,
    REASON_ONBOARDING_BIKE,
    REASON_ONBOARDING_DEVICE,
    REASON_ONBOARDING_PHOTO,
    REASON_RIDE_EARN,
    REASON_STREAK_BONUS,
    PointsLedger,
    Wallet,
)

logger = logging.getLogger(__name__)

# --- Tunable parameters (evidence-shaped starting points, §10 of the spec) ---
RC_PER_TSS = 1.0            # k = 1: 1 RideCoin per TSS point
PER_RIDE_SOFT_CAP = 150     # a ride's *earning* plateaus at TSS 150
ONBOARDING_PHOTO_RC = 125   # add your photo / create avatar
ONBOARDING_DEVICE_RC = 125  # connect your watch
# Paid by `shop.claim_first_bike` — the moment a rider claims their free first
# bike. The comment here used to read "digitalise your bike in the studio", which
# was true until the studio stopped being a tab; it then described a flow that
# could no longer pay it, and reading this line is what convinced two separate
# passes that the grant had been stranded. It has not: it is idempotent per
# reason and the claim path grants it on every new rider.
#
# There IS still a second door — POST /rewards/onboarding/bike (api/rewards.py)
# maps kind="bike" to the same reason, left from the studio flow. It cannot
# double-pay (grant_onboarding is idempotent), but it is a live endpoint for a
# retired surface and wants deleting once nothing calls it.
ONBOARDING_BIKE_RC = 150

# reason -> amount, EXPLICIT. This used to be inferred from the reason string
# (`reason.endswith("photo")` picking one of two amounts), which silently paid
# the device amount for anything that wasn't the photo grant — a third grant
# would have been mispriced with no error anywhere. Every onboarding reason must
# appear here; `_check_onboarding_prices()` below fails the import if one
# doesn't, so the two definitions can never drift apart.
ONBOARDING_GRANT_RC: dict[str, int] = {
    REASON_ONBOARDING_PHOTO: ONBOARDING_PHOTO_RC,
    REASON_ONBOARDING_DEVICE: ONBOARDING_DEVICE_RC,
    REASON_ONBOARDING_BIKE: ONBOARDING_BIKE_RC,
}


def _check_onboarding_prices() -> None:
    missing = ONBOARDING_REASONS - set(ONBOARDING_GRANT_RC)
    extra = set(ONBOARDING_GRANT_RC) - ONBOARDING_REASONS
    if missing or extra:
        raise RuntimeError(
            f"onboarding grant prices out of step with ONBOARDING_REASONS: "
            f"missing={sorted(missing)} extra={sorted(extra)}"
        )


_check_onboarding_prices()

# Everyone starts at the same number — 125 photo + 125 device + 150 bike.
# The onboarding rewards screen quotes this total; keep the two in step
# (frontend/src/api/rewards.ts → ONBOARDING_TOTAL_RC).
ONBOARDING_TOTAL_RC = sum(ONBOARDING_GRANT_RC.values())  # 400

# Streak multiplier tiers — hard ceiling ×1.5 (§5a). (min_streak_days, multiplier),
# highest threshold first so the first match wins.
_STREAK_TIERS: list[tuple[int, float]] = [
    (30, 1.5),
    (14, 1.4),
    (7, 1.25),
    (3, 1.1),
    (0, 1.0),
]

# Challenge completion multipliers (§5b) and the per-challenge bonus ceiling.
CHALLENGE_MULTIPLIERS = {"bronze": 1.25, "silver": 1.5, "gold": 2.0}
CHALLENGE_BONUS_CAP = 1000

# Shop price tiers (§6) — the sink. (name, price) cheapest first.
SHOP_TIERS: list[tuple[str, int]] = [
    ("entry", 300),
    ("mid", 900),
    ("prestige", 2500),
    ("rare", 6000),
]


def tier_progress(balance: int) -> dict:
    """Where a balance sits against the shop tiers: the next unlock it's
    working toward and how far along (for the Biker page's tier gauge)."""
    for name, price in SHOP_TIERS:
        if balance < price:
            prev = 0
            for pname, pprice in SHOP_TIERS:
                if pprice >= price:
                    break
                prev = pprice
            span = price - prev
            pct = round(((balance - prev) / span) * 100) if span > 0 else 100
            return {
                "next_tier": name,
                "next_price": price,
                "balance": balance,
                "to_go": price - balance,
                "pct": max(0, min(100, pct)),
            }
    top = SHOP_TIERS[-1]
    return {
        "next_tier": None,
        "next_price": top[1],
        "balance": balance,
        "to_go": 0,
        "pct": 100,
    }


# --------------------------------------------------------------------------- #
# Pure earn rules — no I/O, unit-testable.
# --------------------------------------------------------------------------- #
def base_ride_rc(tss: float | None) -> int:
    """Base RideCoin for a ride from its TSS, before any multiplier.

    1 RC per TSS point, capped at the per-ride soft cap. A ride with no
    computable TSS earns nothing (honest: no measured stress, no reward)."""
    if not tss or tss <= 0:
        return 0
    return min(PER_RIDE_SOFT_CAP, round(tss * RC_PER_TSS))


def streak_multiplier(streak_days: int) -> float:
    """Map the forgiving-streak length to its earn multiplier, capped ×1.5."""
    for threshold, mult in _STREAK_TIERS:
        if streak_days >= threshold:
            return mult
    return 1.0


def ride_award(tss: float | None, streak_days: int) -> dict:
    """Full ride award breakdown: base, streak multiplier, streak bonus, total.

    The streak bonus is the *extra* RC the multiplier adds on top of base, so it
    can be recorded as its own ledger line ("+18 from a 14-day streak")."""
    base = base_ride_rc(tss)
    mult = streak_multiplier(streak_days)
    total = round(base * mult)
    return {
        "base": base,
        "multiplier": mult,
        "streak_bonus": total - base,
        "total": total,
    }


def challenge_bonus(base_rc_in_window: int, tier: str) -> int:
    """One-time completion bonus, computed on the base RC earned in the
    challenge's window and capped. Additive with the streak multiplier (§5b)."""
    mult = CHALLENGE_MULTIPLIERS.get((tier or "").lower())
    if not mult or base_rc_in_window <= 0:
        return 0
    return min(CHALLENGE_BONUS_CAP, round((mult - 1.0) * base_rc_in_window))


# --------------------------------------------------------------------------- #
# Persistence.
# --------------------------------------------------------------------------- #
async def _credit(
    db: AsyncSession,
    user_id: int,
    reason: str,
    amount: int,
    *,
    activity_id: int | None = None,
    base_tss: int | None = None,
    multiplier: float | None = None,
    context: dict | None = None,
) -> PointsLedger:
    """Write one ledger row and move the wallet balance in the same unit of work.

    The caller owns the transaction (commit/rollback) — this only flushes so the
    row is visible for follow-up reads. Wallet is created lazily on first credit.
    """
    row = PointsLedger(
        user_id=user_id,
        reason=reason,
        amount=amount,
        activity_id=activity_id,
        base_tss=base_tss,
        multiplier=multiplier,
        context=context,
    )
    db.add(row)

    wallet = await db.get(Wallet, user_id)
    if wallet is None:
        wallet = Wallet(user_id=user_id, balance=0)
        db.add(wallet)
    wallet.balance = int(wallet.balance) + amount
    wallet.updated_at = func.now()

    await db.flush()
    return row


class InsufficientBalanceError(Exception):
    """Not enough RideCoin. Carries both figures so the caller can say which."""

    def __init__(self, needed: int, balance: int) -> None:
        super().__init__(f"needs {needed} RC, balance is {balance} RC")
        self.needed = needed
        self.balance = balance


async def balance_of(db: AsyncSession, user_id: int, *, lock: bool = False) -> int:
    """The rider's balance. `lock=True` takes `FOR UPDATE`, so everything read
    after it sees a balance no other spend by this rider can move until commit."""
    stmt = select(Wallet).where(Wallet.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update()
    wallet = (await db.execute(stmt)).scalar_one_or_none()
    return int(wallet.balance) if wallet is not None else 0


async def spend(
    db: AsyncSession,
    user_id: int,
    amount: int,
    reason: str,
    *,
    context: dict | None = None,
) -> int:
    """Debit RideCoin, and return the balance left behind.

    THE ONLY DEBIT IN THE APPLICATION, and the reason this function exists at
    all. Until now the only path that moved money the other way was buried in
    `shop.purchase`, so deleting the shop — which the garage rework does — would
    have made RideCoin unspendable by construction while every faucet kept
    running. Every sink goes through here.

    Takes `FOR UPDATE` before reading, so two concurrent spends cannot both see
    the same balance and both succeed. Raises `InsufficientBalanceError` before
    writing anything: a refusal must leave no ledger line and move no coins.

    The caller owns the transaction. This flushes so the row is visible to
    follow-up reads in the same unit of work, and commits nothing — the item
    being bought and the money paying for it must land or fail together.
    """
    if amount <= 0:
        raise ValueError("spend amount must be positive")

    balance = await balance_of(db, user_id, lock=True)
    if amount > balance:
        raise InsufficientBalanceError(amount, balance)

    # Signed: a spend is a negative credit, so one ledger and one balance column
    # carry both directions and can never disagree about the total.
    await _credit(db, user_id, reason, -amount, context=context)
    return balance - amount


async def _already_awarded(
    db: AsyncSession, user_id: int, activity_id: int, reason: str
) -> bool:
    existing = await db.execute(
        select(PointsLedger.id).where(
            PointsLedger.user_id == user_id,
            PointsLedger.activity_id == activity_id,
            PointsLedger.reason == reason,
        )
    )
    return existing.first() is not None


async def award_ride(
    db: AsyncSession,
    user_id: int,
    activity_id: int,
    tss: float | None,
    streak_days: int,
) -> dict | None:
    """Award RideCoin for one ride: a ``ride_earn`` line for the base, plus a
    ``streak_bonus`` line for the multiplier's extra (when the streak lifts it).

    Idempotent per (user, activity): re-ingesting the same ride awards nothing.
    Returns the award breakdown, or ``None`` when nothing was earned / already
    awarded. The caller commits.
    """
    breakdown = ride_award(tss, streak_days)
    if breakdown["total"] <= 0:
        return None
    if await _already_awarded(db, user_id, activity_id, REASON_RIDE_EARN):
        return None

    base_tss = round(tss) if tss else None
    await _credit(
        db, user_id, REASON_RIDE_EARN, breakdown["base"],
        activity_id=activity_id, base_tss=base_tss, multiplier=1.0,
    )
    if breakdown["streak_bonus"] > 0:
        await _credit(
            db, user_id, REASON_STREAK_BONUS, breakdown["streak_bonus"],
            activity_id=activity_id, base_tss=base_tss,
            multiplier=breakdown["multiplier"],
            context={"streak_days": streak_days},
        )
    return breakdown


async def grant_onboarding(db: AsyncSession, user_id: int, reason: str) -> int:
    """Award a fixed, identical, one-time onboarding grant (photo/device/bike).

    Idempotent — each grant is awarded once, ever. Returns the RC granted (0 if
    it was already granted). The caller commits."""
    if reason not in ONBOARDING_REASONS:
        raise ValueError(f"not an onboarding reason: {reason}")

    existing = await db.execute(
        select(PointsLedger.id).where(
            PointsLedger.user_id == user_id, PointsLedger.reason == reason,
        )
    )
    if existing.first() is not None:
        return 0

    amount = ONBOARDING_GRANT_RC[reason]
    await _credit(db, user_id, reason, amount)
    return amount


async def ride_breakdown(
    db: AsyncSession, user_id: int, activity_id: int
) -> dict | None:
    """How a single ride's RideCoin was made, from the ledger — the data behind
    the post-ride celebration's "how the N was made" bar. Returns the base
    (ride_earn), the streak bonus and its multiplier, and the total, or ``None``
    when the ride earned nothing / isn't awarded yet.
    """
    rows = await db.execute(
        select(PointsLedger).where(
            PointsLedger.user_id == user_id,
            PointsLedger.activity_id == activity_id,
        )
    )
    entries = list(rows.scalars().all())
    if not entries:
        return None

    base = next((e for e in entries if e.reason == REASON_RIDE_EARN), None)
    streak = next((e for e in entries if e.reason == REASON_STREAK_BONUS), None)
    base_rc = int(base.amount) if base else 0
    streak_rc = int(streak.amount) if streak else 0
    return {
        "activity_id": activity_id,
        "base": base_rc,
        "streak_bonus": streak_rc,
        "multiplier": float(streak.multiplier) if streak and streak.multiplier else 1.0,
        "base_tss": base.base_tss if base else None,
        "total": base_rc + streak_rc,
        "banked": base is not None,
        "at": (base.created_at.isoformat() if base and base.created_at else None),
    }


async def get_wallet(db: AsyncSession, user_id: int, ledger_limit: int = 25) -> dict:
    """The rider's balance plus their most recent ledger entries."""
    wallet = await db.get(Wallet, user_id)
    balance = int(wallet.balance) if wallet is not None else 0

    rows = await db.execute(
        select(PointsLedger)
        .where(PointsLedger.user_id == user_id)
        .order_by(PointsLedger.created_at.desc(), PointsLedger.id.desc())
        .limit(ledger_limit)
    )
    ledger = [
        {
            "reason": r.reason,
            "amount": r.amount,
            "base_tss": r.base_tss,
            "multiplier": r.multiplier,
            "activity_id": r.activity_id,
            "at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows.scalars().all()
    ]
    return {"balance": balance, "ledger": ledger}
