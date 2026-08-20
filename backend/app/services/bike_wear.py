"""Component wear, and the Service Bonus it banks.

THE INVERSION, in one sentence: riding banks value into each component and
servicing withdraws it. Nothing here ever takes RideCoin away, delays a ride, or
marks a bike unusable.

WHY IT IS BUILT THIS WAY. The obvious design — the chain gets dirty, so you earn
less until you clean it — punishes the rider at the exact moment they are most
recoverable. Two weeks ill, and the app greets them by cutting their rate. That
is documented Black Hat burnout, it is why Duolingo retreated to streak freezes,
and it contradicts `w3BikeSoul`'s own line that an idle bike is an invitation
and not a debt.

So the same pull is built from the other side. Every kilometre accrues an
unharvested Service Bonus. Neglect costs nothing — it only leaves a growing pile
sitting in the workshop, which is a reason to come back rather than a debt to
face. A rider returning after a month finds MORE waiting for them, not less.

THE INTERVALS ARE REAL. 250 km for a chain is the midpoint of the 160-320 km
industry benchmark, not a number chosen to pace a game. That matters twice: a
cyclist recognises it, and the app can state the genuine 3-5 W efficiency cost of
a dirty drivetrain as a FACT rather than dressing an invented penalty as one.
"""
from __future__ import annotations

from dataclasses import dataclass

#: How far past its interval a component may go on banking bonus. Beyond this it
#: STOPS ACCRUING — it does not lose what it has. The pile stops growing, which
#: is a nudge; it never shrinks, which would be a punishment.
OVERRUN_FACTOR = 2.0

# ── WHY THE HARVEST IS PRICED PER COMPONENT AND NOT PER KILOMETRE ───────────
#
# The first cut paid `km x rate x weight`, which quietly inverted the thing the
# economy most needs to get right. The cassette's interval is 6 000 km and the
# chain's is 250, so at any shared rate the cassette paid several times more —
# and the cassette is serviced roughly once a year while the chain is serviced
# every few weeks. The action a rider performs constantly was the least
# satisfying one on the bike.
#
# So each component declares what a FULL service of it is worth, and accrual is
# that value scaled by how far through its own interval it is. The frequent,
# tactile job now pays like the frequent, tactile job it is.
#
# TIMING IS DELIBERATELY NEUTRAL. Because accrual is linear in the interval,
# servicing the chain twice at 250 km pays exactly what servicing once at 500 km
# pays. Waiting cannot be farmed and promptness is not taxed — the harvest is
# simply payment for kilometres ridden, which is the whole premise.
#
# The ONLY reason to service promptly is `CONDITION_BONUS_PCT` in
# `earn_modifiers`: a fresh drivetrain earns more on every ride in between. That
# is a bonus the rider goes and wins, never a penalty for waiting, and it makes
# the timing decision genuinely interesting instead of merely obligatory.


# ── WHAT A KILOMETRE COSTS DEPENDS ON THE KILOMETRE ─────────────────────────
#
# Every interval above is quoted in kilometres because that is how the industry
# quotes them, and every one of those figures assumes DRY ROAD. A cyclist knows
# this in their hands: a chain that lasts 250 km through a British winter is the
# same chain that lasts well past 400 in an Italian summer, and the difference is
# not mileage — it is water, grit and load.
#
# Almost every maintenance app on the market counts raw kilometres, because
# almost every one of them is fed by a distance number and nothing else. This
# app is a TRAINING app: it already resolved whether the ride was wet, what
# surface it was on, how much climbing it held and how hard it was ridden, in
# order to settle the ride's earn. Those facts are already paid for, and they are
# exactly the facts that decide wear. Using them is the difference between an
# odometer and a service book.
#
# THE MULTIPLIERS ARE CONSERVATIVE ON PURPOSE. A wet ride is worth roughly three
# chains' worth of grit in the literature; 2.2x is the low end of that, because
# an interval that arrives too early trains a rider to ignore it, and a service
# book nobody believes is worse than a plain odometer. Everything here rounds
# TOWARD the rider.
#
# RULE 4 AGAIN, inherited from `earn_modifiers`: a fact we do not have never
# moves the number. An unknown surface is dry road, not "probably gravel".

