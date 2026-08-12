"""Referral subsystem — the recruiter's 10% cut, earned live and claimed once.

Design (grounded in the RideCoin spec's economy,
docs/superpowers/specs/2026-08-12-ridecoin-point-system-design.md):

- Every rider has a stable, shareable **code** derived reversibly from their
  user id (``code_for_user`` / ``user_id_from_code``) — no storage needed and no
  scan to resolve one back to its owner.
- When a new rider signs up with a code, ``link_referral`` opens a 30-day
  ``Referral`` window between the two riders.
- For every ride the referred rider *earns* RideCoin on inside that window, 10%
  of the ride's total is accrued to the recruiter (``accrue_for_ride``). This is
  a **real, live cross-user credit**: the referred rider's ride award runs in an
  RLS session scoped to *them*, so we can't touch the recruiter's row there — we
  open the system (RLS-bypassing) session (``async_session_maker``, the same one
  the scheduler uses) and update the recruiter's Referral row directly.
- Reads that need the referred rider's own training (their distance/rides via
  ``crew_score.challenge_value_for_user``, their claimed RideCoin from the
  ledger) also cross the RLS boundary, so ``list_mine`` / ``user_detail`` run on
  the system session too, scoped manually by ``referrer_user_id`` /
  ``referred_user_id`` (scheduler pattern).
- ``claim`` pays the accrued bonus into the recruiter's ledger once
  (reason=referral_bonus). That's the recruiter's *own* wallet, visible in their
  own RLS session, so it runs on the request's RLS db.

honest boundary: the signup→referral link (``link_referral``) is ready and
tested, but wiring it into the auth signup flow is the integration point owned
by the auth concern — until then no Referral rows exist and the overview honestly
shows an empty state. The accrual + claim math is real end-to-end.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker
from app.models.referral import (
    REFERRAL_BONUS_RATE,
    REFERRAL_WINDOW_DAYS,
    Referral,
)
from app.models.rewards import (
    REASON_REFERRAL_BONUS,
    REASON_RIDE_EARN,
    REASON_STREAK_BONUS,
    PointsLedger,
)
from app.models.user import User
from app.services import rewards
from app.services.crew_score import display_handle, challenge_value_for_user

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Shareable code — reversible, so a code resolves back to its owner without a
# lookup table or an O(n) scan. Not a secret: codes are meant to be shared.
# --------------------------------------------------------------------------- #
# Crockford-style base32 (no I/L/O/U to avoid transcription slips), fixed 6
# chars → 30 bits → covers user ids up to ~1.07e9. A fixed 30-bit mask XORs the
# id so consecutive users don't get near-identical codes.
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_CODE_LEN = 6
_CODE_BITS = _CODE_LEN * 5           # 30
_CODE_SPACE = 1 << _CODE_BITS        # 2**30
_CODE_MASK = 0x2F1B3D7               # < 2**30, fixed obfuscation
_INDEX = {c: i for i, c in enumerate(_ALPHABET)}


def code_for_user(user_id: int) -> str:
    """A rider's stable, shareable 6-char referral code. Deterministic and
    reversible (``user_id_from_code``)."""
    x = (int(user_id) ^ _CODE_MASK) % _CODE_SPACE
    out = []
    for _ in range(_CODE_LEN):
        out.append(_ALPHABET[x & 31])
        x >>= 5
    return "".join(reversed(out))


def user_id_from_code(code: str | None) -> int | None:
    """Resolve a referral code back to the user id that owns it, or ``None`` when
    the string isn't a well-formed code."""
    if not code:
        return None
    s = code.strip().upper()
    if len(s) != _CODE_LEN:
        return None
    x = 0
    for ch in s:
        idx = _INDEX.get(ch)
        if idx is None:
            return None
        x = (x << 5) | idx
    return (x ^ _CODE_MASK) % _CODE_SPACE


# --------------------------------------------------------------------------- #
# Pure window / bonus math — no I/O, unit-testable.
# --------------------------------------------------------------------------- #
def ends_on_for(started_at: datetime) -> datetime:
    """When a referral window closes: 30 days after it opened."""
    return started_at + timedelta(days=REFERRAL_WINDOW_DAYS)


