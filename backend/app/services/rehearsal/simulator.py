"""March a route segment by segment: gradient → watts → speed, with the
athlete's durability and W′ balance feeding back into what they can hold.

Four effects make this a rehearsal rather than a calculator:

  • ambition is an INPUT. climb_companion's pace_factor/duration_scale are a
    pacing ADVISOR: every output is a fraction of CP by construction, so
    attempted power built from them alone can never cross CP and W' can
    never drain -- confirmed against three real climbs (Passo Giau,
    Campolongo, a Stelvio-length 21 km/7.4%): W'bal stayed pinned at full,
    zero blow-ups, on all three, at any gradient or duration. `effort` fixes
    that: EFFORT_INTENSITY can exceed 1.0 (race = 1.08x CP before the
    gradient multiplier), so a rider who is racing -- not pacing -- a real
    climb can genuinely go into the red;
  • `_climb_push` still shapes attempted power by gradient (harder pitches
    invite a harder push), and `duration_scale` still discounts a long climb
    relative to a short one -- dropping that discount made long-climb
    predictions ~6% optimistic, which is the number the UI displays;
  • available CP falls as work accumulates (rider_model.available_cp), so the
    same climb late in the route is honestly slower than early;
  • W′ depletes, and when it runs out the rider CANNOT hold the target — the
    simulator caps them at available CP and records where it broke. That
    recorded moment is the verdict sentence on the surface.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

from app.services.climb_companion import duration_scale
from app.services.rehearsal.physics import speed_for_power
from app.services.rehearsal.rider_model import RiderModel, available_cp
from app.services.rehearsal.route_profile import Segment
from app.services.w_balance import w_prime_balance_step

Draft = Literal["solo", "small_group", "bunch"]
Effort = Literal["steady", "fondo", "race"]

#: Aero multipliers on CdA. Literature approximations, NOT measurements — the
#: surface labels them as assumptions the athlete sets (spec §6).
DRAFT_FACTORS: dict[str, float] = {"solo": 1.0, "small_group": 0.75, "bunch": 0.65}

#: How hard the athlete intends to ride, as a multiple of CP. This is what
#: makes a blow-up POSSIBLE at all: "race" can exceed 1.0 before the gradient
#: multiplier is even applied.
EFFORT_INTENSITY: dict[str, float] = {"steady": 0.85, "fondo": 0.95, "race": 1.08}

#: Below this W′ the rider is riding on fumes; hold them at available CP.
_BLOWN_J = 1.0


@dataclass(frozen=True)
class Assumptions:
    draft: Draft = "solo"
    effort: Effort = "fondo"
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


def _climb_push(gradient_pct: float) -> float:
    """How much harder than flat-road effort a gradient invites.

    Rises from an easy descent to above 1.0 on real ramps, so together with
    EFFORT_INTENSITY a racing rider's attempted power on a steep pitch can
    genuinely exceed CP -- the previous pacing-advisor curve (pace_factor)
    topped out at 0.97 of *whatever* CP it was handed, which bounded target
    power at or below CP by construction and made the blow-up unreachable.
    """
    if gradient_pct < 0.0:
        return 0.60
    if gradient_pct < 3.0:
        return 0.88
    if gradient_pct < 6.0:
        return 1.00
    if gradient_pct < 9.0:
        return 1.05
    if gradient_pct < 12.0:
        return 1.10
    return 1.15


def _target_power(
    gradient_pct: float, cp_now: float, effort: Effort, climb_time_s: float
) -> float:
    """Attempted power for this gradient at this ambition.

    CAN exceed cp_now -- that is the whole point. A racing rider on a 9%
    ramp attempts roughly 1.08 * 1.05 =~ 1.13 x CP, draining a 20 kJ W' in
    about ten minutes, rather than the ~7.5 W/s the old pacing-advisor-only
    formula produced (needing 2667 s of continuous 13% climbing to matter).

    duration_scale still applies and takes the CLIMB's rough total duration
    (climb_time_s), not how far the route-clock happens to have ticked --
    using route-elapsed time here would make an undamaged rider's identical
    climb read as progressively harder purely because of clock time.
    Dropping duration_scale entirely made long-climb predictions
    systematically optimistic (~6%, the number the UI displays), so it is
    restored to the attempted-power path rather than left out.
    """
    return (
        cp_now
        * EFFORT_INTENSITY[effort]
        * _climb_push(gradient_pct)
        * duration_scale(int(climb_time_s))
    )


def _climb_durations(
    segments: list[Segment], model: RiderModel, effort: Effort
) -> dict[int, float]:
    """One rough duration estimate per continuous climb run, not per segment.

    duration_scale needs the whole climb's rough duration, not "how far the
    march happens to be into it" -- using the growing route-elapsed time
    would make the very same climb read as progressively harder purely
    because of clock time, breaking the invariant that an undamaged rider
    (durability_drop_pct=0) rides every metre of an identical climb at an
    identical pace.

    The estimate deliberately ignores durability, W', and drafting: it uses
    fresh-legs power and the rider's SOLO CdA (never the draft-adjusted one),
    because letting the draft assumption change the estimated climb duration
    could flip the estimate across duration_scale's bucket boundary and
    discontinuously change pacing for a reason that has nothing to do with
    how long the climb actually is.
    """
    solo_cda = model.cda_m2 or 0.0
    durations: dict[int, float] = {}
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
            est_power = (
                (model.cp_watts or 0.0) * EFFORT_INTENSITY[effort] * _climb_push(seg.gradient_pct)
            )
            est_speed = float(
                speed_for_power(est_power, seg.gradient_pct, model.mass_kg, solo_cda, model.crr)
            )
            total_s += seg.length_m / est_speed if est_speed > 0.05 else 0.0
            j += 1
        durations[cid] = total_s
        i = j
    return durations


def _w_prime_step_dt(balance_j: float, power_w: float, cp: float, w_prime: float, dt: float) -> float:
    """w_prime_balance_step generalized to an arbitrary time step `dt` seconds.

    w_prime_balance_step is a 1 Hz step; segment times are not integer
    seconds, and truncating with `int(seg_time)` (as an earlier version did)
    always rounds the remainder away, always in the direction of preserving
    W' -- under-draining it. Depletion is exactly linear in time, so scaling
    by dt is exact; recharge is the same Euler-style per-second rate scaled by
    dt, consistent with how w_prime_balance_step treats one second.
    """
    if power_w > cp:
        out = balance_j - (power_w - cp) * dt
    else:
        out = balance_j + (w_prime - balance_j) * (cp - power_w) / w_prime * dt
    return min(out, w_prime)


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
    climb_durations = _climb_durations(segments, model, assumptions.effort)

    out: list[SegmentResult] = []
    blow_ups: list[BlowUp] = []
    elapsed = 0.0
    kj = 0.0
    blown = False

    for i, seg in enumerate(segments):
        cp_now = available_cp(model, kj)
        climb_time_s = climb_durations.get(seg.climb_id, 0.0) if seg.climb_id is not None else 0.0
        target = _target_power(seg.gradient_pct, cp_now, assumptions.effort, climb_time_s)

        # W′ is the ceiling on going above available CP. Once it is gone the
        # rider is held at what their aerobic engine still supports — this is
        # the difference between a plan and a prediction.
        if w_prime > 0 and bal <= _BLOWN_J and target > cp_now:
            target = cp_now
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
            # Whole seconds through the shared step, then a fractional final
            # step so sub-second remainders are integrated rather than
            # dropped (dropping always preserved W', never depleted it).
            whole = int(seg_time)
            frac = seg_time - whole
            for _ in range(whole):
                bal = float(w_prime_balance_step(bal, target, cp_now, w_prime))
            if frac > 1e-9:
                bal = _w_prime_step_dt(bal, target, cp_now, w_prime, frac)
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