#: How much harder each condition is on each component, as a multiplier on the
#: kilometres that ride contributes. 1.0 means the condition does not touch it.
_WEAR: dict[str, dict[str, float]] = {
    # Water and grit are the chain's whole story, and gravel dust is the rest.
    "chain": {"wet": 2.2, "gravel": 1.8, "cold": 1.15, "hard": 1.1},
    # A cassette wears WITH the chain, more slowly and for the same reasons.
    "cassette": {"wet": 1.7, "gravel": 1.5, "cold": 1.05, "hard": 1.1},
    # Rim or disc, braking in the wet is what eats pads — and descending is when
    # you brake, so climbing metres are the proxy that matters.
    "brakes": {"wet": 2.5, "gravel": 1.3, "climb": 1.6},
    # Tyres care about the surface and about nothing else here. Rain does not
    # meaningfully wear rubber; sharp gravel does.
    "tyres": {"gravel": 2.0},
}


def wear_factor(component_id: str, facts) -> float:
    """How much one ride's kilometres count against this component.

    `facts` is `earn_modifiers.RideFacts` — the same object the earn engine
    already built for this ride. Typed loosely to keep this module free of a
    circular import; it only ever reads attributes that may be None.

    Multiplicative, not additive: a wet gravel ride is genuinely worse than
    either alone, and adding the two would understate it. Capped, because no
    single ride should consume a whole interval — a cap is what keeps one filthy
    afternoon from telling a rider their tyres are finished.
    """
    table = _WEAR.get(component_id)
    if table is None:
        return 1.0

    f = 1.0
    if getattr(facts, "was_wet", None) is True:
        f *= table.get("wet", 1.0)
    if getattr(facts, "surface", None) in ("gravel", "mtb"):
        f *= table.get("gravel", 1.0)
    temp = getattr(facts, "temp_c", None)
    if temp is not None and temp <= 5:
        f *= table.get("cold", 1.0)
    iff = getattr(facts, "intensity_factor", None)
    if iff is not None and iff >= 0.85:
        f *= table.get("hard", 1.0)
    # Climbing is a stand-in for descending, which is where the braking is.
    climb = getattr(facts, "elevation_gain_m", None) or 0
    dist_km = (getattr(facts, "distance_m", None) or 0) / 1000
    if dist_km > 0 and climb / dist_km >= 12:
        f *= table.get("climb", 1.0)

    return min(f, MAX_WEAR_FACTOR)


#: No single ride may count for more than this many times its distance. Three
#: hard conditions stacking is real; a ride costing five intervals is not, and a
#: number a rider cannot recognise is a number they stop trusting.
MAX_WEAR_FACTOR = 4.0


# ── WHAT ACTUALLY WEARS EACH COMPONENT ──────────────────────────────────────
#
# Distance is a PROXY for wear, and a poor one, because none of these parts is
# worn by distance. Each is worn by a specific physical quantity, and the ride
# streams already contain every one of them.
#
# THE CHAIN IS WORN BY TRANSMITTED WORK. Elongation comes from the pin/bush
# interface sliding under tension, and the tension is the torque the rider puts
# through it — so wear tracks the ENERGY that passed through the drivetrain, not
# the ground covered. This is why professional mechanics retire chains on
# kilojoules rather than kilometres: two riders over the same 100 km, one at
# 120 W and one at 250 W, do not have the same chain. `activity_streams.total_kj`
# is already measured and stored for every ride with power.
#
# THE PADS ARE WORN BY DISSIPATED ENERGY. A bicycle descending converts
# potential energy into heat; whatever aerodynamic drag does not take, the brakes
# do. So pad wear tracks DESCENT, which the altitude stream records directly —
# and a flat 100 km simply does not wear pads, however far it is.
#
# THE TYRES ARE WORN BY ABRASION, which really is distance against a surface. So
# distance stays the driver there, scaled by what the surface is made of.
#
# WHAT THIS DELIBERATELY DOES NOT CLAIM. The fraction of descent energy that
# goes into the pads rather than into drag depends on gradient, speed and how
# the rider brakes, and we cannot observe it — so descent metres are used as a
# PROXY with a stated reference, not as a calculation of pad temperature. The
# same honesty applies to a ride with no power meter: without kJ there is no
# work term, and the chain falls back to distance rather than to an invented
# number. A model that guesses where it cannot measure is worse than a plain
# odometer, because it is wrong with authority.

