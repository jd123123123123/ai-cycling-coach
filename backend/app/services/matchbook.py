"""Anaerobic "matchbook": discrete W′-balance drawdowns ("matches") over a ride.

Pure module. Reuses w_balance.w_prime_balance to reconstruct the per-second
anaerobic reserve, then walks it to find matches — a match is a drawdown from a
local peak reserve to a local trough of at least ``match_depth_frac`` of W′
before the reserve recovers. Also counts seconds spent above CP.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.w_balance import w_prime_balance


@dataclass(frozen=True)
class Match:
    start_s: int
    end_s: int
    depth_j: float
    min_bal_j: float


@dataclass(frozen=True)
class Matchbook:
    matches: list[Match]
    match_count: int
    time_above_cp_s: int
    min_bal_j: float
    fully_depleted: bool


def analyze_matchbook(
    power_series: list[float],
    cp: float,
    w_prime: float,
    *,
    match_depth_frac: float = 0.5,
) -> Matchbook | None:
    """Detect anaerobic matches from the W′-balance trace. See module docstring."""
    if cp <= 0 or w_prime <= 0 or not power_series:
        return None
    bal = w_prime_balance(power_series, cp, w_prime)
    threshold = match_depth_frac * w_prime

    matches: list[Match] = []
    peak_val = bal[0]
    peak_idx = 0
    trough_val = bal[0]
    trough_idx = 0
    descending = False
    for i, v in enumerate(bal):
        if v >= peak_val and not descending:
            peak_val, peak_idx = v, i          # top of reserve, up to the drawdown
            trough_val, trough_idx = v, i
        if v < trough_val:                     # drawing down
            trough_val, trough_idx = v, i
            descending = True
        # Recovery after a drawdown closes a potential match.
        if descending and v > trough_val + 1e-9:
            depth = peak_val - trough_val
            if depth >= threshold:
                matches.append(Match(
                    start_s=peak_idx, end_s=trough_idx,
                    depth_j=round(depth, 1), min_bal_j=round(trough_val, 1),
                ))
            # reset the search from the recovery point
            peak_val, peak_idx = v, i
            trough_val, trough_idx = v, i
            descending = False
    # A drawdown still open at ride end also counts.
    if descending:
        depth = peak_val - trough_val
        if depth >= threshold:
            matches.append(Match(
                start_s=peak_idx, end_s=trough_idx,
                depth_j=round(depth, 1), min_bal_j=round(trough_val, 1),
            ))

    time_above_cp = sum(1 for p in power_series if p > cp)
    min_bal = min(bal)
    return Matchbook(
        matches=matches,
        match_count=len(matches),
        time_above_cp_s=time_above_cp,
        min_bal_j=round(min_bal, 1),
        fully_depleted=min_bal <= 0,
    )
