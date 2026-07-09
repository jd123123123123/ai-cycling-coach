"""Detect the narrative beats of a ride for the debrief timeline & AI verdict.

Pure module. Each beat is emitted at most once and only when detectable:
best effort (peak 60 s power), biggest match (global W′-balance trough),
strongest finish (final 5 min above ride average), crack point (largest
sustained second-half power drop).

Window constants (60 s / 300 s) are sample counts assuming 1 Hz power
sampling.
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
    de: bool = False,
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
        label="Beste 60-Sekunden-Leistung" if de else "Best 60-second effort",
        value=round(eff_avg, 1), tone="good",
    ))

    # Biggest match — global W′-balance trough.
    if wbal_series:
        min_idx = min(range(len(wbal_series)), key=lambda i: wbal_series[i])
        moments.append(KeyMoment(
            kind="biggest_match", at_s=min_idx,
            label="Tiefste anaerobe Reserve" if de else "Lowest anaerobic reserve",
            value=round(wbal_series[min_idx], 1), tone="bad",
        ))

    # Strongest finish — final 5 min above the ride average.
    ride_avg = sum(power_series) / n
    if n >= _FINISH_WINDOW_S:
        finish_avg = sum(power_series[-_FINISH_WINDOW_S:]) / _FINISH_WINDOW_S
        if finish_avg > ride_avg:
            moments.append(KeyMoment(
                kind="strongest_finish", at_s=n - _FINISH_WINDOW_S,
                label="Starkes Finale" if de else "Strong finish",
                value=round(finish_avg, 1), tone="good",
            ))

    # Crack point — the biggest sustained block-to-block power drop whose trough
    # falls in the SECOND HALF (a genuine late fade, not settling from a hot
    # start). Compares each 5-min block to the immediately preceding block.
    if n >= 2 * _FINISH_WINDOW_S:
        starts = list(range(0, n - _FINISH_WINDOW_S + 1, _FINISH_WINDOW_S))
        blocks = [
            sum(power_series[s:s + _FINISH_WINDOW_S]) / _FINISH_WINDOW_S
            for s in starts
        ]
        half = n // 2
        best_drop = 0.0
        best_at: int | None = None
        for k in range(1, len(blocks)):
            if starts[k] < half:          # trough must land in the second half
                continue
            prev, cur = blocks[k - 1], blocks[k]
            if prev > 0 and (prev - cur) / prev >= 0.15 and (prev - cur) / prev > best_drop:
                best_drop = (prev - cur) / prev
                best_at = starts[k]
        if best_at is not None:
            moments.append(KeyMoment(
                kind="crack_point", at_s=best_at,
                label="Hier ließ die Leistung nach" if de else "Power dropped off here",
                value=round(best_drop * 100.0, 1), tone="bad",
            ))
    return moments
