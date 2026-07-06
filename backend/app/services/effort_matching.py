"""Match a ride's peak efforts against the athlete's rolling-window best.

Pure module. For each duration the ride produced a mean-maximal power for,
report how it compares to the athlete's best at that duration and whether it is
a new personal best (PR). Missing prior best → PR by definition, pct None.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EffortMatch:
    duration_s: int
    ride_watts: float
    best_watts: float | None
    pct_of_best: float | None
    is_pr: bool


def _norm(curve: dict) -> dict[int, float]:
    return {int(k): float(v) for k, v in curve.items()}


def match_efforts(
    ride_mmp: dict,
    athlete_best: dict,
    *,
    pr_tolerance: float = 1.0,
) -> list[EffortMatch]:
    """Compare ride peaks to the athlete best; PR-flag durations. See docstring."""
    ride = _norm(ride_mmp)
    best = _norm(athlete_best)
    out: list[EffortMatch] = []
    for dur in sorted(ride):
        rw = ride[dur]
        bw = best.get(dur)
        if bw is None or bw <= 0:
            out.append(EffortMatch(dur, round(rw, 1), None, None, True))
        else:
            pct = round(rw / bw * 100.0, 1)
            out.append(EffortMatch(
                dur, round(rw, 1), round(bw, 1), pct, rw >= bw * pr_tolerance,
            ))
    return out
