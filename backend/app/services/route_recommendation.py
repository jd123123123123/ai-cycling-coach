"""Which of the athlete's OWN past routes fits today's planned session.

Every training app that suggests "go ride this" either invents a route from a
map (which the athlete may not be able to safely or legally ride) or shows the
same nearby-popular-routes list regardless of what today's plan actually asks
for. This module does neither: it scores routes the athlete has ALREADY
ridden — real roads, real climbs, real numbers — against the two things
today's plan states about the target session: how long, and how hard.

Deliberately NOT a route-shape classifier. It does not try to infer "this
route is a sweet-spot route" from gradient profiles — that would be guessing.
Instead it uses `avg_tss`, the athlete's own MEDIAN measured TSS across every
past ride of that route (route_library.summarize_route), which is a direct
report of how hard that road actually made THIS athlete work, not a model of
it.

Deliberately NOT reinforcement learning, matching this project's own
evidence review (training-science-methods.md: "RL training-load controllers"
flagged as unvalidated). This is a stated, inspectable scoring rule over
measured history — the same category of fix as `band_calibration.py` and
`retro_match.py` in the rehearsal package.

Scoring, in two independently-checkable terms plus three stated discounts:

  duration_fit = 1 - |avg_time_min - target_min| / target_min,  floored at 0
  tss_fit      = 1 - |avg_tss - target_tss| / target_tss,        floored at 0
  raw_fit      = mean(available terms)          x0.85 if only ONE term exists
  score        = raw_fit  x0.85 if thin history  x0.4 if a virtual route

Equal weight on the two terms, on purpose: a route that is the right LENGTH
but the wrong INTENSITY is just as poor a fit as one that is the right
intensity but the wrong length — a 20-minute VO2 target does not become a good
match because a 90-minute endurance loop happens to average the same TSS.

Why the three discounts are multiplicative penalties and not exclusions —
every one of them answers "how much do we trust this?", never "is this
wrong?", and the honest answer to a weak signal is a demoted suggestion, not
silence:

  * ONE SIGNAL ONLY. A route with no power/HR history has no `avg_tss`.
    Matching purely on duration says nothing about whether that road will make
    the athlete work the way today asks, so it ranks below any equally-good
    two-signal match — but still above a genuine mismatch.
  * THIN HISTORY. A route ridden once has a "median" TSS that is one number
    from one day: it may have been a headwind, a group hammer-fest, or a
    soft-pedal home. For a new athlete EVERY route is ridden once, so
    excluding these would return nothing at exactly the moment the feature is
    most useful.
  * VIRTUAL ROUTE. A Zwift/Rouvy route cannot be ridden outdoors. Recommending
    Watopia as "today's road" is a confident answer to a question nobody
    asked — heavily demoted, never hidden, because the athlete may well intend
    to ride indoors.

`raw_fit` is kept alongside `score` so the surface can distinguish "this IS
the right shape, we are just not sure yet" from "this is the wrong shape".
"""
from __future__ import annotations

from dataclasses import dataclass

#: Below this the plan gives no target to compare against, and recommending
#: anything would be scoring against a number the athlete never set.
_MIN_TARGET_MINUTES = 5.0

#: Routes ridden fewer than this many times have too thin a TSS/duration
#: history to trust; they still surface, just marked low-confidence.
LOW_CONFIDENCE_RIDE_COUNT = 3

#: How much a thin history discounts an otherwise-good fit. A route ridden
#: once has a "median" TSS that is a single number from a single day -- it may
#: have been a headwind, a group hammer-fest or a soft-pedal home. It should
#: lose to an equally-good fit backed by five rides, but it must not be
#: excluded: for a new athlete every route is ridden once, and returning
#: nothing is a worse answer than returning a stated-uncertain one.
_LOW_CONFIDENCE_PENALTY = 0.85

#: A virtual (Zwift/Rouvy) route cannot be ridden outdoors today. It is not
#: WRONG -- the athlete may well intend to ride indoors -- but recommending
#: Watopia as "today's road" when the plan says nothing about indoors would be
#: a confident answer to a question nobody asked. Demoted hard, never hidden.
_VIRTUAL_PENALTY = 0.4

#: Cap on alternatives returned alongside the top pick.
MAX_ALTERNATIVES = 4


@dataclass(frozen=True)
class RouteFit:
    route: dict
    #: Final ranking score, after confidence and virtual-route penalties.
    score: float
    #: The unpenalised fit, so the surface can say "this IS the right shape,
    #: we are just not sure yet" instead of collapsing both into one number.
    raw_fit: float
    duration_fit: float | None
    tss_fit: float | None
    is_low_confidence: bool
    is_virtual: bool


def _clamped_fit(actual: float | None, target: float | None) -> float | None:
    """1.0 = exact match, 0.0 = off by 100% or more. None = not comparable."""
    if actual is None or target is None or target <= 0:
        return None
    return max(0.0, 1.0 - abs(actual - target) / target)


def score_route(
    route: dict,
    *,
    target_duration_minutes: float | None,
    target_tss: float | None,
) -> RouteFit:
    """Fit of one route summary (from `route_library.summarize_route`) against
    one planned session's stated duration and TSS target."""
    avg_time_s = route.get("avg_time_s")
    avg_time_min = (avg_time_s / 60.0) if avg_time_s else None
    duration_fit = _clamped_fit(avg_time_min, target_duration_minutes)
    tss_fit = _clamped_fit(route.get("avg_tss"), target_tss)

    parts = [f for f in (duration_fit, tss_fit) if f is not None]
    raw_fit = sum(parts) / len(parts) if parts else 0.0

    # A fit computed from ONE of the two signals is a weaker claim than one
    # computed from both, even when the number is identical: matching only
    # duration says nothing about whether the road will make the athlete work
    # the way today asks. Scored at 85% so it still ranks above a genuine
    # mismatch, but never above an equally-good two-signal match.
    if len(parts) == 1:
        raw_fit *= 0.85

    low_confidence = int(route.get("times_ridden") or 0) < LOW_CONFIDENCE_RIDE_COUNT
    is_virtual = bool(route.get("is_virtual"))

    score = raw_fit
    if low_confidence:
        score *= _LOW_CONFIDENCE_PENALTY
    if is_virtual:
        score *= _VIRTUAL_PENALTY

    return RouteFit(
        route=route,
        score=score,
        raw_fit=raw_fit,
        duration_fit=duration_fit,
        tss_fit=tss_fit,
        is_low_confidence=low_confidence,
        is_virtual=is_virtual,
    )


def recommend_routes(
    routes: list[dict],
    *,
    target_duration_minutes: float | None,
    target_tss: float | None,
) -> list[RouteFit] | None:
    """Ranked fits, best first, or None when there is nothing to score against.

    None (not an empty list) when the plan gives no usable target — an empty
    list would read as "no routes fit", which is a different, false claim from
    "there is no target to check routes against".
    """
    if not routes:
        return None
    if (target_duration_minutes is None or target_duration_minutes < _MIN_TARGET_MINUTES) and (
        target_tss is None or target_tss <= 0
    ):
        return None

    fits = [
        score_route(
            r,
            target_duration_minutes=target_duration_minutes,
            target_tss=target_tss,
        )
        for r in routes
    ]
    fits.sort(key=lambda f: f.score, reverse=True)
    return fits
