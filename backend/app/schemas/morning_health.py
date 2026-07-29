"""Schemas for GET /health/morning-check — the morning-health early-warning."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class MorningHealthSignal(BaseModel):
    """One deviating morning marker, cited with its value vs the athlete's baseline."""
    metric: str          # 'resting_hr' | 'hrv' | 'respiration' | 'spo2' | 'sleep_score'
    value: float         # today's reading
    baseline: float | None  # personal rolling-median baseline (None if unavailable)
    direction: str       # 'up' | 'down' — direction of the deviation
    delta: float | None  # signed deviation (bpm / % / brpm), None when no baseline
    unit: str            # 'bpm' | '%' | 'brpm' | ''
    severity: str        # 'mild' | 'strong'


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
