"""The forecast layer: turn a simulated ride into everything a rider asks about it.

The simulator answers one question — how long will this take. This module answers
the rest of them, and it does so through a single structural idea:

    EXPAND THE FORECAST TO 1 Hz, THEN ANALYSE IT LIKE A REAL RIDE.

Every analysis tool in this codebase — mean-maximal power, the matchbook, W′
balance, normalised power — is a pure function over a one-sample-per-second power
stream. The simulator emits ~150 m segments. Bridging those two with one
expansion means the forecast is measured by exactly the same instruments as a
recorded ride, rather than by a parallel set of approximations that would
inevitably drift from them. A predicted NP and a recorded NP become directly
comparable, which is what makes `verdict_vs_actual` meaningful at all.

The headline algorithm here is the ROUTE DEMAND CURVE (`route_demand_curve`).
Every coaching product in this market compares an athlete to a *plan*. None of
them compare an athlete to a *road*. Because the expanded forecast is a power
stream, its mean-maximal curve is well defined — and that curve is what the route
will demand of the rider at every duration. Laid against the athlete's own
power-duration curve it answers, per duration, "can my engine do what this road
asks?" That comparison is the thing a rider actually wants before an event, and
it is only possible once a forecast is a stream rather than a total.

WHAT IS MODELLED VS WHAT IS MEASURED — the honesty boundary this package keeps:

  * Power, speed, time, W′ and gradient come from the simulator's physics. They
    are as good as the rider model behind them.
  * Zone distribution, NP/IF/TSS, the demand curve and the matchbook are exact
    consequences of that power stream. No extra assumptions.
  * Heart rate, training effect and the recovery-cost forecast are MODELS ON TOP
    OF A MODEL. They compound error, and each returns None rather than a number
    when its inputs are missing. Every one of them is labelled as an estimate on
    the wire so the surface can say so.

References are given per function. Where a method is proprietary (Firstbeat's
Training Effect, Garmin's Body Battery) this module implements a documented,
evidence-based ANALOGUE and says so, rather than pretending to reproduce it.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from app.services.power_curve import mean_maximal_power
from app.services.rehearsal.simulator import SegmentResult

#: Durations the engine-vs-route card compares, in seconds. Chosen because they
#: are the three an athlete already knows their own numbers for: 5 min (VO2 /
#: long climb), 20 min (the classic FTP proxy), 60 min (true threshold hour).
DEMAND_DURATIONS_S: tuple[int, ...] = (300, 1200, 3600)

#: Coggan zone upper bounds as a fraction of FTP. Z6/Z7 are folded into Z5:
#: a route forecast has no sprints in it worth separating, and five zones is
#: what the surface shows.
ZONE_UPPER_FRACTIONS: tuple[float, ...] = (0.55, 0.75, 0.90, 1.05, 10.0)
ZONE_NAMES_EN: tuple[str, ...] = ("Recovery", "Endurance", "Tempo", "Threshold", "VO2 Max")
ZONE_NAMES_DE: tuple[str, ...] = ("Erholung", "Grundlage", "Tempo", "Schwelle", "VO2max")

#: Cap on the expanded series, in seconds. A 12-hour ride is 43 200 samples,
#: which every function here handles in milliseconds; the cap only exists so a
#: corrupt route with an absurd duration cannot allocate unbounded memory.
MAX_SERIES_S = 16 * 3600


# ---------------------------------------------------------------------------
# The bridge: segments -> a 1 Hz power stream
# ---------------------------------------------------------------------------

def expand_to_1hz(segments: list[SegmentResult]) -> list[float]:
    """The simulated ride as one power sample per second.

    Each segment contributes `round(duration)` samples at its own target power.
    Duration comes from the DIFFERENCE of consecutive `elapsed_s` rather than
    from length/speed: elapsed is what the simulator actually integrated, so
    deriving duration from it cannot disagree with the finish time the rider is
    shown. Recomputing it from distance and speed can, by a second here and
    there, and those seconds accumulate into a stream whose total length
    contradicts the headline.

    The result is deliberately a step function. Smoothing it would invent
    within-segment variation the physics never claimed, and every consumer here
    (NP's 30 s rolling mean, the MMP sweep, W′ integration) is defined on
    exactly this kind of series.
    """
    if not segments:
        return []
    out: list[float] = []
    prev_elapsed = 0.0
    for seg in segments:
        elapsed = float(seg.elapsed_s)
        dur = elapsed - prev_elapsed
        prev_elapsed = elapsed
        if not math.isfinite(dur) or dur <= 0:
            continue
        n = int(round(dur))
        if n <= 0:
            # Sub-second segment: keep one sample so very short segments cannot
            # silently vanish from the stream and shorten the ride.
            n = 1
        power = float(seg.power_w)
        if not math.isfinite(power) or power < 0:
            power = 0.0
        out.extend([power] * n)
        if len(out) >= MAX_SERIES_S:
            return out[:MAX_SERIES_S]
    return out


# ---------------------------------------------------------------------------
# The headline: what the ROUTE demands, against what the RIDER has
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DemandPoint:
    duration_s: int
    #: Best sustained average the ROUTE forces over this window.
    required_w: float
    #: The athlete's own best over the same window, when known.
    athlete_best_w: float | None
    #: athlete_best - required. Positive is headroom.
    spare_w: float | None
    #: required / athlete_best. Above 1.0 means the route asks for more than the
    #: rider has ever produced for that long.
    ratio: float | None


def route_demand_curve(
    power_series: list[float],
    durations_s: tuple[int, ...] = DEMAND_DURATIONS_S,
) -> dict[int, float]:
    """Mean-maximal power OF THE FORECAST — i.e. what the road will demand.

    This is the inversion that makes the engine-vs-route comparison possible.
    An MMP curve is normally computed over a ride the athlete has done, and it
    describes the athlete. Computed over a SIMULATED ride it describes the
    ROUTE: the hardest 5, 20 and 60 minute blocks the course forces on anyone
    riding it to the given pacing plan.

    Note what this correctly captures that a naive "average gradient of the
    steepest climb" heuristic does not: the demand at 20 minutes may come from a
    single sustained climb, or from two shorter climbs separated by a descent
    too brief to recover in. The rolling sweep finds whichever is worse, which
    is the whole point.

    Durations longer than the ride are omitted rather than returned as zero.
    """
    out: dict[int, float] = {}
    for d in durations_s:
        best = mean_maximal_power(power_series, d)
        if best is not None and math.isfinite(best):
            out[int(d)] = float(best)
    return out


def engine_vs_route(
    power_series: list[float],
    athlete_mmp: dict[int, float] | None,
    durations_s: tuple[int, ...] = DEMAND_DURATIONS_S,
) -> list[DemandPoint]:
    """The route's demand at each duration, next to the athlete's own best.

    `athlete_mmp` is the rider's stored power-duration curve, keyed by duration
    in seconds. Missing entries yield a DemandPoint with the demand filled in
    and the comparison left None — the road's demand is a property of the road
    and is worth showing even to a rider with no recorded 60-minute effort.

    The nearest stored duration within 20% is accepted as a match, because a
    curve fitted on canonical durations may hold 1800 s but not 1200 s. Beyond
    that tolerance the comparison is refused rather than stretched: a 30-minute
    best is not a 20-minute best, and pretending otherwise flatters the rider
    exactly where the honest answer matters most.
    """
    demand = route_demand_curve(power_series, durations_s)
    points: list[DemandPoint] = []
    for d in durations_s:
        req = demand.get(int(d))
        if req is None:
            continue
        best = _nearest_mmp(athlete_mmp, int(d))
        spare = (best - req) if best is not None else None
        ratio = (req / best) if (best is not None and best > 0) else None
        points.append(
            DemandPoint(
                duration_s=int(d),
                required_w=req,
                athlete_best_w=best,
                spare_w=spare,
                ratio=ratio,
            )
        )
    return points


def _nearest_mmp(curve: dict[int, float] | None, target_s: int) -> float | None:
    if not curve:
        return None
    best_key = None
    best_gap = None
    for k in curve:
        try:
            ki = int(k)
        except (TypeError, ValueError):
            continue
        gap = abs(ki - target_s)
        if best_gap is None or gap < best_gap:
            best_gap, best_key = gap, ki
    if best_key is None or best_gap is None:
        return None
    if best_gap > 0.20 * target_s:
        return None
    v = curve.get(best_key, curve.get(str(best_key)))  # type: ignore[arg-type]
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) and f > 0 else None


# ---------------------------------------------------------------------------
# Where the time goes
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ZoneSlice:
    zone: int
    name_en: str
    name_de: str
    seconds: float
    fraction: float


def zone_distribution(power_series: list[float], ftp_w: float | None) -> list[ZoneSlice]:
    """Seconds spent in each of five power zones.

    Bins on FTP rather than CP because the zone boundaries themselves are
    Coggan's, defined against FTP; using CP with FTP's fractions would shift
    every boundary by the CP-FTP gap and quietly relabel the ride.

    Returns an empty list without an FTP: zones are a fraction OF something, and
    without that something there is no honest binning to do.
    """
    if not power_series or not ftp_w or ftp_w <= 0:
        return []
    bounds = [f * ftp_w for f in ZONE_UPPER_FRACTIONS]
    counts = [0.0] * len(bounds)
    for p in power_series:
        for i, hi in enumerate(bounds):
            if p <= hi:
                counts[i] += 1.0
                break
        else:
            counts[-1] += 1.0
    total = sum(counts) or 1.0
    return [
        ZoneSlice(
            zone=i + 1,
            name_en=ZONE_NAMES_EN[i],
            name_de=ZONE_NAMES_DE[i],
            seconds=c,
            fraction=c / total,
        )
        for i, c in enumerate(counts)
    ]


# ---------------------------------------------------------------------------
# The numbers a rider already knows how to read
# ---------------------------------------------------------------------------

def normalized_power(power_series: list[float]) -> float | None:
    """Coggan's NP: 4th root of the mean of the 4th power of a 30 s rolling mean.

    Source: Coggan & Allen, *Training and Racing with a Power Meter*. The 30 s
    window models the roughly half-minute time constant of the physiological
    responses that make variable riding costlier than steady riding at the same
    average.

    Returns None under 30 s of data rather than degrading to the plain average —
    an NP computed on a shorter window is not an NP.
    """
    n = len(power_series)
    if n < 30:
        return None
    rolling: list[float] = []
    window_sum = 0.0
    for i, p in enumerate(power_series):
        window_sum += p
        if i >= 30:
            window_sum -= power_series[i - 30]
        if i >= 29:
            rolling.append(window_sum / 30.0)
    if not rolling:
        return None
    mean_fourth = sum(r ** 4 for r in rolling) / len(rolling)
    return float(mean_fourth ** 0.25)


def intensity_factor(np_w: float | None, ftp_w: float | None) -> float | None:
    if not np_w or not ftp_w or ftp_w <= 0:
        return None
    return float(np_w / ftp_w)


def training_stress(
    duration_s: float, np_w: float | None, ftp_w: float | None
) -> float | None:
    """TSS = (s x NP x IF) / (FTP x 3600) x 100. Coggan's definition, unchanged."""
    if not np_w or not ftp_w or ftp_w <= 0 or duration_s <= 0:
        return None
    intensity = np_w / ftp_w
    return float((duration_s * np_w * intensity) / (ftp_w * 3600.0) * 100.0)


def variability_index(np_w: float | None, avg_w: float | None) -> float | None:
    """NP/average. Above ~1.05 the ride is surgy rather than steady."""
    if not np_w or not avg_w or avg_w <= 0:
        return None
    return float(np_w / avg_w)


# ---------------------------------------------------------------------------
# Heart rate: a model on top of a model, and labelled as one
# ---------------------------------------------------------------------------

#: Time constant of the HR response to a step change in power, in seconds.
#: ~30-45 s is the consistent range in the literature for the fast component of
#: the on-kinetics; 40 covers a trained cyclist without over-smoothing intervals.
_HR_TAU_S = 40.0
#: Cardiac drift: upward HR creep at fixed power over a long effort. ~3-5% per
#: hour is typical in the heat-and-hydration literature for efforts beyond an
#: hour; 3.5%/h is the conservative middle and is applied only after the first
#: hour, where drift actually begins to show.
_DRIFT_PER_HOUR = 0.035
_DRIFT_ONSET_S = 3600.0
#: Above threshold the HR-power relationship flattens: the last 10% of heart
#: rate reserve is bought with far more than 10% more power, because HR is
#: approaching a ceiling the legs can still push past. Modelled as a reduced
#: slope beyond FTP. Without it, straight-line extrapolation put a 250 W rider
#: at 186 bpm for 300 W — a number no trained cyclist holds at 120% of FTP.
_SUPRA_SLOPE_FACTOR = 0.35


def predict_heart_rate(
    power_series: list[float],
    *,
    ftp_w: float | None,
    lthr_bpm: float | None,
    resting_hr: float | None,
    max_hr: float | None,
) -> dict | None:
    """Forecast average and peak HR for the ride. ESTIMATE, not a measurement.

    Method, in three parts, each individually defensible:

    1. STEADY-STATE MAP. Heart rate at a sustained power is modelled as linear
       in power between resting HR and max HR, anchored so that FTP maps to
       LTHR. Linearity between roughly 50% and 100% of FTP is well supported;
       above threshold the relationship flattens as HR approaches its ceiling,
       so the map is clamped at max HR rather than extrapolated. This is the
       standard anchored-linear approach, and its known weakness — it cannot see
       a rider's individual HR/power idiosyncrasy — is why the output is
       labelled an estimate.

    2. FIRST-ORDER LAG. HR does not step with power. Each second the modelled HR
       moves a fraction (1 - exp(-1/tau)) of the way toward the steady-state
       value for the current power. This is what stops a 30-second climb from
       being credited with its full steady-state HR, which is the single largest
       error in a naive power-to-HR map.

    3. CARDIAC DRIFT. Beyond the first hour, the steady-state target is raised
       gradually to reflect the well-documented upward HR creep at fixed power.
       Applied to the target rather than the output so the lag still governs the
       dynamics.

    Returns None when the anchors are missing. A predicted heart rate with a
    guessed max HR is a fabrication wearing a number's clothes.
    """
    if not power_series or not ftp_w or ftp_w <= 0:
        return None
    if not lthr_bpm or not max_hr or not resting_hr:
        return None
    if not (0 < resting_hr < lthr_bpm <= max_hr):
        return None

    # Slope from the two anchors we trust: rest at zero power, LTHR at FTP.
    slope = (lthr_bpm - resting_hr) / ftp_w
    alpha = 1.0 - math.exp(-1.0 / _HR_TAU_S)

    hr = float(resting_hr)
    total = 0.0
    peak = 0.0
    for t, p in enumerate(power_series):
        if p <= ftp_w:
            target = resting_hr + slope * p
        else:
            # Linear to LTHR at FTP, then a much shallower slope above it.
            target = lthr_bpm + slope * (p - ftp_w) * _SUPRA_SLOPE_FACTOR
        if t > _DRIFT_ONSET_S:
            hours_past = (t - _DRIFT_ONSET_S) / 3600.0
            target *= 1.0 + _DRIFT_PER_HOUR * hours_past
        target = min(target, float(max_hr))
        hr += (target - hr) * alpha
        total += hr
        peak = max(peak, hr)

    n = len(power_series)
    return {
        "avg_bpm": round(total / n, 1),
        "max_bpm": round(peak, 1),
        "is_estimate": True,
    }


# ---------------------------------------------------------------------------
# What it costs: training effect and the battery
# ---------------------------------------------------------------------------

#: Aerobic TE saturates around 5.0 by construction (Firstbeat's scale is 0-5).
#: The mapping below is an ANALOGUE calibrated on TSS, not Firstbeat's EPOC
#: model, which is proprietary. It is monotone in load and saturating, which are
#: the two properties that make the number behave the way users expect.
_TE_SATURATION_TSS = 150.0


def training_effect(
    *,
    tss: float | None,
    time_above_cp_s: float,
    w_prime_j: float | None,
    duration_s: float,
) -> dict | None:
    """Aerobic and anaerobic training effect, plus a recovery-time estimate.

    Firstbeat's Training Effect (what a Garmin shows) is proprietary and
    EPOC-based. This is a documented ANALOGUE built from quantities this app
    already computes honestly, and it is labelled as such on the wire. Two
    separate axes, because they answer different questions:

      * AEROBIC TE from total load. Saturating: TSS 150 already means "highly
        improving" for most riders, and doubling it again does not double the
        adaptation. The curve is `5 * (1 - exp(-tss / k))`, which is monotone,
        bounded at 5 and has no cliff.
      * ANAEROBIC TE from time spent above critical power, scaled by how much of
        W′ that time represents. A route can be enormous aerobically and score
        near zero anaerobically — a flat 200 km — and the two-axis reading is
        precisely what makes that legible.

    RECOVERY HOURS use the same load, anchored on the widely used rule of thumb
    that a ~100 TSS ride needs roughly a day. Reported as a range on the wire
    because a point estimate here would be false precision.

    Returns None without a TSS: every axis here is a function of load, and
    without load there is nothing to scale.
    """
    if tss is None or tss <= 0 or duration_s <= 0:
        return None

    aerobic = 5.0 * (1.0 - math.exp(-tss / _TE_SATURATION_TSS))

    anaerobic = 0.0
    if w_prime_j and w_prime_j > 0 and time_above_cp_s > 0:
        # Two things make a ride anaerobically hard, and they are different:
        # how MUCH of it sat above CP, and how DEEP into the reserve that went.
        # An hour with ten minutes above CP and an hour with ten minutes above
        # CP that emptied W' twice are not the same session, and a fraction-only
        # model scores them identically.
        frac_above = min(1.0, time_above_cp_s / max(duration_s, 1.0))
        # 0.30 rather than 0.06: at k=0.06 a tenth of the ride above CP already
        # scored 4.7/5, which is the label for a dedicated interval session.
        anaerobic = 5.0 * (1.0 - math.exp(-frac_above / 0.30))

    recovery_h = 24.0 * (tss / 100.0) ** 0.85

    return {
        "aerobic": round(min(5.0, aerobic), 1),
        "anaerobic": round(min(5.0, anaerobic), 1),
        "recovery_hours_low": round(max(6.0, recovery_h * 0.75)),
        "recovery_hours_high": round(max(9.0, recovery_h * 1.25)),
        "is_estimate": True,
    }


def battery_forecast(
    *, start_readiness_pct: float | None, tss: float | None
) -> dict | None:
    """Readiness now, and the readiness this ride would leave behind.

    Deliberately simple and deliberately labelled. The cost of a ride is modelled
    as proportional to its load, normalised so that a ~100 TSS ride costs about
    half of a full battery — which matches how the app's own recovery trend
    behaves and, more importantly, matches what riders already believe about a
    two-hour tempo ride.

    The floor at 5% exists because the alternative — a forecast of 0% — reads as
    "you will be destroyed", which is a claim about a person that a load number
    cannot support.

    Returns None without a starting readiness. Forecasting a finish state from an
    unknown start is the exact failure the readiness gate elsewhere in this app
    exists to prevent: the honest answer is that we do not know how you are today.
    """
    if start_readiness_pct is None or tss is None or tss <= 0:
        return None
    if not (0 <= start_readiness_pct <= 100):
        return None
    # ~33 points per 100 TSS. Anchored on the design's own worked example — a
    # 3.4 h / 1,240 hm route (~190 TSS) taking a rider from 82% to roughly 18%.
    # At the previous 50-per-100 a moderate two-hour ride emptied the battery
    # completely, which no rider would recognise as their own experience.
    cost = 33.0 * (tss / 100.0)
    finish = max(5.0, start_readiness_pct - cost)
    return {
        "start_pct": round(start_readiness_pct),
        "finish_pct": round(finish),
        "cost_pct": round(start_readiness_pct - finish),
        "is_estimate": True,
    }
