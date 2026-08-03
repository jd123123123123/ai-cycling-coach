"""The plan a rider can actually carry: chapters, a PR probability, and fuel.

Everything else in this package answers "what will this ride be like". This
module answers "what do I DO about it", which is a different question with
different failure modes — a wrong number here is one a rider acts on.

Three parts, each with its own honesty rule:

  * CHAPTERS. The simulator emits ~150 m segments; nobody rides to 900 of
    those. `narrate_segments` merges them into the four to eight stretches a
    rider would name out loud, each with its own zone, duration and target
    power. The merge is driven by the backend's own climb detection rather than
    a gradient threshold, so a chapter boundary is where the road actually
    changes character.
  * PR PROBABILITY. Reported from the SAME Monte Carlo band that produces the
    time range, not from a second model that could disagree with it. If the
    band says p10-p90 is 3:12-3:36 then the chance of beating 3:20 is a
    property of that distribution, and inventing a separate estimator would let
    the page contradict itself.
  * FUEL. Carbohydrate, fluid and bottle count for the ride, derived from the
    forecast's own energy and intensity. The framing rule is absolute and it is
    a product decision as much as a scientific one: fuel ADEQUACY only, never
    weight, never a deficit, never calories-as-budget. Around 80% of
    competitively trained male endurance athletes show some low-energy-
    availability risk with cyclists worst affected, and a fuelling feature that
    opens with a calorie balance is a feature that makes that worse.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from app.services.rehearsal.route_profile import Climb
from app.services.rehearsal.simulator import SegmentResult

#: Below this a stretch is not a chapter, it is a detail. 1.5 km is about the
#: shortest piece of road a rider describes separately ("the wall out of town").
MIN_CHAPTER_M = 1500.0
#: Ceiling on chapters. Past this the plan stops being memorable, which is the
#: only thing that makes it useful on the bike.
MAX_CHAPTERS = 8

#: Sweat rate, litres per hour, before heat adjustment. The mid-point of the
#: commonly cited 0.5-2.0 L/h range for trained cyclists; individual variation
#: is enormous, which is why the output says "about" and carries an estimate flag.
_BASE_SWEAT_L_H = 0.75
#: Extra sweat per degree above 20 C. Rough, and deliberately conservative.
_SWEAT_PER_DEG = 0.035
_BOTTLE_L = 0.65


@dataclass(frozen=True)
class Chapter:
    start_m: float
    end_m: float
    length_m: float
    avg_gradient_pct: float
    avg_power_w: float
    duration_s: float
    zone: int
    climb_id: int | None
    kind: str  # "climb" | "descent" | "flat"


def _zone_for(power: float, ftp: float | None) -> int:
    if not ftp or ftp <= 0:
        return 2
    f = power / ftp
    for i, hi in enumerate((0.55, 0.75, 0.90, 1.05)):
        if f <= hi:
            return i + 1
    return 5


def _kind_for(gradient: float, climb_id: int | None) -> str:
    if climb_id is not None:
        return "climb"
    if gradient < -1.5:
        return "descent"
    return "flat"


def narrate_segments(
    segments: list[SegmentResult],
    climbs: list[Climb],
    ftp_w: float | None,
) -> list[Chapter]:
    """Merge simulated segments into the stretches a rider would name.

    Boundaries are drawn where the road changes CHARACTER — entering or leaving
    a detected climb, or flipping between descending and flat. Using the
    backend's climb detection rather than a raw gradient threshold matters: a
    brief false-flat inside a col is part of the col, and a rider describing the
    ride would not break it into three.

    Chapters shorter than MIN_CHAPTER_M are folded into their neighbour, which
    is what stops a single steep ramp from becoming its own line in the plan.
    """
    if not segments:
        return []

    climb_ids = {c.climb_id for c in climbs}
    runs: list[list[SegmentResult]] = []
    prev_key: tuple | None = None
    prev_elapsed = 0.0
    durations: list[float] = []

    for seg in segments:
        durations.append(max(0.0, float(seg.elapsed_s) - prev_elapsed))
        prev_elapsed = float(seg.elapsed_s)
        cid = seg.climb_id if seg.climb_id in climb_ids else None
        key = (cid, _kind_for(seg.gradient_pct, cid))
        if key != prev_key:
            runs.append([seg])
            prev_key = key
        else:
            runs[-1].append(seg)

    # Index durations back onto their segments so a merge keeps its time.
    dur_by_id = {id(s): d for s, d in zip(segments, durations)}

    def _build(run: list[SegmentResult]) -> Chapter:
        start = run[0].start_m
        end = run[-1].start_m
        length = max(1.0, end - start)
        total_dur = sum(dur_by_id.get(id(s), 0.0) for s in run)
        avg_p = sum(s.power_w for s in run) / len(run)
        avg_g = sum(s.gradient_pct for s in run) / len(run)
        cid = run[0].climb_id
        return Chapter(
            start_m=start,
            end_m=end,
            length_m=length,
            avg_gradient_pct=avg_g,
            avg_power_w=avg_p,
            duration_s=total_dur,
            zone=_zone_for(avg_p, ftp_w),
            climb_id=cid,
            kind=_kind_for(avg_g, cid),
        )

    chapters = [_build(r) for r in runs if r]

    # Fold short chapters into whichever neighbour they resemble more. A climb
    # is never folded away: it is the part of the road the rider came for.
    merged: list[Chapter] = []
    for ch in chapters:
        if (
            merged
            and ch.length_m < MIN_CHAPTER_M
            and ch.kind != "climb"
            and merged[-1].kind != "climb"
        ):
            prev = merged[-1]
            total_len = prev.length_m + ch.length_m
            merged[-1] = Chapter(
                start_m=prev.start_m,
                end_m=ch.end_m,
                length_m=total_len,
                avg_gradient_pct=(
                    prev.avg_gradient_pct * prev.length_m + ch.avg_gradient_pct * ch.length_m
                )
                / total_len,
                avg_power_w=(
                    prev.avg_power_w * prev.length_m + ch.avg_power_w * ch.length_m
                )
                / total_len,
                duration_s=prev.duration_s + ch.duration_s,
                zone=prev.zone,
                climb_id=prev.climb_id,
                kind=prev.kind,
            )
        else:
            merged.append(ch)

    if len(merged) <= MAX_CHAPTERS:
        return merged
    # Too many: keep every climb, then the longest of the rest, back in order.
    climbs_only = [c for c in merged if c.kind == "climb"]
    others = sorted(
        (c for c in merged if c.kind != "climb"), key=lambda c: -c.length_m
    )
    keep = climbs_only + others[: max(0, MAX_CHAPTERS - len(climbs_only))]
    keep_ids = {(c.start_m, c.end_m) for c in keep}
    return [c for c in merged if (c.start_m, c.end_m) in keep_ids][:MAX_CHAPTERS]


# ---------------------------------------------------------------------------
# PR probability, taken from the band that is already on screen
# ---------------------------------------------------------------------------

def pr_probability(
    *, p10_s: float | None, p50_s: float | None, p90_s: float | None, pr_s: float | None
) -> dict | None:
    """Chance of beating `pr_s`, read off the forecast's own uncertainty band.

    Deliberately derived from the DISPLAYED band rather than from a second
    model. If the page says "3:12 - 3:36" and separately says "83% chance of a
    PR at 3:20", those two claims must be consistent, and the only way to
    guarantee that is to compute the second from the first.

    Method: p10 and p90 of a Monte Carlo finish-time distribution bracket 80% of
    outcomes, so (p90 - p10) spans about 2.563 standard deviations of an
    approximately normal distribution. That gives sigma, and the probability of
    finishing under the PR is the normal CDF at the PR.

    The normal assumption is the honest weak point: the true distribution is
    mildly right-skewed, because a ride can go much worse than the median far
    more easily than it can go much better. That biases this estimate slightly
    OPTIMISTIC, and the caller labels it an estimate for exactly that reason.
    """
    if p10_s is None or p50_s is None or p90_s is None or not pr_s or pr_s <= 0:
        return None
    spread = float(p90_s) - float(p10_s)
    if spread <= 0:
        return None
    sigma = spread / 2.563
    if sigma <= 0:
        return None
    z = (float(pr_s) - float(p50_s)) / sigma
    prob = 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))
    return {
        "pr_s": float(pr_s),
        "probability": round(max(0.0, min(1.0, prob)), 3),
        "margin_s": round(float(pr_s) - float(p50_s)),
        "is_estimate": True,
    }


# ---------------------------------------------------------------------------
# Fuel: adequacy only. Never weight, never a deficit.
# ---------------------------------------------------------------------------

def fuel_plan(
    *,
    total_kj: float | None,
    duration_s: float | None,
    intensity_factor: float | None,
    temperature_c: float | None = None,
) -> dict | None:
    """Carbohydrate, fluid and bottles for this ride.

    Carbohydrate demand rises with intensity and with duration; the band here
    spans the widely used 60-90 g/h guidance, extended upward only for long hard
    rides where trained guts are the limiter rather than the recommendation.

    Two deliberate refusals:

      * NO WEIGHT, NO DEFICIT, NO CALORIE BALANCE. This function returns what to
        eat to ride well, and nothing that could be read as what to eat to weigh
        less. Around 80% of competitively trained male endurance athletes carry
        some low-energy-availability risk, cyclists worst affected, with
        substantially elevated illness and injury rates. A fuelling feature that
        opens with a deficit makes that population worse, and the framing order
        IS the mechanism of harm.
      * NO PRO NUMBERS BY DEFAULT. Real-world amateur intake sits far below the
        90-120 g/h the marketing discourse assumes. The target here is a band a
        rider can actually reach, with the top of the band reserved for rides
        long and hard enough to need it.

    Returns None without an energy figure — a fuel plan with no ride behind it
    is a diet, which is precisely what this must never be.
    """
    if not total_kj or total_kj <= 0 or not duration_s or duration_s <= 0:
        return None
    hours = duration_s / 3600.0

    # Carbohydrate: base band by intensity, widened for long rides.
    if intensity_factor is None or intensity_factor < 0.6:
        lo, hi = 40.0, 60.0
    elif intensity_factor < 0.75:
        lo, hi = 55.0, 75.0
    elif intensity_factor < 0.85:
        lo, hi = 65.0, 90.0
    else:
        lo, hi = 75.0, 100.0
    if hours >= 4.0:
        lo, hi = lo + 5.0, hi + 10.0

    sweat_l_h = _BASE_SWEAT_L_H
    if temperature_c is not None and temperature_c > 20.0:
        sweat_l_h += (temperature_c - 20.0) * _SWEAT_PER_DEG
    fluid_l = sweat_l_h * hours

    return {
        "carbs_g_per_hour_low": round(lo),
        "carbs_g_per_hour_high": round(hi),
        "carbs_g_total": round(((lo + hi) / 2.0) * hours),
        #: Dietary kcal from mechanical work: ~24% gross efficiency makes
        #: 1 kJ of work about 1 kcal of intake. Shown as the SIZE of the ride,
        #: never as a budget to be balanced against.
        "energy_kcal": round(total_kj),
        "fluid_l": round(fluid_l, 1),
        "bottles": max(1, math.ceil(fluid_l / _BOTTLE_L)),
        "sweat_l_per_hour": round(sweat_l_h, 2),
        "temperature_c": temperature_c,
        "is_estimate": True,
    }