#: The reference kilometre every published interval is quoted against: dry road,
#: endurance pace, rolling terrain. The constants below convert a real ride into
#: how many of THESE it was worth, so an interval can stay in kilometres — the
#: unit a rider reads on a service book — while being computed from physics.
#:
#: 18 kJ/km is 150 W held at 30 km/h, which is what "endurance pace" means for
#: the rider these intervals are written for. 10 m of descent per kilometre is
#: rolling terrain; a flat ride has near zero and an alpine day has ten times it.
REF_KJ_PER_KM = 18.0
REF_DESCENT_M_PER_KM = 10.0


@dataclass(frozen=True)
class RideLoad:
    """What one ride did, in the quantities that wear things.

    Every field is optional because every field comes from a sensor that may not
    have been present. A missing quantity falls back to distance rather than to
    an estimate — see the note above about being wrong with authority.
    """

    distance_km: float
    #: Measured work through the drivetrain. `activity_streams.total_kj`.
    kj: float | None = None
    #: Metres descended, summed from the altitude stream.
    descent_m: float | None = None


def equivalent_km(component_id: str, load: RideLoad, facts=None) -> float:
    """How many reference kilometres this ride was worth to this component.

    The number the service clock advances by. It is in kilometres so a rider can
    read "180 von 250 km" and know what it means, but it is computed from the
    quantity that actually wears the part, then multiplied by the conditions
    (`wear_factor`) that the published interval does not account for.
    """
    km = max(0.0, load.distance_km)
    if km <= 0:
        return 0.0

    if component_id in ("chain", "cassette") and load.kj:
        # Work, not ground covered. A hard 50 km can outweigh an easy 100.
        base = load.kj / REF_KJ_PER_KM
    elif component_id == "brakes" and load.descent_m is not None:
        # Descent, not ground covered. A flat century does not wear pads, and
        # this is the one component where distance is actively misleading.
        base = load.descent_m / REF_DESCENT_M_PER_KM
    else:
        base = km

    return base * (wear_factor(component_id, facts) if facts is not None else 1.0)


@dataclass(frozen=True)
class ComponentSpec:
    """One serviceable thing on the bike."""

    id: str
    name_de: str
    #: Kilometres between services, or None for a part that kilometres do not
    #: wear. Real intervals, from real practice.
    interval_km: float | None
    #: RideCoin a FULL service of this component is worth — the payout at
    #: exactly one interval. Sized against `rewards.base_ride_rc`, where a
    #: typical ride earns 40-150: the chain's service lands at about one and a
    #: half good rides, which is a payday without being a shortcut around
    #: training.
    rc_at_interval: int
    #: What servicing it is called, in the rider's language.
    action_de: str
    #: Days between services, or None for a part that only kilometres wear.
    #:
    #: SOME PARTS AGE ON A CALENDAR AND NOT ON AN ODOMETER, and a kilometre
    #: model is not merely imprecise for them — it is the wrong quantity.
    #: Tubeless sealant dries out whether the bike is ridden or hangs in a
    #: cellar; DOT fluid is hygroscopic and absorbs water from the air on the
    #: same schedule either way. A rider who does 8 000 km a year and one who
    #: does 800 need their fluid bled at the same time.
    interval_days: int | None = None
    #: True when this part is not on every bike. Rim brakes have no fluid and
    #: an inner tube has no sealant, so these stay DORMANT until the rider says
    #: they have one — see `bike_wear.is_dormant`. Nagging somebody about a
    #: component their bicycle does not have is the fastest way to teach them
    #: that the whole maintenance surface is noise.
    optional: bool = False


