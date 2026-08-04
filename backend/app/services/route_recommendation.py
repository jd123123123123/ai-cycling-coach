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
from datetime import date

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

#: A road ridden in the last few days is a worse SUGGESTION than an equally
#: good one the athlete has not seen lately, even though it is an equally good
#: match. Mild and multiplicative: variety is a preference, not a correction,
#: and an athlete with exactly one suitable road must still be shown it.
_RECENTLY_RIDDEN_DAYS = 3
_RECENTLY_RIDDEN_PENALTY = 0.9

#: Cap on alternatives returned alongside the top pick (legacy shape).
MAX_ALTERNATIVES = 4

#: How many ranked roads the surface may show. Several roads genuinely fit a
#: given session, and the athlete picks between them on things this model
#: cannot see -- traffic, who they are riding with, whether they can face that
#: climb today. Showing one and calling it THE answer hides that choice.
MAX_MATCHES = 5

# ── what terrain each kind of session actually wants ─────────────────────────
#
# Two numbers per session category, both stated rather than learned:
#
#   climb_share_pct — how much of the road should be going up. This is what
#     separates "flat" from "rolling" from "mountainous" in a way total ascent
#     cannot: 600 m over 60 km of rollers and 600 m in one 8 km climb are the
#     same ascent and completely different rides.
#   longest_climb_m — how long ONE uninterrupted climb should be. This is the
#     number that decides whether a 2x20 threshold block can be ridden as a
#     single sustained effort or has to be chopped up over rollers, and it is
#     why gradient matters here at all.
#
# The values are coaching convention, not a fitted model, and they are in one
# table so they can be argued with in one place. `None` means the session is
# genuinely indifferent -- endurance rides fine on anything -- and an
# indifferent term is skipped rather than scored as a middling match.
_CATEGORY_TERRAIN: dict[str, tuple[float | None, float | None]] = {
    # Recovery wants flat: every ramp forces power up on the one day the plan
    # asked for it to stay down.
    "recovery": (0.0, 0.0),
    "endurance": (15.0, None),
    "tempo": (25.0, 1500.0),
    "sweet_spot": (30.0, 2500.0),
    "threshold": (35.0, 3500.0),
    # VO2 wants climbs long enough for a 3-5 min effort but not so long the
    # rider is still climbing through the recovery valley.
    "vo2": (25.0, 1200.0),
}

#: Climb-share is scored over a wide band: terrain preference is a real signal
#: but a soft one, and a road 10 points hillier than ideal is still a fine
#: place to ride the session.
_CLIMB_SHARE_TOLERANCE_PCT = 20.0

#: Floor on the climb-length tolerance so the flat-preferring categories
#: (recovery, ideal 0 m) have a sane scale to be wrong against.
_CLIMB_LENGTH_TOLERANCE_FLOOR_M = 1200.0

#: Weights over the four terms. Duration and intensity still carry the most --
#: they are what the plan literally states -- while terrain and climb shape are
#: how well the ROAD suits that session. Renormalised over whichever terms are
#: actually available, so a route with no altitude is scored on what is known
#: rather than penalised into oblivion for a stream it never recorded.
_WEIGHTS = {"duration": 0.30, "tss": 0.30, "terrain": 0.25, "climb": 0.15}


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
    #: How well the road's climb share suits this session category.
    terrain_fit: float | None
    #: How well its longest single climb suits this session category.
    climb_fit: float | None
    is_low_confidence: bool
    is_virtual: bool
    #: Ridden within the last few days — a variety demotion, not a mismatch.
    is_recently_ridden: bool


def _clamped_fit(actual: float | None, target: float | None) -> float | None:
    """1.0 = exact match, 0.0 = off by 100% or more. None = not comparable."""
    if actual is None or target is None or target <= 0:
        return None
    return max(0.0, 1.0 - abs(actual - target) / target)


def _band_fit(actual: float | None, ideal: float | None, tolerance: float) -> float | None:
    """1.0 at `ideal`, falling to 0 once `tolerance` away. None = not scorable.

    Used for the terrain terms, where the honest claim is "about this much"
    rather than the proportional "within x% of the target" that duration and
    TSS get. A proportional error is meaningless against an ideal of zero,
    which is exactly what recovery's flat-road preference is.
    """
    if actual is None or ideal is None or tolerance <= 0:
        return None
    return max(0.0, 1.0 - abs(actual - ideal) / tolerance)


