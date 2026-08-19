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


@dataclass(frozen=True)
class ComponentSpec:
    """One serviceable thing on the bike."""

    id: str
    name_de: str
    #: Kilometres between services. Real intervals, from real practice.
    interval_km: float
    #: RideCoin a FULL service of this component is worth — the payout at
    #: exactly one interval. Sized against `rewards.base_ride_rc`, where a
    #: typical ride earns 40-150: the chain's service lands at about one and a
    #: half good rides, which is a payday without being a shortcut around
    #: training.
    rc_at_interval: int
    #: What servicing it is called, in the rider's language.
    action_de: str


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
    interval_km: float
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


def status_of(km_since: float, interval_km: float) -> str:
    """Three states, and none of them is a failure.

    'due' begins at the interval rather than before it: a component inside its
    real service window is genuinely fine, and nagging early is how a system
    teaches riders to ignore it.
    """
    if km_since < interval_km:
        return "fresh"
    if km_since < interval_km * OVERRUN_FACTOR:
        return "due"
    return "overdue"


def accrued_rc(km_since: float, spec: ComponentSpec) -> int:
    """The Service Bonus banked on a component right now.

    Linear in the fraction of its own interval covered, so one interval always
    pays `rc_at_interval` whichever component it is, and two intervals pay
    twice — timing-neutral by construction.

    Accrual stops at the overrun ceiling. It never reverses: a rider who has
    stopped accruing has lost nothing, they have simply stopped gaining, and the
    workshop says exactly that.
    """
    if spec.interval_km <= 0:
        return 0
    fraction = min(km_since / spec.interval_km, OVERRUN_FACTOR)
    return max(0, int(spec.rc_at_interval * fraction))


def state_of(component_id: str, km_since: float, km_total: float) -> ComponentState:
    spec = COMPONENTS[component_id]
    status = status_of(km_since, spec.interval_km)
    ceiling = spec.interval_km * OVERRUN_FACTOR
    return ComponentState(
        id=spec.id,
        name_de=spec.name_de,
        action_de=spec.action_de,
        km_since=km_since,
        interval_km=spec.interval_km,
        km_total=km_total,
        bonus_rc=accrued_rc(km_since, spec),
        status=status,
        progress=min(1.0, km_since / spec.interval_km) if spec.interval_km else 0.0,
        accrual_stopped=km_since >= ceiling,
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
