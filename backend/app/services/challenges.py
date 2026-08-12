"""Challenge subsystem — app-defined monthly targets with real progress and
real RideCoin payouts.

Design (grounded in the RideCoin spec's tier model,
docs/superpowers/specs/2026-08-12-ridecoin-point-system-design.md §5b):

- The catalog is a fixed set of monthly challenge templates (code, not a DB
  table): a metric, a target, and a tier. Kept to the metrics the crew-score
  engine already computes from real activities, so progress is never faked.
- A rider *joins* a challenge; progress is computed live from their own rides
  over the athlete-local month (reusing `crew_score.challenge_value_for_user`).
- On reaching the target, a **fixed tier reward** is paid once via the points
  ledger (reason=challenge_bonus), idempotent. Fixed rewards (not the spec's
  variable completion multiplier) keep the payout legible on the UI — a rider
  sees exactly what a challenge is worth before starting — while staying inside
  the spec's economy scale (bronze<silver<gold, all ≤ a mid shop item).

Completion is detected on read (`list_mine`), the same detect-and-persist
pattern the achievements service uses.
"""
from __future__ import annotations

import calendar
import logging
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.challenge import ChallengeEnrollment
from app.models.rewards import REASON_CHALLENGE_BONUS
from app.services import rewards
from app.services.crew_score import CHALLENGE_METRICS, challenge_value_for_user

logger = logging.getLogger(__name__)

# Fixed tier rewards — inside the shop scale (§6: entry 300, mid 900). A gold
# monthly challenge pays near a mid item; bronze near an entry item.
TIER_REWARD = {"bronze": 300, "silver": 500, "gold": 800}


@dataclass(frozen=True)
class ChallengeTemplate:
    key: str
    title: str
    detail: str
    metric: str          # one of crew_score.CHALLENGE_METRICS
    target: float
    tier: str            # bronze | silver | gold

    @property
    def reward_rc(self) -> int:
        return TIER_REWARD[self.tier]


# The monthly catalog. Targets are shaped for a committed rider over one month;
# every metric is one the activity engine computes for real.
CATALOG: tuple[ChallengeTemplate, ...] = (
    ChallengeTemplate(
        key="show_up_20", title="Show up ×20",
        detail="Ride on 20 days this month. Consistency is the whole game.",
        metric="active_days", target=20, tier="silver",
    ),
    ChallengeTemplate(
        key="distance_600", title="600 km month",
        detail="Cover 600 km before the month is out.",
        metric="distance_km", target=600, tier="silver",
    ),
    ChallengeTemplate(
        key="build_engine", title="Build the engine",
        detail="Bank 2,000 TSS of training stress this month.",
        metric="tss", target=2000, tier="gold",
    ),
    ChallengeTemplate(
        key="fifteen_rides", title="Fifteen rides",
        detail="Log 15 rides this month — any distance counts.",
        metric="rides", target=15, tier="bronze",
    ),
)

_BY_KEY = {t.key: t for t in CATALOG}

# Sanity: catalog metrics must be ones the score engine understands.
assert all(t.metric in CHALLENGE_METRICS for t in CATALOG)
assert all(t.tier in TIER_REWARD for t in CATALOG)


def current_period(today: date | None = None) -> str:
    d = today or datetime.now(timezone.utc).date()
    return f"{d.year:04d}-{d.month:02d}"


def period_bounds(period: str) -> tuple[date, date]:
    """First and last calendar day of a "YYYY-MM" period (inclusive)."""
    year, month = (int(x) for x in period.split("-"))
    last = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last)


def is_complete(value: float, target: float) -> bool:
    return target > 0 and value >= target


def pct(value: float, target: float) -> int:
    if target <= 0:
        return 0
    return max(0, min(100, round((value / target) * 100)))


def _serialize(t: ChallengeTemplate, *, value: float, enrolled: bool,
               completed: bool, awarded_rc: int | None) -> dict:
    return {
        "key": t.key,
        "title": t.title,
        "detail": t.detail,
        "metric": t.metric,
        "target": t.target,
        "tier": t.tier,
        "reward_rc": t.reward_rc,
        "value": value,
        "pct": pct(value, t.target),
        "enrolled": enrolled,
        "completed": completed,
        "awarded_rc": awarded_rc,
    }


