"""The athlete-settable inputs that are NOT physics assumptions.

`simulator.Assumptions` carries what changes the equation being solved -- how
much shelter the rider has, how hard they intend to ride, whether wind is in
the model at all. This module carries the other kind of knob: things that
change *who* is riding and *when*, rather than how the ride is paced.

They are kept apart on purpose. Draft and effort are answers to "how will you
ride it?"; these are answers to "on what, at what weight, on which morning, and
with which version of your fitness?" Mixing them into one struct made it easy
to forget that only the first kind belongs in the simulator's signature -- the
simulator must not know what a start hour is.

Every field defaults to "what the athlete's profile already says", so a
rehearsal created without touching any of them behaves exactly as it did
before this module existed.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Surface = Literal["asphalt", "rough", "gravel"]

#: Rolling resistance by surface, for 28 mm road tyres at road pressure.
#: `asphalt` matches rider_model.DEFAULT_CRR (and cda_estimate's default), so
#: leaving the knob alone cannot change an existing rehearsal's numbers.
#: The other two are literature approximations, not measurements -- the surface
#: states them as assumptions, the same way the drafting multipliers are stated.
SURFACE_CRR: dict[str, float] = {
    "asphalt": 0.005,
    "rough": 0.0075,   # chip-seal, broken tarmac, wet road
    "gravel": 0.0120,  # compact gravel; loose surfaces are worse than this
}

#: Bounds on the overrides. Wide enough not to argue with real riders, narrow
#: enough that a fat-fingered entry is refused rather than simulated: a 4 kg
#: rider or a 400 kg bike produces confident nonsense from correct physics.
MIN_WEIGHT_KG = 30.0
MAX_WEIGHT_KG = 200.0
MIN_BIKE_KG = 4.0
MAX_BIKE_KG = 30.0

#: A target time below this is not a pacing question, it is a typo.
MIN_TARGET_TIME_S = 300.0


@dataclass(frozen=True)
class RiderOverrides:
    """Everything the athlete can change about the rider, the road and the day.

    `None` consistently means "use what we already know about you" -- the
    profile weight, the measured CP, the default road surface -- so absence is
    never confused with a deliberate zero.
    """

    #: Body weight only. Bike mass is separate so "what would 3 kg off ME do?"
    #: and "what would a lighter bike do?" are answerable independently.
    weight_kg: float | None = None
    bike_mass_kg: float | None = None
    surface: Surface = "asphalt"
    #: Hour of day (UTC) the ride starts. None averages the daylight window,
    #: which is what every rehearsal did before start time was settable.
    start_hour: int | None = None
    #: Ride the route against PROJECTED fitness for the event date rather than
    #: today's measured CP. Ignored when there is no dated route or no
    #: projection with enough history behind it.
    use_projected_cp: bool = False
    #: "I want to finish inside this." Triggers the backward solve.
    target_time_s: float | None = None

    def crr(self) -> float:
        return SURFACE_CRR.get(self.surface, SURFACE_CRR["asphalt"])


class OverrideError(ValueError):
    """An override is outside the range the physics stays honest in."""


def validate(o: RiderOverrides) -> None:
    """Refuse nonsense loudly. The physics would happily simulate all of it."""
    if o.weight_kg is not None and not (MIN_WEIGHT_KG <= o.weight_kg <= MAX_WEIGHT_KG):
        raise OverrideError(
            f"body weight must be between {MIN_WEIGHT_KG:.0f} and {MAX_WEIGHT_KG:.0f} kg"
        )
    if o.bike_mass_kg is not None and not (MIN_BIKE_KG <= o.bike_mass_kg <= MAX_BIKE_KG):
        raise OverrideError(
            f"bike weight must be between {MIN_BIKE_KG:.0f} and {MAX_BIKE_KG:.0f} kg"
        )
    if o.surface not in SURFACE_CRR:
        raise OverrideError(f"unknown surface: {o.surface}")
    if o.start_hour is not None and not (0 <= o.start_hour <= 23):
        raise OverrideError("start hour must be between 0 and 23")
    if o.target_time_s is not None and o.target_time_s < MIN_TARGET_TIME_S:
        raise OverrideError("target time must be at least five minutes")
