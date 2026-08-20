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
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.bike_wear import BikeComponent
from app.models.rewards import REASON_SERVICE_BONUS
from app.services import bike_wear, rewards, service_proof


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


def _days_since(when: datetime | None, now: datetime) -> int | None:
    """Whole days between a service and now, or None if it never happened.

    None rather than zero, and the difference matters: a part we have never been
    told about has an UNKNOWN age, and defaulting that to "serviced today" would
    quietly mark every rider's brake fluid fresh forever.
    """
    if when is None:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    return max(0, (now - when).days)


async def read(db: AsyncSession, user_id: int) -> WorkshopView:
    """The bike's condition right now. A writer, because of lazy row creation —
    the caller must commit, exactly as `/garage` already does for its grant."""
    rows = await _rows(db, user_id)
    now = datetime.now(UTC)
    states = [
        bike_wear.state_of(
            cid, rows[cid].km_since_service, rows[cid].km_total,
            days_since=_days_since(rows[cid].last_service_at, now),
            owned=rows[cid].owned,
        )
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
    db: AsyncSession, user_id: int, activity_id: int, distance_m: float | None,
    facts=None, kj: float | None = None, descent_m: float | None = None,
) -> bool:
    """Fold one ride into every odometer, weighted by what that ride cost. True
    when it counted.

    `facts` is the ride's `earn_modifiers.RideFacts`, `kj` its measured work and
    `descent_m` the metres it descended — all three already computed for this
    ride by other parts of the settlement, so none of this costs a lookup.

    Each component advances by what THIS ride did to IT: the chain by the work
    that passed through it, the pads by the height that had to be dissipated,
    the tyres by ground covered — each then scaled by the conditions the
    published interval never accounted for. See `bike_wear.equivalent_km`.
    Missing any of it falls back to plain distance, which is what this did
    before and remains the honest answer when a sensor was not there.

    TWO ODOMETERS, ON PURPOSE. `km_since_service` is the SERVICE clock and now
    carries the weighting — it is the number that decides when a job is due, and
    it should read in "kilometres this component has felt". `km_total` stays the
    lifetime distance the part has actually travelled, unweighted, because that
    one is a fact about the world rather than a model of wear: a rider who reads
    "4 000 km on this chain" means road, not a weighted figure only the app
    understands.

    IDEMPOTENT ON `activity_id`. Ingestion replays, and an odometer that
    double-counts a ride would quietly inflate both the harvest and the rider's
    lifetime chain record — the two numbers this system most needs to be true.
    Each row remembers the last activity it absorbed and refuses a repeat.
    """
    km = (distance_m or 0) / 1000
    if km <= 0:
        return False

    load = bike_wear.RideLoad(distance_km=km, kj=kj, descent_m=descent_m)
    rows = await _rows(db, user_id)
    counted = False
    for cid, row in rows.items():
        if row.last_activity_id == activity_id:
            continue
        row.km_since_service += bike_wear.equivalent_km(cid, load, facts)
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
    #: RideCoin the photo added on top. Zero when there was no photo, when the
    #: check could not run, and when it ran and did not confirm — three
    #: different stories that all pay the same, because none of them is the
    #: rider's fault.
    proof_rc: int = 0
    #: What the check saw, in one German sentence. None when no photo was sent.
    proof_note: str | None = None
    #: True only when a photo was actually confirmed — the flag the screen uses
    #: to decide whether to celebrate, distinct from `proof_rc > 0` so the two
    #: can never drift apart.
    proof_confirmed: bool = False


async def service(
    db: AsyncSession, user_id: int, component_id: str,
    proof: service_proof.ProofVerdict | None = None,
) -> ServiceResult:
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

    now = datetime.now(UTC)
    km = row.km_since_service
    days = _days_since(row.last_service_at, now)
    payout = bike_wear.accrued_rc(km, spec, days)

    # The record is captured here because `km_since_service` is about to be
    # destroyed, and this run is only a record if it beat the stored best.
    new_record = km > row.longest_run_km
    if new_record:
        row.longest_run_km = km

    row.km_since_service = 0.0
    row.services += 1
    row.last_service_at = now
    # Servicing a part is the strongest possible evidence the bicycle has one,
    # so a rider who bleeds their brakes never gets asked whether they have
    # hydraulic brakes.
    row.owned = True

    # The photo ADDS. It is computed from the base payout and credited in the
    # same transaction, so a rider can never be shown a proof bonus that failed
    # to land — and a service with no photo, or one the model could not read,
    # pays exactly what it always did.
    proof_rc = service_proof.bonus_rc(payout, proof) if proof else 0
    payout += proof_rc

    balance = await rewards.balance_of(db, user_id)
    if payout > 0:
        # A CREDIT. There is deliberately no debit path in this file.
        await rewards._credit(
            db, user_id, REASON_SERVICE_BONUS, payout,
            context={
                "component": component_id, "km": round(km, 1),
                **({"proof_rc": proof_rc} if proof_rc else {}),
            },
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
        proof_rc=proof_rc,
        proof_note=proof.note_de if proof else None,
        proof_confirmed=bool(proof and proof.confirmed),
    )


