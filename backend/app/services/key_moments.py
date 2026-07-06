"""Detect the narrative beats of a ride for the debrief timeline & AI verdict.

Pure module. Each beat is emitted at most once and only when detectable:
best effort (peak 60 s power), biggest match (global W′-balance trough),
strongest finish (final 5 min above ride average), crack point (largest
sustained second-half power drop).
"""
from __future__ import annotations

from dataclasses import dataclass

_EFFORT_WINDOW_S = 60
_FINISH_WINDOW_S = 300


@dataclass(frozen=True)
class KeyMoment:
    kind: str
    at_s: int
    label: str
    value: float
    tone: str


def _rolling_max_window(power: list[float], window: int) -> tuple[int, float]:
    """(start index, average) of the highest `window`-second rolling average."""
    n = len(power)
    w = min(window, n)
    running = sum(power[:w])
    best_sum, best_i = running, 0
    for i in range(1, n - w + 1):
        running += power[i + w - 1] - power[i - 1]
        if running > best_sum:
            best_sum, best_i = running, i
    return best_i, best_sum / w


def detect_key_moments(
    power_series: list[float],
    wbal_series: list[float] | None = None,
    hr_series: list[float] | None = None,
) -> list[KeyMoment]:
    """Narrative beats for the debrief. See module docstring. [] on empty power."""
    n = len(power_series)
    if n == 0:
        return []
    moments: list[KeyMoment] = []

    # Best effort — peak 60 s (or whole ride if shorter).
    eff_i, eff_avg = _rolling_max_window(power_series, _EFFORT_WINDOW_S)
    moments.append(KeyMoment(
        kind="best_effort", at_s=eff_i,
        label="Best 60-second effort", value=round(eff_avg, 1), tone="good",
    ))

    # Biggest match — global W′-balance trough.
    if wbal_series:
        min_idx = min(range(len(wbal_series)), key=lambda i: wbal_series[i])
        moments.append(KeyMoment(
            kind="biggest_match", at_s=min_idx,
            label="Deepest anaerobic drawdown",
            value=round(wbal_series[min_idx], 1), tone="bad",
        ))

    # Strongest finish — final 5 min above the ride average.
    ride_avg = sum(power_series) / n
    if n >= _FINISH_WINDOW_S:
        finish_avg = sum(power_series[-_FINISH_WINDOW_S:]) / _FINISH_WINDOW_S
        if finish_avg > ride_avg:
            moments.append(KeyMoment(
                kind="strongest_finish", at_s=n - _FINISH_WINDOW_S,
                label="Strong finish", value=round(finish_avg, 1), tone="good",
            ))

    # Crack point — biggest drop between the strongest and a later weaker 5-min block.
    if n >= 2 * _FINISH_WINDOW_S:
        blocks = [
            (i, sum(power_series[i:i + _FINISH_WINDOW_S]) / _FINISH_WINDOW_S)
            for i in range(0, n - _FINISH_WINDOW_S + 1, _FINISH_WINDOW_S)
        ]
        peak_i, peak_v = max(enumerate(blocks), key=lambda t: t[1][1])[1]
        after = [b for b in blocks if b[0] > peak_i]
        if after:
            trough_i, trough_v = min(after, key=lambda b: b[1])
            if peak_v > 0 and (peak_v - trough_v) / peak_v >= 0.15:
                moments.append(KeyMoment(
                    kind="crack_point", at_s=trough_i,
                    label="Power dropped off here",
                    value=round((peak_v - trough_v) / peak_v * 100.0, 1), tone="bad",
                ))
    return moments
