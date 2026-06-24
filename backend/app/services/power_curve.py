"""Mean-maximal power (MMP) curve — pure functions over a 1 Hz power stream.

The MMP curve is the best (highest) average power an athlete sustained for each
of a set of durations during a ride. It is the raw material for the Critical
Power model (Phase 1) and durability analysis (Phase 2).

All functions assume one power sample per second. They are pure: no DB, no
Garmin. Numpy is used for the O(n) rolling-sum sweep.

Source: Monod & Scherrer 1965 (power-duration relationship);
TrainingPeaks/Coggan mean-maximal power convention.
"""
from __future__ import annotations

import numpy as np

# Canonical durations (seconds) for a stored power-duration curve. A dense set
# spanning the neuromuscular → aerobic spectrum so the power-duration curve is
# rich (many points) and the CP fit has well-spaced anchors (short anaerobic,
# 3-12 min for CP, 20-60 min for eFTP).
DEFAULT_DURATIONS_S: tuple[int, ...] = (
    1, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600,
    720, 900, 1200, 1800, 2400, 3600, 5400,
)


def mean_maximal_power(power_series: list[float], window_s: int) -> float | None:
    """Best average power sustained over any `window_s`-second block.

    Returns None when the window is longer than the ride or the series is empty.
    Uses a rolling sum (cumulative-sum difference) so it is O(n), not O(n·w),
    and finds the best *sustained* block — a single-second spike cannot inflate
    a longer window.
    """
    n = len(power_series)
    if n == 0 or window_s <= 0 or window_s > n:
        return None
    arr = np.asarray(power_series, dtype=float)
    # Prefix sums with a leading 0 → window sum = prefix[i+w] - prefix[i].
    prefix = np.concatenate(([0.0], np.cumsum(arr)))
    window_sums = prefix[window_s:] - prefix[:-window_s]
    return float(window_sums.max() / window_s)


def mmp_curve(
    power_series: list[float],
    durations_s: list[int] | tuple[int, ...] = DEFAULT_DURATIONS_S,
) -> dict[int, float]:
    """Best average power for each requested duration.

    Durations longer than the ride are omitted (no entry), so a short ride still
    yields a partial curve rather than nulls the caller must filter.
    """
    out: dict[int, float] = {}
    for d in durations_s:
        best = mean_maximal_power(power_series, d)
        if best is not None:
            out[d] = best
    return out