# --- Custom (rider-created) challenges --------------------------------------
# A rider defines their own monthly target. The metric must be one the score
# engine computes for real; the tier (and thus the reward) is derived from how
# ambitious the target is relative to the catalog's reference targets, so a
# rider can't mint a gold reward from a trivial goal.
CUSTOM_PREFIX = "custom:"
MAX_CUSTOM_ACTIVE = 5

# Reference monthly targets per metric → what a "silver" month looks like. Tier
# scales off the ratio to this reference.
_REFERENCE_TARGET = {
    "active_days": 20, "distance_km": 600, "tss": 1800,
    "rides": 15, "hours": 40, "kj": 24000,
}


def tier_for_custom(metric: str, target: float) -> str:
    """Derive a tier from how ambitious a custom target is vs the reference."""
    ref = _REFERENCE_TARGET.get(metric)
    if not ref or target <= 0:
        return "bronze"
    ratio = target / ref
    if ratio >= 1.5:
        return "gold"
    if ratio >= 0.75:
        return "silver"
    return "bronze"


def _serialize_row(row: ChallengeEnrollment, *, value: float) -> dict:
    """Serialize a stored enrollment (used for custom challenges, which have no
    catalog template)."""
    return {
        "key": row.challenge_key,
        "title": row.title or "My challenge",
        "detail": f"{_fmt_target(row.metric, row.target)} this month.",
        "metric": row.metric,
        "target": row.target,
        "tier": row.tier,
        "reward_rc": row.reward_rc,
        "value": value,
        "pct": pct(value, row.target),
        "enrolled": True,
        "completed": row.awarded_rc is not None,
        "awarded_rc": row.awarded_rc,
        "custom": True,
    }


def _fmt_target(metric: str, target: float) -> str:
    unit = {"active_days": "days", "distance_km": "km", "tss": "TSS",
            "rides": "rides", "hours": "h", "kj": "kJ"}.get(metric, "")
    return f"{round(target):,} {unit}".strip()


async def create_custom(
    db: AsyncSession, user_id: int, title: str, metric: str, target: float,
) -> dict:
    """Create a rider-defined monthly challenge. Validates the metric + target,
    derives the tier/reward, and enrolls the rider for the current month."""
    if metric not in CHALLENGE_METRICS:
        raise ValueError(f"unknown metric: {metric}")
    if target <= 0:
        raise ValueError("target must be positive")
    title = (title or "").strip()[:80] or "My challenge"

    period = current_period()
    # Cap how many custom challenges run at once, so the reward faucet stays sane.
    existing = await db.execute(
        select(ChallengeEnrollment).where(
            ChallengeEnrollment.user_id == user_id,
            ChallengeEnrollment.period == period,
            ChallengeEnrollment.challenge_key.startswith(CUSTOM_PREFIX),
        )
    )
    if len(list(existing.scalars().all())) >= MAX_CUSTOM_ACTIVE:
        raise ValueError("too_many_custom")

    tier = tier_for_custom(metric, target)
    starts_on, ends_on = period_bounds(period)
    key = f"{CUSTOM_PREFIX}{uuid.uuid4().hex[:12]}"
    row = ChallengeEnrollment(
        user_id=user_id, challenge_key=key, period=period,
        metric=metric, target=float(target), tier=tier, reward_rc=TIER_REWARD[tier],
        title=title, starts_on=starts_on, ends_on=ends_on,
    )
    db.add(row)
    await db.flush()
    await db.commit()
    return {"created": key, "tier": tier, "reward_rc": TIER_REWARD[tier]}


async def _get_own_custom(
    db: AsyncSession, user_id: int, key: str
) -> ChallengeEnrollment | None:
    if not key.startswith(CUSTOM_PREFIX):
        return None
    res = await db.execute(
        select(ChallengeEnrollment).where(
            ChallengeEnrollment.user_id == user_id,
            ChallengeEnrollment.challenge_key == key,
            ChallengeEnrollment.period == current_period(),
        )
    )
    return res.scalar_one_or_none()


