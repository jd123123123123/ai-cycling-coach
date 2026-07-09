"""Contract for the 'Form & Progress' read — the latest ride judged against the
athlete's fitness baseline, surfacing progress vs. fatigue/exhaustion signals."""
from __future__ import annotations

from pydantic import BaseModel

Verdict = str  # "progress" | "fatigue" | "steady"
Tone = str     # "good" | "warn" | "bad" | "neutral"


class Marker(BaseModel):
    """One compared metric: the ride's value against the athlete's baseline."""
    label: str
    value: str
    baseline: str | None = None
    tone: Tone


class Signal(BaseModel):
    """A single progress/fatigue read (evidence bullet)."""
    text: str
    tone: Tone


class FormProgress(BaseModel):
    activity_id: int
    activity_title: str
    activity_date: str
    verdict: Verdict
    headline: str
    ctl: float           # fitness (chronic training load)
    ctl_7d_delta: float  # fitness trend / week
    tsb: float           # form (training stress balance)
    markers: list[Marker] = []
    signals: list[Signal] = []
    lang: str = "en"