COMPONENTS: dict[str, ComponentSpec] = {
    # The frequent, tactile one. Deliberately the most satisfying job on the
    # bike, because it is the one a rider will do dozens of times.
    "chain": ComponentSpec(
        id="chain", name_de="Kette", interval_km=250, rc_at_interval=150,
        action_de="Reinigen & ölen",
    ),
    "tyres": ComponentSpec(
        id="tyres", name_de="Reifen", interval_km=2500, rc_at_interval=200,
        action_de="Prüfen & aufpumpen",
    ),
    "brakes": ComponentSpec(
        id="brakes", name_de="Bremsbeläge", interval_km=2000, rc_at_interval=250,
        action_de="Beläge prüfen",
    ),
    "bartape": ComponentSpec(
        id="bartape", name_de="Lenkerband", interval_km=4000, rc_at_interval=180,
        action_de="Neu wickeln",
    ),
    "cassette": ComponentSpec(
        id="cassette", name_de="Kassette", interval_km=6000, rc_at_interval=300,
        action_de="Reinigen",
    ),

    # ── the two the odometer cannot see ─────────────────────────────────────
    #
    # 120 days is the middle of what the sealant makers themselves quote — Stan's
    # says two to three months, Orange Seal up to four — and the mechanism is
    # evaporation through the casing, which does not care whether the wheel
    # turns. A rider who finds out their sealant dried up finds out at the
    # roadside.
    "sealant": ComponentSpec(
        id="sealant", name_de="Dichtmilch", interval_km=None, interval_days=120,
        rc_at_interval=120, action_de="Nachfüllen", optional=True,
    ),
    # A year, which is both Shimano's and SRAM's own figure. DOT fluid is
    # hygroscopic: it pulls water out of the air through the seals, and water
    # boils far below the temperature a long descent puts into a caliper. This
    # is the one entry in this catalogue with a safety argument behind it.
    "brakefluid": ComponentSpec(
        id="brakefluid", name_de="Bremsflüssigkeit", interval_km=None,
        interval_days=365, rc_at_interval=220, action_de="Entlüften",
        optional=True,
    ),
}

#: The drivetrain component whose freshness drives the earn bonus. One
#: component, not an average: a rider must know exactly what to go and do.
DRIVETRAIN = "chain"


@dataclass(frozen=True)
class ComponentState:
    """A component's live state, for the workshop screen."""

    id: str
    name_de: str
    action_de: str
    #: Kilometres since this component was last serviced.
    km_since: float
    interval_km: float | None
    #: Lifetime kilometres — never reset by a service. This is the number
    #: cyclists brag about, so it survives everything except replacement.
    km_total: float
    #: Unharvested RideCoin sitting on this component right now.
    bonus_rc: int
    #: 'fresh' | 'due' | 'overdue' — never 'broken'.
    status: str
    #: 0..1 through the interval, clamped at 1 for the meter.
    progress: float
    #: True once accrual has stopped. The pile is intact; it just isn't growing.
    accrual_stopped: bool
    #: Days since the last service, or None when we have never been told.
    days_since: int | None = None
    interval_days: int | None = None
    #: 'km' | 'days' — which clock the meter should be labelled with.
    clock: str = "km"
    #: True while this is an optional part we have not asked about yet. The
    #: screen shows it as a QUESTION, never as a job.
    dormant: bool = False
    optional: bool = False


def elapsed(spec: ComponentSpec, km_since: float, days_since: int | None) -> float:
    """How far through its own service interval this component is, 0 upward.

    ONE NUMBER FOR TWO CLOCKS. A part can be worn by kilometres, by days, or —
    like bar tape under sweat and sun — by both, and the industry states those
    parts exactly the way this reads them: "every 5 000 km OR every 6 months,
    whichever comes first". So the fraction is the LARGER of the two ratios, and
    every other function here is written on top of it. Uncapped on purpose: the
    callers each clamp differently, and the raw number is what says how far past
    due something has gone.
    """
    ratios = []
    if spec.interval_km:
        ratios.append(max(0.0, km_since) / spec.interval_km)
    if spec.interval_days and days_since is not None:
        ratios.append(max(0, days_since) / spec.interval_days)
    return max(ratios) if ratios else 0.0


def which_clock(spec: ComponentSpec, km_since: float, days_since: int | None) -> str:
    """'km' or 'days' — the clock currently driving this component's status.

    The screen has to label the meter with something, and labelling a sealant
    top-up in kilometres is exactly the misunderstanding this release exists to
    fix. Whichever ratio is winning is the one the rider is shown.
    """
    if not spec.interval_km:
        return "days"
    if not (spec.interval_days and days_since is not None):
        return "km"
    km_r = max(0.0, km_since) / spec.interval_km
    day_r = max(0, days_since) / spec.interval_days
    return "days" if day_r > km_r else "km"