def bonus_for_ride(ride_total_rc: int) -> int:
    """The recruiter's cut of one of the referred rider's ride earnings: 10% of
    the ride's total RideCoin, rounded to a whole coin (the economy is integer).
    A tiny ride can round to 0 — honest, no free coins from noise."""
    if not ride_total_rc or ride_total_rc <= 0:
        return 0
    return round(ride_total_rc * REFERRAL_BONUS_RATE)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def time_left(ends_on: datetime, now: datetime | None = None) -> dict:
    """A referral window's remaining time as a countdown dict + "16d 12h 33m"
    label. ``ended`` is True once the window has closed."""
    now = now or _now()
    delta = _aware(ends_on) - _aware(now)
    secs = int(delta.total_seconds())
    if secs <= 0:
        return {"days": 0, "hours": 0, "minutes": 0, "seconds": 0,
                "ended": True, "label": "Ended"}
    days, rem = divmod(secs, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, seconds = divmod(rem, 60)
    return {"days": days, "hours": hours, "minutes": minutes, "seconds": seconds,
            "ended": False, "label": f"{days}d {hours:02d}h {minutes:02d}m"}


# --------------------------------------------------------------------------- #
# Linking (signup integration hook) — system session, one row per referred rider.
# --------------------------------------------------------------------------- #
async def link_referral(code: str, new_user_id: int) -> Referral | None:
    """Open a 30-day referral window when ``new_user_id`` signs up with ``code``.

    honest boundary: ready + tested, but not yet called from the auth signup
    flow (owned by the auth concern). Idempotent — a rider who is already
    referred, or who used their own code, links nothing. Uses the system session
    because it must touch the recruiter's RLS-protected row.
    """
    referrer_id = user_id_from_code(code)
    if referrer_id is None or referrer_id == new_user_id:
        return None
    async with async_session_maker() as db:
        # The referrer must be a real user (a well-formed but unowned code maps
        # to no one — never mint a dangling referral).
        referrer = await db.get(User, referrer_id)
        if referrer is None:
            return None
        existing = await db.execute(
            select(Referral).where(Referral.referred_user_id == new_user_id)
        )
        if existing.scalar_one_or_none() is not None:
            return None
        started = _now()
        row = Referral(
            referrer_user_id=referrer_id,
            referred_user_id=new_user_id,
            code=code_for_user(referrer_id),
            started_at=started,
            ends_on=ends_on_for(started),
            accrued_rc=0,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row


# --------------------------------------------------------------------------- #
# Live accrual — REAL cross-user credit at ride-award time (system session).
# --------------------------------------------------------------------------- #
async def accrue_for_ride(referred_user_id: int, ride_total_rc: int) -> int:
    """Add the recruiter's 10% cut of one ride's earnings to their active
    referral window. Returns the RC accrued (0 when the rider isn't in an active
    window, or the cut rounds to nothing).

    Called from activity_service only when a ride *newly* earned RideCoin
    (``award_ride`` is idempotent and returns ``None`` on a re-sync), so a ride
    accrues at most once. Runs on the system session because the recruiter's row
    is invisible to the referred rider's RLS session.
    """
    bonus = bonus_for_ride(ride_total_rc)
    if bonus <= 0:
        return 0
    now = _now()
    async with async_session_maker() as db:
        result = await db.execute(
            select(Referral).where(
                Referral.referred_user_id == referred_user_id,
                Referral.claimed_at.is_(None),
                Referral.ends_on > now,
            )
        )
        ref = result.scalar_one_or_none()
        if ref is None:
            return 0
        ref.accrued_rc = int(ref.accrued_rc or 0) + bonus
        await db.commit()
        return bonus


# --------------------------------------------------------------------------- #
# Reads — the referred rider's real stats live behind RLS, so system session.
# --------------------------------------------------------------------------- #
@dataclass
class _RiderStats:
    handle: str
    avatar_url: str | None
    power_claimed: int      # RideCoin the referred rider earned in the window
    distance_km: float
    rides: int


async def _power_claimed(
    db: AsyncSession, uid: int, start: datetime, end: datetime
) -> int:
    """Sum of the referred rider's ride-earn + streak-bonus RideCoin over the
    window — the 'power' they claimed while referred (what the 10% is built on).
    Read cross-user on the system session."""
    result = await db.execute(
        select(PointsLedger.amount).where(
            PointsLedger.user_id == uid,
            PointsLedger.reason.in_((REASON_RIDE_EARN, REASON_STREAK_BONUS)),
            PointsLedger.created_at >= _aware(start),
            PointsLedger.created_at <= _aware(end),
        )
    )
    return int(sum(a for (a,) in result.all() if a))


async def _rider_stats(db: AsyncSession, ref: Referral, now: datetime) -> _RiderStats:
    """The referred rider's real training over the referral window so far."""
    uid = ref.referred_user_id
    if uid is None:
        return _RiderStats("Pending rider", None, 0, 0.0, 0)
    user = await db.get(User, uid)
    window_end = min(_aware(ref.ends_on), now)
    start_day = _aware(ref.started_at).date()
    end_day = window_end.date()
    distance_km = await challenge_value_for_user(db, uid, start_day, end_day, "distance_km")
    rides = await challenge_value_for_user(db, uid, start_day, end_day, "rides")
    power = await _power_claimed(db, uid, ref.started_at, window_end)
    return _RiderStats(
        handle=display_handle(user) if user else "Rider",
        avatar_url=getattr(user, "avatar_url", None) if user else None,
        power_claimed=power,
        distance_km=distance_km,
        rides=int(rides),
    )


def _card(ref: Referral, stats: _RiderStats, now: datetime) -> dict:
    left = time_left(ref.ends_on, now)
    claimed = ref.claimed_at is not None
    ended = left["ended"] or claimed
    accrued = int(ref.accrued_rc or 0)
    return {
        "id": ref.id,
        "referred_id": ref.referred_user_id,
        "handle": stats.handle,
        "avatar_url": stats.avatar_url,
        "accrued_rc": accrued,
        "power_claimed": stats.power_claimed,
        "distance_km": stats.distance_km,
        "rides": stats.rides,
        "ends_on": _aware(ref.ends_on).isoformat(),
        "started_at": _aware(ref.started_at).isoformat(),
        "time_left": left,
        "ended": ended,
        "claimed": claimed,
        "claimed_at": _aware(ref.claimed_at).isoformat() if claimed else None,
        # Claimable once the window has closed, there's something to pay, and it
        # hasn't been paid yet (the pen's "CLAIM NOW" tile).
        "claimable": bool(left["ended"] and not claimed and accrued > 0),
    }


async def list_mine(user_id: int) -> dict:
    """The recruiter's referrals split into active (window running) and completed
    (window ended or already claimed), each with the referred rider's real stats
    and the recruiter's accrued cut. Runs on the system session, scoped to this
    recruiter's rows."""
    now = _now()
    async with async_session_maker() as db:
        result = await db.execute(
            select(Referral)
            .where(Referral.referrer_user_id == user_id)
            .order_by(Referral.started_at.desc())
        )
        rows = list(result.scalars().all())
        active: list[dict] = []
        completed: list[dict] = []
        for ref in rows:
            stats = await _rider_stats(db, ref, now)
            card = _card(ref, stats, now)
            (completed if card["ended"] else active).append(card)

    return {
        "code": code_for_user(user_id),
        "active_count": len(active),
        "completed_count": len(completed),
        "active": active,
        "completed": completed,
    }


async def user_detail(user_id: int, referred_id: int) -> dict | None:
    """One referred rider's full detail card (the pen's pending/ended rider
    screen), or ``None`` when this recruiter has no such referral. System
    session, but ownership is enforced by filtering on ``referrer_user_id``."""
    now = _now()
    async with async_session_maker() as db:
        result = await db.execute(
            select(Referral).where(
                Referral.referrer_user_id == user_id,
                Referral.referred_user_id == referred_id,
            )
        )
        ref = result.scalar_one_or_none()
        if ref is None:
            return None
        stats = await _rider_stats(db, ref, now)
        return _card(ref, stats, now)


# --------------------------------------------------------------------------- #
# Claim — pay the accrued bonus into the recruiter's OWN wallet (RLS db).
# --------------------------------------------------------------------------- #
async def claim(db: AsyncSession, user_id: int, referral_id: int) -> dict:
    """Pay a completed referral's accrued bonus into the recruiter's ledger once
    (reason=referral_bonus), and stamp ``claimed_at``. Idempotent — a second
    claim pays nothing. Runs on the request's RLS db: the referral and the wallet
    both belong to the caller, so RLS both authorises and scopes it.

    Returns ``{paid, already, accrued, wallet}`` on success, or a structured
    ``{error}`` (not_found / not_ended / nothing_to_claim) the API maps to a 4xx.
    """
    ref = await db.get(Referral, referral_id)
    # RLS makes another recruiter's row invisible → None is "not yours / gone".
    if ref is None or ref.referrer_user_id != user_id:
        return {"error": "not_found"}
    if ref.claimed_at is not None:
        wallet = await rewards.get_wallet(db, user_id)
        return {"paid": 0, "already": True, "accrued": int(ref.accrued_rc or 0),
                "wallet": wallet}
    if not _aware(ref.ends_on) <= _now():
        return {"error": "not_ended"}
    accrued = int(ref.accrued_rc or 0)
    if accrued <= 0:
        return {"error": "nothing_to_claim"}

    await rewards._credit(
        db, user_id, REASON_REFERRAL_BONUS, accrued,
        context={"referral_id": ref.id, "referred_user_id": ref.referred_user_id},
    )
    ref.claimed_at = _now()
    await db.commit()
    wallet = await rewards.get_wallet(db, user_id)
    return {"paid": accrued, "already": False, "accrued": accrued, "wallet": wallet}
