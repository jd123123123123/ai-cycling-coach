"""The rider's Eddington number, and how far they are from the next one.

E is the largest number where you have ridden at least E km on at least E days.
Named for the astrophysicist who kept his own by hand.

WHY THIS IS THE PROGRESSION SPINE AND NOT AN INVENTED LADDER:

  · It hardens by itself. Going from E70 to E75 takes far more than five rides,
    because every ride under 75 km stops counting the moment the target moves.
    No difficulty curve has to be designed, tuned or defended — the metric has
    one built in, and it is the correct shape.
  · It cannot decay. Perfect for an economy whose first rule is that nothing
    punishes absence. A rider's E survives injury, winter and a year away.
  · It cannot be farmed. Twenty 5 km commutes move it not at all past E5. It
    rewards exactly the thing a coaching app wants to reward: going further,
    repeatedly, over years.
  · It is already theirs. Cyclists track this without being asked and describe
    it themselves as addictive; there are public leaderboards for it. The app
    is joining a conversation rather than starting one.
  · Its near-misses are HONEST. "Three more rides of 48 km reaches E48" is a
    true statement about real work. That is the real version of the mechanic
    slot machines counterfeit, and it needs no manipulation to land.

Pure functions over a list of ride distances. No I/O, no clock, no DB.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Eddington:
    """Where the rider stands, and what the next step actually costs."""

    #: The current number: E km on at least E days.
    value: int
    #: The next number up — always `value + 1`, carried so callers need no math.
    next_value: int
    #: How many MORE rides of at least `next_value` km are needed to reach it.
    #: This is the whole motivational payload, and it is always truthful.
    rides_needed: int
    #: How many qualifying rides already exist toward `next_value`.
    rides_have: int


def compute(distances_km: list[float] | tuple[float, ...]) -> int:
    """The Eddington number for a set of ride distances.

    Sort descending and walk: E is the largest index i (1-based) where the i-th
    longest ride is at least i km. O(n log n), and the whole definition.
    """
    ordered = sorted((d for d in distances_km if d and d > 0), reverse=True)
    e = 0
    for i, d in enumerate(ordered, start=1):
        if d >= i:
            e = i
        else:
            break
    return e


def progress(distances_km: list[float] | tuple[float, ...]) -> Eddington:
    """The current number plus the honest cost of the next one.

    `rides_needed` counts rides of at least E+1 km, because those are the only
    ones that can ever contribute — which is exactly why the ladder steepens,
    and exactly what makes the number worth showing.
    """
    e = compute(distances_km)
    target = e + 1
    have = sum(1 for d in distances_km if d and d >= target)
    return Eddington(
        value=e,
        next_value=target,
        rides_needed=max(0, target - have),
        rides_have=have,
    )


#: Milestones pay a one-off bonus. Every 5 is frequent enough to stay live for a
#: beginner and rare enough that E100 still means something a decade in.
MILESTONE_STEP = 5


def is_milestone(value: int) -> bool:
    return value > 0 and value % MILESTONE_STEP == 0


def milestone_rc(value: int) -> int:
    """What reaching this E is worth.

    Superlinear, because the work is: each successive milestone costs far more
    riding than the last, so a flat reward would feel worse every time it landed.
    """
    if not is_milestone(value):
        return 0
    steps = value // MILESTONE_STEP
    return int(50 * steps * (1 + steps / 10))