def is_dormant(spec: ComponentSpec, owned: bool | None) -> bool:
    """Whether this component should stay silent.

    An optional part we have never asked about is not "fresh" and it is not
    "due" — we do not know whether the bicycle HAS one. A rim-brake rider told
    to bleed their brakes learns that this whole surface guesses, and after that
    they will ignore the one warning that matters. So an unanswered optional
    part shows up only as a question, never as a job, and a part the rider has
    told us they do not have never shows up again at all.
    """
    return spec.optional and owned is not True


def status_of(
    km_since: float, interval_km: float | None,
    days_since: int | None = None, interval_days: int | None = None,
) -> str:
    """Three states, and none of them is a failure.

    'due' begins at the interval rather than before it: a component inside its
    real service window is genuinely fine, and nagging early is how a system
    teaches riders to ignore it.
    """
    spec = ComponentSpec(
        id="", name_de="", interval_km=interval_km, rc_at_interval=0,
        action_de="", interval_days=interval_days,
    )
    f = elapsed(spec, km_since, days_since)
    if f < 1.0:
        return "fresh"
    if f < OVERRUN_FACTOR:
        return "due"
    return "overdue"


def accrued_rc(km_since: float, spec: ComponentSpec, days_since: int | None = None) -> int:
    """The Service Bonus banked on a component right now.

    Linear in the fraction of its own interval covered, so one interval always
    pays `rc_at_interval` whichever component it is, and two intervals pay
    twice — timing-neutral by construction.

    Accrual stops at the overrun ceiling. It never reverses: a rider who has
    stopped accruing has lost nothing, they have simply stopped gaining, and the
    workshop says exactly that.
    """
    return max(0, int(spec.rc_at_interval * min(elapsed(spec, km_since, days_since), OVERRUN_FACTOR)))


def state_of(
    component_id: str, km_since: float, km_total: float,
    days_since: int | None = None, owned: bool | None = None,
) -> ComponentState:
    spec = COMPONENTS[component_id]
    dormant = is_dormant(spec, owned)
    f = elapsed(spec, km_since, days_since)
    return ComponentState(
        id=spec.id,
        name_de=spec.name_de,
        action_de=spec.action_de,
        km_since=km_since,
        interval_km=spec.interval_km,
        km_total=km_total,
        days_since=days_since,
        interval_days=spec.interval_days,
        clock=which_clock(spec, km_since, days_since),
        # A dormant part banks nothing, because we do not know it exists. The
        # moment the rider confirms it, its clock starts from the date they
        # give us and the bonus starts building from there.
        bonus_rc=0 if dormant else accrued_rc(km_since, spec, days_since),
        status="unknown" if dormant else status_of(
            km_since, spec.interval_km, days_since, spec.interval_days,
        ),
        progress=min(1.0, f),
        accrual_stopped=not dormant and f >= OVERRUN_FACTOR,
        dormant=dormant,
        optional=spec.optional,
    )


def drivetrain_fresh(km_since_chain: float) -> bool:
    """Whether the earn bonus is live. Inside the chain's real interval, yes.

    This is the ONLY place maintenance touches earning, and it touches it as a
    bonus that switches on — never as a penalty that switches on.
    """
    return km_since_chain < COMPONENTS[DRIVETRAIN].interval_km


def efficiency_watts(km_since_chain: float) -> float | None:
    """The real drivetrain drag of a dirty chain, in watts at ~250 W output.

    Measured, not invented: a dirty road chain costs roughly 3-5 W. Returned so
    the app can state a FACT — "kostet dich ungefähr 4 W" — instead of dressing
    up a made-up debuff. None while the chain is inside its interval, because
    then there is nothing true to report.

    Scales linearly from 0 W at the interval to 5 W at the overrun ceiling.
    """
    spec = COMPONENTS[DRIVETRAIN]
    if km_since_chain < spec.interval_km:
        return None
    span = spec.interval_km * (OVERRUN_FACTOR - 1)
    over = min(km_since_chain - spec.interval_km, span)
    return round(3.0 + 2.0 * (over / span), 1) if span else 5.0
