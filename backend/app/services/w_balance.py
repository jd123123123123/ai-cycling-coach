"""W′-balance — intra-workout anaerobic-reserve tracking (Skiba differential).

Given Critical Power (CP) and W′ (from `critical_power.py`), W′-balance models
how much of the finite anaerobic work capacity remains, second by second, as an
athlete spends it above CP and recovers it below CP.

Differential model (Skiba, Clarke, Vanhatalo & Jones 2015, "Validation of a
novel intermittent W′ model"): for each 1 s step,

    if P > CP:   W'bal -= (P - CP)                      # expenditure (joules)
    else:        W'bal += (W' - W'bal) * (CP - P) / W'  # reconstitution

Reconstitution is proportional both to how depleted the reserve already is and
to how far below CP the athlete is soft-pedalling — the further below CP and the
emptier the tank, the faster it refills. W′bal is capped at W′ (can't over-fill)
and may go negative, which models task failure / exhaustion.

Use: prescribe interval workouts whose target stream never drives W′bal below 0
(sustainable) and grade executed rides by how deep the athlete dug.

Pure module: no DB, no Garmin. Assumes 1 Hz samples.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WBalanceResult:
    min_w_prime_bal_j: float    # lowest reserve reached (negative = exhaustion)
    end_w_prime_bal_j: float    # reserve at the end of the ride
    depleted: bool              # True if the reserve ever went below 0


def w_prime_balance(
    power_series: list[float], cp: float, w_prime: float
) -> list[float]:
    """Per-second W′-balance trajectory (joules remaining), starting full at W′."""
    bal = w_prime
    out: list[float] = []
    for p in power_series:
        if p > cp:
            bal -= (p - cp)
        else:
            bal += (w_prime - bal) * (cp - p) / w_prime
            if bal > w_prime:
                bal = w_prime
        out.append(bal)
    return out


def w_balance_summary(
    power_series: list[float], cp: float, w_prime: float
) -> WBalanceResult:
    """Summarize a ride's W′-balance trajectory.

    An empty ride reports a full, non-depleted reserve.
    """
    series = w_prime_balance(power_series, cp, w_prime)
    if not series:
        return WBalanceResult(
            min_w_prime_bal_j=w_prime, end_w_prime_bal_j=w_prime, depleted=False
        )
    lowest = min(series)
    return WBalanceResult(
        min_w_prime_bal_j=round(lowest, 1),
        end_w_prime_bal_j=round(series[-1], 1),
        depleted=lowest < 0,
    )
