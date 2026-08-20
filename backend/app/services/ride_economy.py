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
from app.models.activity_stream import ActivityStream
from app.models.garage import RiderBackdrop
from app.models.rewards import REASON_EDDINGTON, REASON_GEAR_BONUS
from app.services import (
    backdrops,
    bike_wear,
    eddington,
    gear,
    places,
    rewards,
    ride_facts,
    ride_place,
    workshop,
)
from app.services import earn_modifiers as em
from app.services.ride_scene import RideGeo

logger = logging.getLogger(__name__)

#: Rides below this are not counted toward Eddington or the odometers. A GPS
#: glitch that records a 0.3 km "ride" should not touch either.
MIN_KM = 1.0


async def _ride_facts(
    db: AsyncSession, user_id: int, activity: Activity, chain_km_since: float,
    drivetrain_fresh: bool = False
) -> em.RideFacts:
    """Translate one activity into the facts the modifiers ask about.

    The five that `activities` cannot answer on its own — surface, wetness,
    temperature, crew and the easy-day judgement — are resolved by
    `ride_facts`, each from a real source and each returning None the moment it
    cannot answer honestly. A resolver failing costs its own fact and nothing
    else: the ride still earns everything the remaining facts support.
    """
    dist = activity.distance_meters
    dur = activity.duration_seconds
    avg_kmh = (dist / 1000) / (dur / 3600) if dist and dur else None

    # IF from the Coggan relation, exactly as the plan side computes it.
    iff = None
    if activity.tss and dur and dur > 0:
        iff = (activity.tss / ((dur / 3600) * 100)) ** 0.5

    async def _safe(coro, default):
        try:
            return await coro
        except Exception:
            logger.info("a ride fact failed to resolve (non-fatal)", exc_info=True)
            return default

    was_wet, temp_c = await _safe(ride_facts.weather_of(db, activity), (None, None))
    with_crew = await _safe(ride_facts.with_crew_of(db, user_id, activity), None)
    easy = await _safe(ride_facts.honoured_easy_day_of(db, user_id, activity), None)

    try:
        surface = ride_facts.surface_of(activity)
    except Exception:
        surface = None

    started = activity.started_at
    return em.RideFacts(
        distance_m=dist,
        elevation_gain_m=activity.elevation_gain_m,
        duration_s=dur,
        avg_speed_kmh=avg_kmh,
        was_wet=was_wet,
        temp_c=temp_c,
        surface=surface,
        start_hour=started.hour if started else None,
        intensity_factor=iff,
        with_crew=with_crew,
        honoured_easy_day=easy,
        has_power=activity.average_power is not None,
        drivetrain_fresh=drivetrain_fresh,
    )


async def _drivetrain(db: AsyncSession, user_id: int) -> tuple[float, bool]:
    """The chain's kilometres and whether the earn bonus is live.

    BOTH FROM THE SAME READ, and that is the point. This used to return the
    kilometres and let the caller re-derive freshness with
    `bike_wear.drivetrain_fresh(km)` — a second copy of the threshold, in a file
    that had no idea the rider's chain method could move it. A waxer on 300 km
    intervals would have been told by the workshop that their drivetrain was
    fresh and paid by the settlement as though it were not. One read, one
    answer.
    """
    view = await workshop.read(db, user_id)
    chain = next((c for c in view.components if c.id == bike_wear.DRIVETRAIN), None)
    return (chain.km_since if chain else 0.0), view.drivetrain_fresh


async def _pay_gear(
    db: AsyncSession, user_id: int, activity: Activity, base_rc: int, chain_km: float,
    facts: em.RideFacts | None = None,
) -> int:
    """Credit what the equipped loadout added. Returns the RideCoin paid.

    Idempotent through the ledger's own `(user_id, activity_id, reason)`
    uniqueness rule — the same guard `award_ride` relies on — so a re-sync
    cannot pay the gear bonus twice.
    """
    if base_rc <= 0:
        return 0
    equipped = await gear.equipped_ids(db, user_id)
    # Passed in by `settle`, which builds them once for the whole settlement.
    # Still resolved here when a caller has none, so this stays usable alone.
    if facts is None:
        # Freshness comes from the same read as the kilometres, never from a
        # default. Letting it fall back to False here would silently withhold
        # the fresh-drivetrain bonus from anyone reaching this path alone.
        _, fresh = await _drivetrain(db, user_id)
        facts = await _ride_facts(db, user_id, activity, chain_km, fresh)
    # The facts are already paid for here, weather included, so this is the one
    # place a stage gated on rain or cold can honestly be earned. Never fatal:
    # a rider must not lose the RideCoin their ride earned because a backdrop
    # failed to unlock. See `services.backdrops` and `models.garage.RiderBackdrop`.
    try:
        await _open_backdrops(db, user_id, activity, facts)
    except Exception:
        logger.info("a backdrop unlock failed (non-fatal)", exc_info=True)
    try:
        await _stamp_place(db, user_id, activity)
    except Exception:
        # Reverse geocoding is a network call to a text model. It failing must
        # cost this ride its passport stamp and absolutely nothing else.
        logger.info("a place stamp failed (non-fatal)", exc_info=True)
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


async def _open_backdrops(
    db: AsyncSession, user_id: int, activity: Activity, facts: em.RideFacts
) -> list[str]:
    """Record every stage this ride opened. Returns the newly earned ids.

    Insert-only and idempotent: a re-synced ride re-evaluates the same rules and
    the rows it would add are already there, so nothing changes. An unlock is
    permanent by construction rather than by policy — there is no code path that
    deletes one.
    """
    earned = backdrops.earned_by(facts)
    if not earned:
        return []
    have = set((await db.execute(
        select(RiderBackdrop.backdrop).where(RiderBackdrop.user_id == user_id)
    )).scalars().all())
    fresh = [b for b in earned if b not in have]
    for b in fresh:
        db.add(RiderBackdrop(user_id=user_id, backdrop=b, activity_id=activity.id))
    if fresh:
        await db.commit()
    return fresh


