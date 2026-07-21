"""Schemas for GET /health/morning-check — the morning-health early-warning."""
from __future__ import annotations

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
    """Illness / significant-downturn early-warning from morning wearable vitals.

    `level` is 'none' when vitals are normal, absent, or the baseline is too thin
    to judge — the frontend renders NOTHING in that case (honest empty). When
    non-'none', `signals` lists the specific deviating markers and
    `recommendation` (already localized to the request) is the honest, data-cited
    guidance. This is an early-warning nudge, never a diagnosis.
    """
    level: str           # 'none' | 'watch' | 'elevated' | 'high'
    signals: list[MorningHealthSignal]
    headline: str | None      # short localized headline, None when level == 'none'
    recommendation: str | None  # localized recommendation, None when level == 'none'
