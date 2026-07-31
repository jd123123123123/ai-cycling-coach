"""Backward solve: "I want to finish inside X" -> what that actually demands.

Every other knob on the rehearsal page is an input the athlete sets and a time
they read out. This one runs the other way, which is the direction people
actually think in before an event: the finish time is the thing they have in
their head, and the question is whether their engine supports it.

Method: bisection on `Assumptions.intensity_scale`. Total time falls
monotonically as attempted power rises -- more watts is never slower on a fixed
course -- so bisection is sufficient and, unlike a gradient method, cannot
diverge on the flat spots the blow-up cap introduces. Roughly 20 halvings of
the bracket land well inside a second on any real route.

The honest part is the verdict, not the number. Three outcomes are possible and
they are NOT the same:

  • reachable, and W' survives it            -> here is your pacing plan
  • reachable only by blowing up             -> the clock says yes, the body
                                                says no; that is a warning,
                                                not a plan
  • not reachable at any sane intensity      -> say so plainly rather than
                                                pinning the scale at its
                                                ceiling and reporting the
                                                ceiling's time as an answer

Conflating the last two is the failure mode worth guarding: a solver that
silently clamps produces a confident "4:30" for a rider who cannot ride 5:10.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

from app.services.rehearsal.rider_model import RiderModel
from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.simulator import Assumptions, SimulationResult, simulate

#: Search bracket for the intensity multiplier. The floor is a genuine
#: soft-pedal; the ceiling is already beyond what anyone holds for hours
#: (`race` alone is 1.08 x CP, so 1.45 puts the flat-road target at ~1.57 x CP)
#: and exists to bound the search, not to describe a real ride.
MIN_SCALE = 0.55
MAX_SCALE = 1.45

#: Halvings. 20 takes the bracket from 0.9 wide to under 1e-6.
ITERATIONS = 20

#: Close enough to the requested time to call it hit, in seconds.
TOLERANCE_S = 20.0


@dataclass(frozen=True)
class TargetSolution:
    """What the requested finish time costs, and whether it is real."""

    target_time_s: float
    #: The simulation at the solved intensity. Always present -- even an
    #: unreachable target returns the best attempt, so the surface can show how
    #: far off it is rather than showing nothing.
    result: SimulationResult
    intensity_scale: float
    #: Within TOLERANCE_S of the request.
    reachable: bool
    #: True when reaching it empties W' -- reachable, but not survivable.
    costs_a_blow_up: bool
    #: Best time available at MAX_SCALE, when the target is out of reach.
    #: None when it was reached.
    fastest_possible_s: float | None


def _simulate_at(
    scale: float,
    segments: list[Segment],
    model: RiderModel,
    assumptions: Assumptions,
    headwind: list[float] | None,
    air_density: list[float] | None,
) -> SimulationResult:
    return simulate(
        segments,
        model,
        replace(assumptions, intensity_scale=scale),
        headwind,
        air_density,
    )


def solve_for_target_time(
    segments: list[Segment],
    model: RiderModel,
    assumptions: Assumptions,
    headwind: list[float] | None,
    air_density: list[float] | None,
    target_time_s: float,
) -> TargetSolution:
    """Find the intensity that finishes in `target_time_s`, and judge it."""
    fastest = _simulate_at(MAX_SCALE, segments, model, assumptions, headwind, air_density)
    if fastest.total_time_s > target_time_s + TOLERANCE_S:
        # Out of reach. Report the ceiling attempt AS the ceiling attempt, and
        # say what is actually possible, rather than dressing it up as a hit.
        return TargetSolution(
            target_time_s=target_time_s,
            result=fastest,
            intensity_scale=MAX_SCALE,
            reachable=False,
            costs_a_blow_up=bool(fastest.blow_ups),
            fastest_possible_s=fastest.total_time_s,
        )

    slowest = _simulate_at(MIN_SCALE, segments, model, assumptions, headwind, air_density)
    if slowest.total_time_s < target_time_s - TOLERANCE_S:
        # The target is slower than a soft pedal. Reachable, trivially: hand
        # back the easiest ride rather than a scale below the bracket.
        return TargetSolution(
            target_time_s=target_time_s,
            result=slowest,
            intensity_scale=MIN_SCALE,
            reachable=True,
            costs_a_blow_up=bool(slowest.blow_ups),
            fastest_possible_s=None,
        )

    lo, hi = MIN_SCALE, MAX_SCALE
    best = fastest
    best_scale = MAX_SCALE
    for _ in range(ITERATIONS):
        mid = (lo + hi) / 2.0
        attempt = _simulate_at(mid, segments, model, assumptions, headwind, air_density)
        best, best_scale = attempt, mid
        if attempt.total_time_s > target_time_s:
            lo = mid   # too slow -> push harder
        else:
            hi = mid   # too fast -> ease off
        if abs(attempt.total_time_s - target_time_s) <= TOLERANCE_S:
            break

    return TargetSolution(
        target_time_s=target_time_s,
        result=best,
        intensity_scale=best_scale,
        reachable=abs(best.total_time_s - target_time_s) <= TOLERANCE_S,
        costs_a_blow_up=bool(best.blow_ups),
        fastest_possible_s=None
        if abs(best.total_time_s - target_time_s) <= TOLERANCE_S
        else fastest.total_time_s,
    )