async def edit_custom(
    db: AsyncSession, user_id: int, key: str,
    title: str | None = None, target: float | None = None,
) -> dict:
    """Edit a custom challenge's title/target (recomputing tier+reward) — only
    before it has been completed/paid."""
    row = await _get_own_custom(db, user_id, key)
    if row is None:
        raise ValueError("not_found")
    if row.awarded_rc is not None:
        raise ValueError("already_completed")
    if title is not None:
        row.title = title.strip()[:80] or row.title
    if target is not None:
        if target <= 0:
            raise ValueError("target must be positive")
        row.target = float(target)
        row.tier = tier_for_custom(row.metric, row.target)
        row.reward_rc = TIER_REWARD[row.tier]
    await db.commit()
    return {"edited": key, "tier": row.tier, "reward_rc": row.reward_rc, "target": row.target}


async def delete_custom(db: AsyncSession, user_id: int, key: str) -> dict:
    """Drop a custom challenge — only before it has paid out."""
    row = await _get_own_custom(db, user_id, key)
    if row is None:
        raise ValueError("not_found")
    if row.awarded_rc is not None:
        raise ValueError("already_completed")
    await db.delete(row)
    await db.commit()
    return {"deleted": key}


async def join(db: AsyncSession, user_id: int, key: str) -> dict:
    """Enroll the rider in a catalog challenge for the current month (idempotent
    — re-joining returns the existing enrollment)."""
    t = _BY_KEY.get(key)
    if t is None:
        raise ValueError(f"unknown challenge: {key}")

    period = current_period()
    existing = await db.execute(
        select(ChallengeEnrollment).where(
            ChallengeEnrollment.user_id == user_id,
            ChallengeEnrollment.challenge_key == key,
            ChallengeEnrollment.period == period,
        )
    )
    row = existing.scalar_one_or_none()
    if row is None:
        starts_on, ends_on = period_bounds(period)
        row = ChallengeEnrollment(
            user_id=user_id, challenge_key=key, period=period,
            metric=t.metric, target=t.target, tier=t.tier, reward_rc=t.reward_rc,
            starts_on=starts_on, ends_on=ends_on,
        )
        db.add(row)
        await db.flush()
    await db.commit()
    return {"joined": key, "period": period}


async def _award_if_complete(
    db: AsyncSession, row: ChallengeEnrollment, value: float
) -> None:
    """Pay the fixed tier reward once when the target is met. No-op if already
    awarded or not yet complete. Caller commits."""
    if row.awarded_rc is not None:
        return
    if not is_complete(value, row.target):
        return
    await rewards._credit(
        db, row.user_id, REASON_CHALLENGE_BONUS, int(row.reward_rc),
        context={"challenge_key": row.challenge_key, "period": row.period,
                 "tier": row.tier},
    )
    row.completed_at = datetime.now(timezone.utc)
    row.awarded_rc = int(row.reward_rc)


async def list_mine(db: AsyncSession, user_id: int) -> dict:
    """The rider's active challenges (with live progress, auto-completing on
    target) plus the still-joinable catalog, for the current month."""
    period = current_period()
    rows = await db.execute(
        select(ChallengeEnrollment).where(
            ChallengeEnrollment.user_id == user_id,
            ChallengeEnrollment.period == period,
        )
    )
    enrolled = {r.challenge_key: r for r in rows.scalars().all()}

    active: list[dict] = []
    awarded_any = False
    for key, row in enrolled.items():
        is_custom = key.startswith(CUSTOM_PREFIX)
        t = _BY_KEY.get(key)
        if t is None and not is_custom:
            continue  # a retired catalog entry — skip from the live view
        value = await challenge_value_for_user(
            db, user_id, row.starts_on, row.ends_on, row.metric,
        )
        if row.awarded_rc is None:
            before = row.awarded_rc
            await _award_if_complete(db, row, value)
            if row.awarded_rc != before:
                awarded_any = True
        if is_custom:
            active.append(_serialize_row(row, value=value))
        else:
            active.append(_serialize(
                t, value=value, enrolled=True,
                completed=row.awarded_rc is not None, awarded_rc=row.awarded_rc,
            ))

    if awarded_any:
        await db.commit()

    available = [
        _serialize(t, value=0.0, enrolled=False, completed=False, awarded_rc=None)
        for t in CATALOG if t.key not in enrolled
    ]

    # Stable, friendly ordering: active first (least-complete first so the next
    # win is on top), then joinable by tier value.
    active.sort(key=lambda c: (c["completed"], -c["pct"]))
    return {"period": period, "active": active, "available": available}
