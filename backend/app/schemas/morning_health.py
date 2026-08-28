"""Schemas for GET /health/morning-check — the morning-health early-warning."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class MorningHealthSignal(BaseModel):
    """One morning marker, cited with its value against the athlete's baseline.

    EVERY MEASURED MARKER IS RETURNED, not only the deviating ones. This used
    to say "one deviating morning marker" and the service matched it, which is
    why HRV was missing from two screens on any morning it happened to be
    normal: the app measured it, decided it was unremarkable, and dropped it.
    "Your HRV is where it should be" is worth saying, and it can only be said
    if the number survives being fine. `triggered` is how a consumer tells the
    two apart.
    """
    metric: str          # 'resting_hr' | 'hrv' | 'respiration' | 'spo2' | 'sleep_score'
    value: float         # today's reading
    baseline: float | None  # personal rolling-median baseline (None if unavailable)
    direction: str       # 'up' | 'down' — direction of the deviation
    delta: float | None  # signed deviation (bpm / % / brpm), None when no baseline
    unit: str            # 'bpm' | '%' | 'brpm' | ''
    severity: str        # 'mild' | 'strong'
    series: list[float] = []   # trailing values for the sparkline; [] when too few to draw
    triggered: bool = False    # part of why a warning fired, vs. shown for context


class MorningHealthCheck(BaseModel):
    """Illness/downturn early-warning OR a genuine, earned recovery upswing.

    `level` is 'none' when vitals are normal, absent, or the baseline is too
    thin to judge — the frontend renders NOTHING in that case (honest empty).
    `polarity` is `None` exactly when `level == 'none'`; otherwise it says
    which direction fired. This is an early-signal nudge, never a diagnosis.
    """
    level: str                              # 'none' | 'watch' | 'elevated' | 'high'
    polarity: Literal["warning", "opportunity"] | None = None
    signals: list[MorningHealthSignal]
    headline: str | None      # short localized headline, None when level == 'none'
    recommendation: str | None  # localized recommendation, None when level == 'none'