# ── starting the clock from the truth ───────────────────────────────────────
#
# Every odometer in this table starts at zero, and zero is almost always a lie.
# A rider installing this app has a bicycle with a history: a chain they oiled
# last Sunday, pads they replaced in spring, sealant they have not thought about
# since March. Starting everything at zero tells them their four-year-old brake
# fluid is fresh, and the first thing the maintenance surface ever says to them
# is false.
#
# So we ask one question per part — "wann zuletzt?" — and then we do NOT estimate
# from the answer. We REPLAY it. Every ride since that date is already in the
# database with its distance, its measured work and its elevation, so the same
# physics that scores a ride at ingestion scores the backlog, and the rider lands
# on a number that is as true as if the app had been installed all along.


@dataclass(frozen=True)
class SeedResult:
    component_id: str
    name_de: str
    #: Weighted kilometres recovered from the ride history.
    km_since: float
    #: How many rides were replayed to get there — the number that makes the
    #: answer believable on screen ("aus 34 Fahrten berechnet").
    rides: int
    days_since: int
    state: bike_wear.ComponentState


async def seed(
    db: AsyncSession, user_id: int, component_id: str, since: datetime,
) -> SeedResult:
    """Start one component's clock at a date the rider gives us, and rebuild the
    odometer by replaying every ride since.

    ONE HONEST APPROXIMATION, stated rather than hidden. The live path reads
    descent from the altitude stream, summing every drop; replaying years of
    streams to answer one question would be minutes of work, so the backfill uses
    each ride's recorded ELEVATION GAIN as its descent. On a loop — which is what
    almost every ride from home is — the two are the same number, and on a
    point-to-point they differ by the net, which is small against the total. The
    weighting from `earn_modifiers` (rain, cold, dust) is not applied at all
    here, because those conditions were not recorded per ride at the time. The
    seed is therefore a slight UNDER-estimate of wear, which is the correct
    direction to be wrong in: it can only make us ask later, never earlier.
    """
    if component_id not in bike_wear.COMPONENTS:
        raise UnknownComponentError(component_id)

    if since.tzinfo is None:
        since = since.replace(tzinfo=UTC)
    now = datetime.now(UTC)
    since = min(since, now)

    rides = (
        await db.execute(
            select(
                Activity.distance_meters,
                Activity.elevation_gain_m,
                ActivityStream.total_kj,
            )
            .outerjoin(ActivityStream, ActivityStream.activity_id == Activity.id)
            .where(
                Activity.user_id == user_id,
                Activity.sport == "cycling",
                Activity.started_at >= since,
            )
        )
    ).all()

    km_since = 0.0
    counted = 0
    for distance_m, gain_m, kj in rides:
        km = (distance_m or 0) / 1000
        if km <= 0:
            continue
        counted += 1
        km_since += bike_wear.equivalent_km(
            component_id,
            bike_wear.RideLoad(distance_km=km, kj=kj, descent_m=gain_m),
        )

    row = (await _rows(db, user_id))[component_id]
    row.km_since_service = km_since
    row.last_service_at = since
    row.owned = True

    days = _days_since(since, now) or 0
    return SeedResult(
        component_id=component_id,
        name_de=bike_wear.COMPONENTS[component_id].name_de,
        km_since=round(km_since, 1),
        rides=counted,
        days_since=days,
        state=bike_wear.state_of(
            component_id, km_since, row.km_total, days_since=days, owned=True,
        ),
    )


async def declare(
    db: AsyncSession, user_id: int, component_id: str, owned: bool,
) -> bike_wear.ComponentState:
    """Record whether the bicycle even has an optional part.

    "Nein" is a first-class answer and it is permanent until changed: a rim-brake
    rider is never asked about brake fluid again. This is the whole reason
    `owned` is a tri-state rather than a boolean — "no" and "not yet asked" look
    identical in a boolean column, so the app would keep asking forever.
    """
    if component_id not in bike_wear.COMPONENTS:
        raise UnknownComponentError(component_id)
    row = (await _rows(db, user_id))[component_id]
    row.owned = owned
    if not owned:
        row.km_since_service = 0.0
    return bike_wear.state_of(
        component_id, row.km_since_service, row.km_total,
        days_since=_days_since(row.last_service_at, datetime.now(UTC)),
        owned=owned,
    )


def open_questions(view: WorkshopView) -> list[bike_wear.ComponentState]:
    """The parts we still have to ask about, so the app can ask ONE at a time.

    Batching these into a setup wizard was the obvious design and the wrong one:
    six questions about parts before the first ride is a form, and forms get
    abandoned. One question, surfaced when the workshop is already open, is a
    conversation.
    """
    return [s for s in view.components if s.dormant]
