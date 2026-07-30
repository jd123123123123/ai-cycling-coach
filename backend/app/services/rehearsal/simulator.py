"""March a route segment by segment: gradient → watts → speed, with the
athlete's durability and W′ balance feeding back into what they can hold.

Three effects make this a rehearsal rather than a calculator:

  • attempted watts come from the SAME pacing curve the app already uses for
    the athlete's own climbs (climb_companion.pace_factor), while
    duration_scale sets a SEPARATE, independent ceiling on what a climb this
    long is actually sustainable to hold (see `_climb_duration_scale`) —
    keeping the two apart is what lets a long, steep enough climb's attempted
    power genuinely outrun what's sustainable, which is the only way a rider
    who paces "by feel" ever draws on W' at all;
  • available CP falls as work accumulates (rider_model.available_cp), so the
    same climb late in the route is honestly slower than early;
  • W′ depletes, and when it runs out the rider CANNOT hold the target — the
    simulator caps them at what remains and records where it broke. That
    recorded moment is the verdict sentence on the surface.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

from app.services.climb_companion import duration_scale, pace_factor
from app.services.rehearsal.physics import speed_for_power
from app.services.rehearsal.rider_model import RiderModel, available_cp
from app.services.rehearsal.route_profile import Segment
from app.services.w_balance import w_prime_balance_step

Draft = Literal["solo", "small_group", "bunch"]

#: Aero multipliers on CdA. Literature approximations, NOT measurements — the
#: surface labels them as assumptions the athlete sets (spec §6).
DRAFT_FACTORS: dict[str, float] = {"solo": 1.0, "small_group": 0.75, "bunch": 0.65}

#: Below this W′ the rider is riding on fumes; hold them at available CP.
_BLOWN_J = 1.0


@dataclass(frozen=True)
class Assumptions:
    draft: Draft = "solo"
    use_weather: bool = True


@dataclass(frozen=True)
class SegmentResult:
    start_m: float
    gradient_pct: float
    power_w: float
    speed_ms: float
    elapsed_s: float
    w_bal_j: float
    climb_id: int | None


@dataclass(frozen=True)
class BlowUp:
    distance_m: float
    climb_id: int | None


@dataclass(frozen=True)
class SimulationResult:
    segments: list[SegmentResult]
    total_time_s: float
    total_kj: float
    blow_ups: list[BlowUp]


def _target_power(gradient_pct: float, cp_now: float) -> float:
    """Attempted power for this gradient, using the app's own pacing curve.

    Deliberately NOT multiplied by duration_scale: that factor is a fatigue
    ceiling on what's *sustainable* over the whole climb (see
    `_climb_duration_scale` below), not a further discount on the gradient's
    own attempted intensity. Folding both into one product bounds target by
    construction (cp_now * fraction<=1 can never exceed cp_now), which would
    make the W'-exhaustion branch below permanently unreachable -- pace_factor
    tops out at 0.97 of *whatever* CP it is handed, so target could never
    outrun a ceiling built from that same CP no matter how fatigue is
    modelled. Keeping the two factors apart lets a long, steep enough climb's
    attempted intensity (pace_factor) genuinely exceed its own duration-worn
    ceiling, which is the only way a rider who paces "by feel" for the
    gradient ever draws on W' at all.
    """
    return cp_now * pace_factor(gradient_pct)


def _climb_duration_scale(
    segments: list[Segment], model: RiderModel, cda: float
) -> dict[int, float]:
    """One duration_scale value per continuous climb run, not per segment.

    duration_scale needs the whole climb's rough duration, not "how far the
    march happens to be into it" -- using the growing route-elapsed time here
    would make the very same climb read as progressively harder purely
    because of clock time, which broke the invariant that an undamaged rider
    (durability_drop_pct=0) rides every metre of an identical climb at an
    identical pace. The estimate deliberately ignores durability and W' --
    duration_scale's buckets (1200 s / 2400 s) are coarse enough that a rough,
    fresh-legs speed estimate lands in the right bucket.
    """
    scales: dict[int, float] = {}
    i, n = 0, len(segments)
    while i < n:
        cid = segments[i].climb_id
        if cid is None:
            i += 1
            continue
        j = i
        total_s = 0.0
        while j < n and segments[j].climb_id == cid:
            seg = segments[j]
            est_power = (model.cp_watts or 0.0) * pace_factor(seg.gradient_pct)
            est_speed = float(
                speed_for_power(est_power, seg.gradient_pct, model.mass_kg, cda, model.crr)
            )
            total_s += seg.length_m / est_speed
            j += 1
        scales[cid] = duration_scale(int(total_s))
        i = j
    return scales


def simulate(
    segments: list[Segment],
    model: RiderModel,
    assumptions: Assumptions = Assumptions(),
    headwind_ms: Sequence[float] | None = None,
    air_density: Sequence[float] | None = None,
) -> SimulationResult:
    """Simulate the route. Caller must check `model.can_predict_time` first."""
    if not model.can_predict_time:
        raise ValueError("rider model cannot support a time prediction")

    cda = (model.cda_m2 or 0.0) * DRAFT_FACTORS[assumptions.draft]
    w_prime = model.w_prime_j or 0.0
    bal = w_prime
    climb_scales = _climb_duration_scale(segments, model, cda)

    out: list[SegmentResult] = []
    blow_ups: list[BlowUp] = []
    elapsed = 0.0
    kj = 0.0
    blown = False

    for i, seg in enumerate(segments):
        cp_now = available_cp(model, kj)
        target = _target_power(seg.gradient_pct, cp_now)

        # The fatigue ceiling: what this rider can actually sustain for a
        # climb this long, given how much of CP their durability still hands
        # them. A long, steep enough climb's attempted power (target, above)
        # can genuinely exceed it -- that gap is what W' is spent covering.
        scale = climb_scales.get(seg.climb_id, 1.0) if seg.climb_id is not None else 1.0
        ceiling = cp_now * scale

        # W′ is the ceiling on going above the sustainable ceiling. Once it is
        # gone the rider is held at what their aerobic engine still supports
        # — this is the difference between a plan and a prediction.
        if w_prime > 0 and bal <= _BLOWN_J and target > ceiling:
            target = ceiling
            if not blown:
                blow_ups.append(BlowUp(distance_m=seg.start_m, climb_id=seg.climb_id))
                blown = True
        elif bal > _BLOWN_J:
            blown = False

        wind = float(headwind_ms[i]) if headwind_ms is not None else 0.0
        rho = float(air_density[i]) if air_density is not None else 1.225

        speed = float(
            speed_for_power(
                target, seg.gradient_pct, model.mass_kg, cda, model.crr,
                air_density=rho, headwind_ms=wind,
            )
        )
        seg_time = seg.length_m / speed if speed > 0.05 else 0.0
        elapsed += seg_time
        kj += target * seg_time / 1000.0

        if w_prime > 0:
            # One second at a time, so recovery below CP is integrated the same
            # way a ridden file would be.
            for _ in range(int(seg_time)):
                bal = float(w_prime_balance_step(bal, target, ceiling, w_prime))
            bal = max(0.0, bal)

        out.append(
            SegmentResult(
                start_m=seg.start_m,
                gradient_pct=seg.gradient_pct,
                power_w=target,
                speed_ms=speed,
                elapsed_s=elapsed,
                w_bal_j=bal,
                climb_id=seg.climb_id,
            )
        )

    return SimulationResult(
        segments=out, total_time_s=elapsed, total_kj=kj, blow_ups=blow_ups
    )
