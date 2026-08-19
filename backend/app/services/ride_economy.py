"""What a finished ride does to the bike economy.

ONE entry point, called from `activity_service` right after `rewards.award_ride`:

    ride → odometers move → equipped gear pays → a new Eddington pays

Everything is idempotent per activity, because ingestion replays. `award_ride`
already guarantees this for the base earn; each step here carries its own guard,
because "the odometers moved twice" would inflate both the Service Bonus and the
rider's lifetime chain record — the two numbers this system most needs to be
true.

DEFENSIVE BY CONSTRUCTION. Every step is wrapped and logged, and the caller
wraps this whole function again. A rider's ride is sacred; the game on top of it
is not. Nothing in here may ever prevent an activity from being saved.

FACTS ARE READ, NEVER GUESSED. `earn_modifiers` refuses to fire a modifier whose
fact is None, so this module's job is to report honestly rather than to fill
gaps. A ride with no weather record has `was_wet=None` and simply does not earn
the mudguard bonus — it never earns it "probably".
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.rewards import REASON_EDDINGTON, REASON_GEAR_BONUS
from app.services import earn_modifiers as em
from app.services import bike_wear, eddington, gear, rewards, workshop

logger = logging.getLogger(__name__)

#: Rides below this are not counted toward Eddington or the odometers. A GPS
#: glitch that records a 0.3 km "ride" should not touch either.
MIN_KM = 1.0


async def _ride_facts(
    db: AsyncSession, user_id: int, activity: Activity, chain_km_since: float
) -> em.RideFacts:
    """Translate one activity into the facts the modifiers ask about.

    Fields the activity cannot answer are left None on purpose — see the module
    docstring. `surface`, `was_wet`, `temp_c`, `with_crew` and
    `honoured_easy_day` are not columns on `activities`; they are left None
    until each has a real source, which means the items depending on them
    simply do not fire yet rather than firing on a guess.
    """
    dist = activity.distance_meters
    dur = activity.duration_seconds
    avg_kmh = (dist / 1000) / (dur / 3600) if dist and dur else None

    # IF from the Coggan relation, exactly as the plan side computes it.
    iff = None
    if activity.tss and dur and dur > 0:
        iff = (activity.tss / ((dur / 3600) * 100)) ** 0.5

    started = activity.started_at
    return em.RideFacts(
        distance_m=dist,
        elevation_gain_m=activity.elevation_gain_m,
        duration_s=dur,
        avg_speed_kmh=avg_kmh,
        start_hour=started.hour if started else None,
        intensity_factor=iff,
        has_power=activity.average_power is not None,
        drivetrain_fresh=bike_wear.drivetrain_fresh(chain_km_since),
    )


async def _chain_km_since(db: AsyncSession, user_id: int) -> float:
    view = await workshop.read(db, user_id)
    chain = next((c for c in view.components if c.id == bike_wear.DRIVETRAIN), None)
    return chain.km_since if chain else 0.0


async def _pay_gear(
    db: AsyncSession, user_id: int, activity: Activity, base_rc: int, chain_km: float
) -> int:
    """Credit what the equipped loadout added. Returns the RideCoin paid.

    Idempotent through the ledger's own `(user_id, activity_id, reason)`
    uniqueness rule — the same guard `award_ride` relies on — so a re-sync
    cannot pay the gear bonus twice.
    """
    if base_rc <= 0:
        return 0
    equipped = await gear.equipped_ids(db, user_id)
    facts = await _ride_facts(db, user_id, activity, chain_km)
    breakdown = em.resolve(equipped, facts)
    bonus = em.bonus_rc(base_rc, breakdown)
    if bonus <= 0:
        return 0

    if await rewards._already_awarded(db, user_id, activity.id, REASON_GEAR_BONUS):
        return 0

    await rewards._credit(
        db, user_id, REASON_GEAR_BONUS, bonus, activity_id=activity.id,
        context={
            "pct": breakdown.total_pct,
            "capped": breakdown.capped,
            "fired": [h.id for h in breakdown.hits if h.fired],
            "sets": [s.id for s in breakdown.sets if s.fired],
        },
    )
    return bonus


async def _pay_eddington(db: AsyncSession, user_id: int) -> int:
    """Pay a milestone if this ride pushed the rider onto one.

    Recomputed from the full ride history rather than tracked incrementally,
    because E is a property of the whole set and a cached value that drifted
    would be both wrong and very hard to notice. The history is one indexed
    column read; correctness is worth more than the query.

    Idempotent by ledger lookup on the milestone's own context — a rider can
    reach E50 exactly once, so paying it twice is the failure to guard against.
    """
    rows = (
        await db.execute(
            select(Activity.distance_meters).where(
                Activity.user_id == user_id,
                Activity.sport == "cycling",
                Activity.distance_meters.isnot(None),
            )
        )
    ).scalars()
    km = [d / 1000 for d in rows if d and d / 1000 >= MIN_KM]
    e = eddington.compute(km)
    if not eddington.is_milestone(e):
        return 0

    payout = eddington.milestone_rc(e)
    if payout <= 0:
        return 0

    from app.models.rewards import PointsLedger

    already = (
        await db.execute(
            select(PointsLedger.id).where(
                PointsLedger.user_id == user_id,
                PointsLedger.reason == REASON_EDDINGTON,
                PointsLedger.context["e"].astext == str(e),
            )
        )
    ).first()
    if already:
        return 0

    await rewards._credit(
        db, user_id, REASON_EDDINGTON, payout, context={"e": e},
    )
    return payout


async def settle(
    db: AsyncSession, user_id: int, activity: Activity, base_rc: int
) -> dict:
    """Everything a finished ride does to the bike, in one call.

    `base_rc` is what `award_ride` just paid; the gear bonus is a percentage of
    it, so a ride that earned nothing (a re-sync) also adds no gear bonus.

    Returns a small summary for logging. Never raises: each step is guarded
    independently so one failing cannot cost the rider the others.
    """
    result = {"km_accrued": 0.0, "gear_rc": 0, "eddington_rc": 0}
    if activity.sport != "cycling":
        return result

    km = (activity.distance_meters or 0) / 1000
    if km < MIN_KM:
        return result

    # Read the chain BEFORE accruing: the fresh-drivetrain bonus describes the
    # state the bike was in FOR this ride, not the state it is in after it.
    # Accruing first would let a ride push the chain past its interval and then
    # deny that same ride the bonus it was actually ridden with.
    try:
        chain_km = await _chain_km_since(db, user_id)
    except Exception:
        logger.warning("workshop read failed for user_id=%s", user_id, exc_info=True)
        chain_km = 0.0

    try:
        gear_rc = await _pay_gear(db, user_id, activity, base_rc, chain_km)
        result["gear_rc"] = gear_rc
    except Exception:
        logger.warning("gear bonus failed for user_id=%s", user_id, exc_info=True)

    try:
        if await workshop.accrue(db, user_id, activity.id, activity.distance_meters):
            result["km_accrued"] = km
    except Exception:
        logger.warning("odometer accrual failed for user_id=%s", user_id, exc_info=True)

    try:
        result["eddington_rc"] = await _pay_eddington(db, user_id)
    except Exception:
        logger.warning("eddington payout failed for user_id=%s", user_id, exc_info=True)

    return result
