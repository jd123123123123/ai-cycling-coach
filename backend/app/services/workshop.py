"""The workshop: reading the bike's condition, and harvesting a service.

Persistence and money for `bike_wear`'s pure model. Three operations:

  · `read`   — every component's live state, plus the drivetrain summary.
  · `accrue` — fold one ride's kilometres into every odometer. Idempotent.
  · `service`— reset one component and PAY its banked Service Bonus.

Two invariants this layer must never break, both of which the pure model already
guarantees and which it would be easy to lose here:

  1. NOTHING EVER DEBITS. `service` credits. There is no path in this file that
     calls `rewards.spend`, and there must not be: the moment maintenance can
     take RideCoin, the harvest loop has become the punitive decay loop the
     whole design exists to avoid.
  2. `km_total` SURVIVES A SERVICE. Only `km_since_service` resets. The lifetime
     number is the thing riders care most about and the easiest to destroy with
     one careless assignment.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bike_wear import BikeComponent
from app.models.rewards import REASON_SERVICE_BONUS
from app.services import bike_wear, rewards


@dataclass(frozen=True)
class WorkshopView:
    """Everything the garage screen needs in one read."""

    components: list[bike_wear.ComponentState]
    #: Sum of every component's unharvested bonus — the headline number.
    total_bonus_rc: int
    #: Whether the fresh-drivetrain earn bonus is currently live.
    drivetrain_fresh: bool
    #: The real drag of a dirty chain in watts, or None when there is none.
    drivetrain_watts: float | None
    #: Lifetime km on the current chain — the number worth bragging about.
    chain_km_total: float
    #: The best run this rider has ever got out of a chain.
    chain_record_km: float


async def _rows(db: AsyncSession, user_id: int) -> dict[str, BikeComponent]:
    """Every component row for this rider, created lazily where missing.

    Lazy creation is what lets a component be added to the catalogue later
    without a backfill — it simply starts existing at zero for everyone.
    """
    found = {
        row.component_id: row
        for row in (
            await db.execute(
                select(BikeComponent).where(BikeComponent.user_id == user_id)
            )
        ).scalars()
    }
    for cid in bike_wear.COMPONENTS:
        if cid not in found:
            row = BikeComponent(user_id=user_id, component_id=cid)
            db.add(row)
            found[cid] = row
    await db.flush()
    return found


async def read(db: AsyncSession, user_id: int) -> WorkshopView:
    """The bike's condition right now. A writer, because of lazy row creation —
    the caller must commit, exactly as `/garage` already does for its grant."""
    rows = await _rows(db, user_id)
    states = [
        bike_wear.state_of(cid, rows[cid].km_since_service, rows[cid].km_total)
        for cid in bike_wear.COMPONENTS
    ]
    chain = rows[bike_wear.DRIVETRAIN]
    return WorkshopView(
        components=states,
        total_bonus_rc=sum(s.bonus_rc for s in states),
        drivetrain_fresh=bike_wear.drivetrain_fresh(chain.km_since_service),
        drivetrain_watts=bike_wear.efficiency_watts(chain.km_since_service),
        chain_km_total=chain.km_total,
        chain_record_km=max(chain.longest_run_km, chain.km_since_service),
    )


async def accrue(
    db: AsyncSession, user_id: int, activity_id: int, distance_m: float | None
) -> bool:
    """Fold one ride's distance into every odometer. True when it counted.

    IDEMPOTENT ON `activity_id`. Ingestion replays, and an odometer that
    double-counts a ride would quietly inflate both the harvest and the rider's
    lifetime chain record — the two numbers this system most needs to be true.
    Each row remembers the last activity it absorbed and refuses a repeat.
    """
    km = (distance_m or 0) / 1000
    if km <= 0:
        return False

    rows = await _rows(db, user_id)
    counted = False
    for row in rows.values():
        if row.last_activity_id == activity_id:
            continue
        row.km_since_service += km
        row.km_total += km
        row.last_activity_id = activity_id
        counted = True
    return counted


class UnknownComponentError(Exception):
    pass


@dataclass(frozen=True)
class ServiceResult:
    component_id: str
    name_de: str
    #: RideCoin actually paid. Zero is a legitimate outcome — servicing a chain
    #: you cleaned yesterday pays nothing, and says so, rather than refusing.
    paid_rc: int
    balance: int
    km_serviced: float
    #: True when this run beat the rider's own record for this component.
    new_record: bool
    record_km: float


async def service(db: AsyncSession, user_id: int, component_id: str) -> ServiceResult:
    """Service one component: pay its banked bonus, then reset its interval.

    The order matters. The payout is computed from `km_since_service` BEFORE the
    reset, because the reset is what destroys it — swap these two and every
    service silently pays zero, which is the kind of bug that looks like a
    balance-tuning problem for a month.

    Never raises on "too soon". A rider who services early is paid the little
    they banked and gets a fresh drivetrain, which is a fair trade they are
    allowed to make.
    """
    if component_id not in bike_wear.COMPONENTS:
        raise UnknownComponentError(component_id)

    spec = bike_wear.COMPONENTS[component_id]
    rows = await _rows(db, user_id)
    row = rows[component_id]

    km = row.km_since_service
    payout = bike_wear.accrued_rc(km, spec)

    # The record is captured here because `km_since_service` is about to be
    # destroyed, and this run is only a record if it beat the stored best.
    new_record = km > row.longest_run_km
    if new_record:
        row.longest_run_km = km

    row.km_since_service = 0.0
    row.services += 1
    row.last_service_at = datetime.now(timezone.utc)

    balance = await rewards.balance_of(db, user_id)
    if payout > 0:
        # A CREDIT. There is deliberately no debit path in this file.
        await rewards._credit(
            db, user_id, REASON_SERVICE_BONUS, payout,
            context={"component": component_id, "km": round(km, 1)},
        )
        balance += payout

    return ServiceResult(
        component_id=component_id,
        name_de=spec.name_de,
        paid_rc=payout,
        balance=balance,
        km_serviced=round(km, 1),
        new_record=new_record,
        record_km=round(row.longest_run_km, 1),
    )
