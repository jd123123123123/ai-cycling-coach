"""Period Report — pure scoring core + DB-backed orchestration.

The top of this module is intentionally DB-free and deterministic so the
scoring logic is unit-tested in isolation. `build_report` at the bottom is
the only async, DB-touching entry point; it assembles two `WindowMetrics`
(current + previous equal window) and feeds them to the pure core.

Scoring philosophy: every axis is a documented 0-100 heuristic where higher
is better. Axes lacking inputs return score=None + insufficient_data=True and
are dropped from the composite, which renormalizes over what's available.
"""
from __future__ import annotations

from dataclasses import dataclass


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return float(max(lo, min(hi, x)))


def _lerp_score(value: float, low: float, high: float) -> float:
    """Map value in [low, high] to [0, 100], clamped. Higher value = higher score."""
    if high == low:
        return 0.0
    return _clamp((value - low) / (high - low) * 100.0)


def _inv_score(value: float, low: float, high: float) -> float:
    """Like _lerp_score but inverted: higher value = lower score (e.g. RHR, decoupling)."""
    return _clamp(100.0 - _lerp_score(value, low, high))


# (letter, inclusive lower bound on composite score)
_GRADE_BANDS: list[tuple[str, float]] = [
    ("A+", 93), ("A", 90), ("A-", 87),
    ("B+", 83), ("B", 80), ("B-", 77),
    ("C+", 73), ("C", 70), ("C-", 63),
    ("D", 0),
]


def letter_for_score(score: float) -> str:
    for letter, lo in _GRADE_BANDS:
        if score >= lo:
            return letter
    return "D"
