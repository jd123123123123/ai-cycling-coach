"""Contract for the adaptive-training directive (daily autoregulation)."""
from __future__ import annotations

from pydantic import BaseModel


class AdaptiveSignal(BaseModel):
    text: str
    tone: str       # good | warn | bad | neutral
    evidence: str   # RCT | expert | guardrail


class AdaptiveDirective(BaseModel):
    directive: str          # escalate | push | hold | deload | rest
    intensity_ceiling: str  # push | hard | moderate | easy | rest
    volume_modifier: float
    hrv_state: str          # below | in | above | unknown
    headline: str
    signals: list[AdaptiveSignal] = []
    confidence: str = "moderate"
    lang: str = "en"