def _route_points(data: dict) -> list[tuple[float, float]]:
    """Six points spread evenly along the track.

    Evenly along the WHOLE ride, not the first six samples: a route's character
    is where it went, and the opening kilometre is usually the rider's own
    street. Six is enough for a resolver to see a lake circuit or a pass and
    few enough to stay a cheap prompt.
    """
    lats = [v for v in (data.get("latitude") or []) if v]
    lngs = [v for v in (data.get("longitude") or []) if v]
    n = min(len(lats), len(lngs))
    if n == 0:
        return []
    step = max(1, n // 6)
    return [(float(lats[i]), float(lngs[i])) for i in range(0, n, step)][:6]


def _descent_m(stream) -> float | None:
    """Metres descended, summed from the altitude stream.

    THE SUM OF NEGATIVE STEPS, not `max - min`: a ride that climbs and descends
    the same pass twice dissipates twice the energy, and the range would report
    it once. This is the quantity that wears brake pads.

    SMOOTHED WITH A 3 m DEADBAND, because barometric altimeters wander by a
    metre or two at rest and summing that noise over three hours invents
    hundreds of metres of descent that never happened. Three metres is below
    anything a rider would call a descent and above anything a sensor drifts.
    """
    if not isinstance(stream, dict):
        return None
    alt = [a for a in (stream.get("altitude") or []) if a is not None]
    if len(alt) < 2:
        return None

    total = 0.0
    ref = float(alt[0])
    for raw in alt[1:]:
        v = float(raw)
        if v <= ref - 3.0:
            total += ref - v
            ref = v
        elif v > ref:
            ref = v
    return total


async def _stamp_place(db: AsyncSession, user_id: int, activity: Activity) -> str | None:
    """Put this ride's place on the global map and stamp the rider's passport.

    Returns the place slug, or None when the ride cannot honestly be located —
    no GPS, no resolver, or a resolver that answered "I don't know". None is a
    completely normal outcome and never an error: an indoor ride belongs
    nowhere, and `ride_place.resolve` is built to say so rather than guess.

    THE STAMP IS THE ONLY THING EARNED HERE. It does not grant the backdrop —
    that still has to be bought — so a rider passing through the Dolomites gets
    the right to own them, not the picture. See `models.place`.
    """
    stream = (await db.execute(
        select(ActivityStream).where(ActivityStream.activity_id == activity.id)
    )).scalar_one_or_none()
    data = stream.streams if stream is not None else None
    if not isinstance(data, dict):
        return None
    lats = [v for v in (data.get("latitude") or []) if v]
    lngs = [v for v in (data.get("longitude") or []) if v]
    if not lats or not lngs:
        return None

    name = await ride_place.resolve(
        float(lats[0]), float(lngs[0]), points=_route_points(data),
    )
    if not name:
        return None

    geo = RideGeo(
        distance_m=activity.distance_meters,
        elevation_gain_m=activity.elevation_gain_m,
        start_lat=float(lats[0]),
        start_lng=float(lngs[0]),
        place_name=name,
    )
    place = await places.ensure(
        db, name, geo, user_id=user_id, activity_id=activity.id,
    )
    await places.stamp(db, user_id, place)
    return place.slug


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
        chain_km, chain_fresh = await _drivetrain(db, user_id)
    except Exception:
        logger.warning("workshop read failed for user_id=%s", user_id, exc_info=True)
        chain_km, chain_fresh = 0.0, False

    # ONE FACT SET FOR THE WHOLE SETTLEMENT. Resolving a ride's weather, surface
    # and crew costs a lookup each, and both the earn and the wear model need the
    # same answers — building them twice would double that cost and, worse, let
    # the two disagree about the same ride. Never fatal: a ride whose facts
    # cannot be resolved still earns and still counts kilometres, just unweighted.
    facts = None
    try:
        facts = await _ride_facts(db, user_id, activity, chain_km, chain_fresh)
    except Exception:
        logger.warning("ride facts failed for user_id=%s", user_id, exc_info=True)

    try:
        gear_rc = await _pay_gear(db, user_id, activity, base_rc, chain_km, facts)
        result["gear_rc"] = gear_rc
    except Exception:
        logger.warning("gear bonus failed for user_id=%s", user_id, exc_info=True)

    try:
        # Weighted by what this ride actually cost each component — see
        # `bike_wear.wear_factor`. A wet gravel ride advances the chain's service
        # clock four times as fast as a dry road ride of the same distance,
        # which is what a cyclist already knows and what an odometer cannot say.
        # The ride's own physics, read from the row ingestion already wrote:
        # measured work through the drivetrain, and the height that had to be
        # braked away. Both optional — a ride without a power meter or without a
        # barometer falls back to distance rather than to a guess.
        stream = (await db.execute(
            select(ActivityStream).where(ActivityStream.activity_id == activity.id)
        )).scalar_one_or_none()
        if await workshop.accrue(
            db, user_id, activity.id, activity.distance_meters, facts,
            kj=stream.total_kj if stream else None,
            descent_m=_descent_m(stream.streams) if stream else None,
        ):
            result["km_accrued"] = km
    except Exception:
        logger.warning("odometer accrual failed for user_id=%s", user_id, exc_info=True)

    try:
        result["eddington_rc"] = await _pay_eddington(db, user_id)
    except Exception:
        logger.warning("eddington payout failed for user_id=%s", user_id, exc_info=True)

    return result
