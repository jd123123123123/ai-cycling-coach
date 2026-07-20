"""Session Report — per-activity 'rated against the prescription' payload.

One completed ride or run, scored against what the coach prescribed for that
day, with sport-aware KPI compliance, a plain-English read of what it means,
and how it shifts the next session. Reuses `ride_compliance.score()` for the
cycling core; adds run-specific pace/HR KPIs on top.

The frontend renders `kpis[]` and `detail_metrics[]` generically — all
sport-specific logic (which KPIs, targets, sentiment) lives here so the view
stays dumb.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

# Colour semantics decoupled from over/under direction: distance +8% reads
# 'good', an easy run 26 s/km too fast reads 'caution', HR above cap 'bad'.
# The view colours the KPI marker by this, not by band alone.
Sentiment = Literal["good", "caution", "bad", "neutral"]
Band = Literal["match", "over", "under"]


class SessionKPI(BaseModel):
    """One prescribed-vs-actual row with everything the bar needs to draw."""

    key: str                    # "duration" | "load" | "intensity" | "distance" | "pace" | "hr"
    label: str                  # localized display label
    target_display: str         # "5:30", "200", "0.66", "6:00/km", "<150"
    actual_display: str         # "6:28", "199", "0.69", "5:34/km", "156 bpm"
    delta_display: str          # "+18%", "on target", "26s faster", "above cap"
    delta_pct: float            # signed — drives bar-marker placement
    band: Band                  # match/over/under vs the prescribed band
    sentiment: Sentiment        # marker colour: good/caution/bad/neutral


class SessionRead(BaseModel):
    """One 'what it means' line."""

    tone: Literal["up", "ok", "down"]
    title: str
    detail: str


class NextSession(BaseModel):
    """How this session shifts the next one — the forward coaching nudge."""

    label: str                  # eyebrow, e.g. "How this shifts your next session"
    headline: str
    detail: str


class DetailMetric(BaseModel):
    label: str
    value: str
    unit: str | None = None


class SessionReport(BaseModel):
    activity_id: int
    title: str
    sport: str                  # "cycling" | "running" | ...
    date: str                   # ISO date
    distance_km: float | None = None
    duration_minutes: float

    grade: str | None           # perfect|strong|okay|overcooked|undercooked, None if unprescribed
    # 'graded' → the session was compliance-scored against a same-sport
    # prescription; 'logged' → neutral record (sport-family mismatch, missing
    # duration/TSS inputs, or unprescribed run) — the FE renders facts only,
    # no verdict ring, no percent chips (usability audit P0-2).
    kind: Literal["graded", "logged"] = "graded"
    grade_score: int            # 0..100 for the verdict ring
    headline: str               # one-line verdict
    prescribed_title: str | None = None   # "Long Endurance · 5:30 h", None when no prescription

    kpis: list[SessionKPI]
    reads: list[SessionRead]
    next_session: NextSession | None = None
    detail_metrics: list[DetailMetric]

    debrief_available: bool = False        # whether /debrief has stream data for this ride
    lang: str = "en"
