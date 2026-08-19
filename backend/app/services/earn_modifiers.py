"""What the rider's bike adds to a ride's earn — the equipment layer.

THE ONE RULE THIS FILE IS BUILT ON: every modifier is CONDITIONAL, and every
modifier is a BONUS. Neither is decoration.

CONDITIONAL, NOT FLAT. A flat "+10% forever" is invisible after a week: it is
not a decision, it is just a bigger number, and it inflates the economy on every
single ride with nothing regulating it. A bonus that only fires when the ride
actually matches — gravel tyres on gravel, climbing wheels on a real climb,
mudguards in real rain — does three things a flat one cannot. It makes the
rider CHOOSE a loadout before going out, which is the single strongest
engagement lever equipment systems have. It regulates itself, because a bonus
that fires on a third of rides costs the economy a third as much. And it is
TRUE: cyclists really do swap tyres and wheels for the day's conditions, so the
game mechanic and the sport agree.

A BONUS, NEVER A PENALTY. The maintenance modifier is the one that matters here.
"+10% while the drivetrain is fresh" and "-10% while it is dirty" are the same
arithmetic and a completely different product. The first is a thing the rider
can go and win this afternoon; the second is the app charging them for a
fortnight of illness. `w3BikeSoul` already states the house position — an idle
bike is an invitation, not a debt — and this file holds that line in the one
place where it would be easiest to quietly break.

STACKING IS CAPPED, on purpose. Uncapped additive multipliers are the documented
way game economies die: the faucet opens, the drain does not, and the currency
stops meaning anything. Bonuses add within the loadout and the total is clamped
at `MAX_BONUS_PCT`, which is high enough that a well-chosen loadout on the right
day feels like a real win, and low enough that no combination breaks the ledger.

The streak multiplier is NOT here. It lives in `rewards.streak_multiplier`,
applies to the base earn, and caps at x1.5 on its own — two independent systems
that each know their own ceiling, rather than one compounding pile nobody can
reason about.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

#: The most the equipment layer may ever add, as a percentage of base earn.
#: A rider running four matched conditional bonuses on a perfect day lands here.
MAX_BONUS_PCT = 60

#: What the drivetrain bonus is worth while the bike is freshly serviced. Sized
#: to sit just under the strongest single equipment bonus: maintenance should be
#: clearly worth doing, and never so dominant that it is the only thing that is.
CONDITION_BONUS_PCT = 12


@dataclass(frozen=True)
class RideFacts:
    """What actually happened on a ride, as the modifiers need to see it.

    Every field is optional because every field comes from a device that may not
    have recorded it. A modifier whose fact is missing DOES NOT FIRE — it never
    guesses. A rider is never awarded a rain bonus because we could not tell
    whether it rained.
    """

    distance_m: float | None = None
    elevation_gain_m: float | None = None
    avg_speed_kmh: float | None = None
    #: True only when the weather service actually reported precipitation.
    was_wet: bool | None = None
    #: 'road' | 'gravel' | 'mtb' — from the activity's own surface read.
    surface: str | None = None
    #: Whether the ride started or ended outside daylight.
    in_dark: bool | None = None
    #: Whether the drivetrain was inside its service interval for this ride.
    drivetrain_fresh: bool | None = None


@dataclass(frozen=True)
class Modifier:
    """One earn-enhancing item.

    `applies` is a pure predicate over the ride's facts and must return False
    when the fact it needs is None. `why` is shown to the rider in German both
    when it fires and when it does not — an equipment bonus the rider cannot
    predict is a lottery, not a loadout.
    """

    id: str
    name_de: str
    #: Percentage points added to base earn when it fires.
    pct: int
    #: The one-line rule, in the rider's language.
    why: str
    applies: Callable[[RideFacts], bool]


def _gravel(f: RideFacts) -> bool:
    return f.surface in ("gravel", "mtb")


def _big_climb(f: RideFacts) -> bool:
    return (f.elevation_gain_m or 0) >= 1000


def _fast_and_flat(f: RideFacts) -> bool:
    if f.avg_speed_kmh is None or f.elevation_gain_m is None or not f.distance_m:
        return False
    per_km = f.elevation_gain_m / (f.distance_m / 1000)
    return f.avg_speed_kmh >= 28 and per_km < 6


def _long(f: RideFacts) -> bool:
    return (f.distance_m or 0) >= 100_000


#: The equipment catalogue. Prices live with the parts catalogue; this file owns
#: only what each item DOES, so the two can be tuned independently.
MODIFIERS: dict[str, Modifier] = {
    "gravel_tyres": Modifier(
        id="gravel_tyres", name_de="Gravel-Reifen", pct=15,
        why="Zählt auf Schotter und Trails.",
        applies=_gravel,
    ),
    "climbing_wheels": Modifier(
        id="climbing_wheels", name_de="Kletter-Laufräder", pct=18,
        why="Zählt ab 1 000 Höhenmetern.",
        applies=_big_climb,
    ),
    "aero_wheels": Modifier(
        id="aero_wheels", name_de="Aero-Laufräder", pct=12,
        why="Zählt flach und schnell — ab 28 km/h Schnitt.",
        applies=_fast_and_flat,
    ),
    "mudguards": Modifier(
        id="mudguards", name_de="Schutzbleche", pct=20,
        why="Zählt, wenn es geregnet hat.",
        applies=lambda f: f.was_wet is True,
    ),
    "dynamo_light": Modifier(
        id="dynamo_light", name_de="Nabendynamo", pct=25,
        why="Zählt im Dunkeln.",
        applies=lambda f: f.in_dark is True,
    ),
    "bikepacking_bags": Modifier(
        id="bikepacking_bags", name_de="Bikepacking-Taschen", pct=22,
        why="Zählt ab 100 km.",
        applies=_long,
    ),
}

#: Not an item — the state of the bike itself. Kept out of `MODIFIERS` because
#: it is not owned, cannot be bought, and is earned fresh every service.
CONDITION = Modifier(
    id="drivetrain_fresh", name_de="Frischer Antrieb", pct=CONDITION_BONUS_PCT,
    why="Zählt, solange dein Antrieb frisch gewartet ist.",
    applies=lambda f: f.drivetrain_fresh is True,
)


@dataclass(frozen=True)
class ModifierHit:
    """One modifier, and whether this ride actually earned it."""

    id: str
    name_de: str
    pct: int
    why: str
    fired: bool


@dataclass(frozen=True)
class EarnBreakdown:
    """The equipment layer's contribution, itemised.

    `hits` carries the modifiers that did NOT fire as well as those that did,
    because the near-miss is the useful part: "Schutzbleche +20 % — zählt, wenn
    es geregnet hat" on a dry day teaches the loadout. Hiding the misses would
    make the whole system feel random.
    """

    #: Sum of the fired percentages, AFTER the cap.
    total_pct: int
    #: True when the cap actually bit — the UI says so rather than silently
    #: swallowing a bonus the rider paid for.
    capped: bool
    hits: list[ModifierHit]

    @property
    def multiplier(self) -> float:
        return 1.0 + self.total_pct / 100


def resolve(equipped_ids: list[str] | set[str], facts: RideFacts) -> EarnBreakdown:
    """What this loadout adds to this ride.

    Unknown ids are ignored rather than raising: a retired item still sitting in
    an old loadout must not take down the award path for a ride that already
    happened.
    """
    considered = [CONDITION] + [
        MODIFIERS[i] for i in equipped_ids if i in MODIFIERS
    ]
    hits = [
        ModifierHit(id=m.id, name_de=m.name_de, pct=m.pct, why=m.why, fired=m.applies(facts))
        for m in considered
    ]
    raw = sum(h.pct for h in hits if h.fired)
    total = min(raw, MAX_BONUS_PCT)
    return EarnBreakdown(total_pct=total, capped=raw > MAX_BONUS_PCT, hits=hits)


def bonus_rc(base_rc: int, breakdown: EarnBreakdown) -> int:
    """The extra RideCoin the equipment earned, on top of base.

    Rounded down, and never negative: this layer can only ever add.
    """
    return max(0, int(base_rc * breakdown.total_pct / 100))