def _terrain_fits(route: dict, category: str | None) -> tuple[float | None, float | None]:
    """(climb-share fit, longest-climb fit) for this road against this session.

    Both None when the category is unknown or the road carried no altitude —
    an unmeasured road has unknown terrain, and scoring it as "average" would
    invent a fact about it.
    """
    if not category:
        return None, None
    targets = _CATEGORY_TERRAIN.get(category)
    if targets is None:
        return None, None
    ideal_share, ideal_climb = targets

    terrain_fit = _band_fit(
        route.get("climb_share_pct"), ideal_share, _CLIMB_SHARE_TOLERANCE_PCT
    )
    climb_fit = _band_fit(
        route.get("longest_climb_m"),
        ideal_climb,
        max(_CLIMB_LENGTH_TOLERANCE_FLOOR_M, ideal_climb or 0.0),
    )
    return terrain_fit, climb_fit


def _days_since(iso_date: str | None, today: date | None) -> int | None:
    if not iso_date or today is None:
        return None
    try:
        return (today - date.fromisoformat(iso_date[:10])).days
    except ValueError:
        return None


def score_route(
    route: dict,
    *,
    target_duration_minutes: float | None,
    target_tss: float | None,
    category: str | None = None,
    today: date | None = None,
) -> RouteFit:
    """Fit of one route summary (from `route_library.summarize_route`) against
    one planned session's stated duration, TSS target and session category."""
    avg_time_s = route.get("avg_time_s")
    avg_time_min = (avg_time_s / 60.0) if avg_time_s else None
    duration_fit = _clamped_fit(avg_time_min, target_duration_minutes)
    tss_fit = _clamped_fit(route.get("avg_tss"), target_tss)
    terrain_fit, climb_fit = _terrain_fits(route, category)

    # Weighted mean over whichever terms are actually available, renormalised
    # by the weights present. A road with no altitude is scored on what IS
    # known rather than punished for a stream it never recorded.
    weighted = [
        (_WEIGHTS["duration"], duration_fit),
        (_WEIGHTS["tss"], tss_fit),
        (_WEIGHTS["terrain"], terrain_fit),
        (_WEIGHTS["climb"], climb_fit),
    ]
    present = [(w, f) for w, f in weighted if f is not None]
    total_w = sum(w for w, _ in present)
    raw_fit = sum(w * f for w, f in present) / total_w if total_w > 0 else 0.0

    # A fit computed from ONE of the two STATED signals is a weaker claim than
    # one computed from both, even when the number is identical: matching only
    # duration says nothing about whether the road will make the athlete work
    # the way today asks. Terrain terms describe the road, not the plan's
    # demand, so they do not lift this — the discount keys on duration/TSS only.
    if len([f for f in (duration_fit, tss_fit) if f is not None]) == 1:
        raw_fit *= 0.85

    low_confidence = int(route.get("times_ridden") or 0) < LOW_CONFIDENCE_RIDE_COUNT
    is_virtual = bool(route.get("is_virtual"))
    days_since = _days_since(route.get("last_ridden"), today)
    recently_ridden = days_since is not None and days_since <= _RECENTLY_RIDDEN_DAYS

    score = raw_fit
    if low_confidence:
        score *= _LOW_CONFIDENCE_PENALTY
    if is_virtual:
        score *= _VIRTUAL_PENALTY
    if recently_ridden:
        score *= _RECENTLY_RIDDEN_PENALTY

    return RouteFit(
        route=route,
        score=score,
        raw_fit=raw_fit,
        duration_fit=duration_fit,
        tss_fit=tss_fit,
        terrain_fit=terrain_fit,
        climb_fit=climb_fit,
        is_low_confidence=low_confidence,
        is_virtual=is_virtual,
        is_recently_ridden=recently_ridden,
    )


def recommend_routes(
    routes: list[dict],
    *,
    target_duration_minutes: float | None,
    target_tss: float | None,
    category: str | None = None,
    today: date | None = None,
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
            category=category,
            today=today,
        )
        for r in routes
    ]
    fits.sort(key=lambda f: f.score, reverse=True)
    return fits
