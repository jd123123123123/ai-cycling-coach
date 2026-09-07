"""Response models for ``GET /readiness/decision``.

Readiness stops being a score to interpret and becomes a decision that already
happened, WITH ITS RECEIPT. The payload therefore always carries three things
next to each other:

    session_now       what today's session is after readiness was applied
    session_planned   what the plan said BEFORE readiness was applied
    driver            the one measured input that moved it, with its number

A score with no counterfactual is decoration: the athlete cannot tell whether
the measurement changed anything. `changed` + `session_planned` is the whole
point of the endpoint, so both are present on every non-withheld response.

Honest absence is a first-class state, not an error: when the wearable is
stale or silent, `withheld` is true, `verdict` is NULL, and `inputs` still
carries the values with their ages so the athlete can see WHAT is stale. A
confident decision built on three-day-old numbers is worse than no decision.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

#: Port of the frontend's one gate (`utils/readinessGate.ts`). 'fresh' = today's
#: reading, 'pending' = yesterday's (a morning that has not synced yet),
#: 'stale' = two or more days old, 'none' = no overnight record at all.
ReadinessGate = Literal["fresh", "pending", "stale", "none"]

#: Every measured input this decision can be built from.
InputKey = Literal[
    "hrv",
    "resting_hr",
    "sleep_score",
    "sleep_duration",
    "sleep_deep",
    "body_battery_wake",
    "stress_wake",
]


class ReadinessSession(BaseModel):
    """One session, in the shape both sides of the counterfactual use."""

    title: str
    template_id: str | None = None
    duration_minutes: int | None = None
    target_tss: float | None = None


class ReadinessInput(BaseModel):
    """One measured signal against the athlete's OWN trailing baseline.

    `baseline` is null — never a guess — when there is too little history to
    form one; `baseline_n` and `note_de` then say how much is still missing.
    """

    key: InputKey
    label_de: str
    value: float | None
    unit: str  # "ms" | "bpm" | "h" | "" (score points)
    #: Which statistic `value` is. HRV's decision construct is a 7-day mean
    #: (the literature convention this app already uses); every other signal
    #: is a single night. Naming it stops the two being read as one thing.
    basis: Literal["today", "recent_7d"]
    baseline: float | None
    #: Readings behind `baseline`. Below the minimum, `baseline` stays null.
    baseline_n: int = 0
    deviation: float | None = None       # value − baseline, signed, in `unit`
    deviation_pct: float | None = None
    #: Deviation in units of the athlete's OWN baseline SD. This is what makes
    #: a threshold mean the same thing for a 30 ms athlete and a 90 ms one.
    z: float | None = None
    #: |z| at which this signal counts as meaningfully off.
    band: float | None = None
    #: |z| / band — how many band-widths off. Comparable ACROSS signals, which
    #: is what lets one of them be named the driver.
    severity: float | None = None
    off: bool = False
    direction: Literal["below", "above", "at", "unknown"] = "unknown"
    #: True when the deviation is in the direction that argues for less load.
    unfavourable: bool = False
    #: Whole days between today and the reading behind `value`.
    age_days: int | None = None
    text_de: str
    note_de: str | None = None


class ReadinessDriver(BaseModel):
    """The single input that moved the decision most, named with its number."""

    key: InputKey
    text_de: str
    z: float | None = None
    severity: float | None = None


class ReadinessVerdict(BaseModel):
    """The verdict as an ACTION, never an adjective."""

    text_de: str
    #: The daily-decision state this rides on ('recover'|'easy'|'quality'|
    #: 'hard'|'planned_rest'|'trained_already'|'sick'|'injured'|'break').
    state: str
    tss_target: float | None = None
    #: "Ohne diese Werte: …" — the counterfactual, in one line.
    counterfactual_text_de: str | None = None


class ReadinessDecisionRead(BaseModel):
    """``GET /readiness/decision`` — today's decision plus its receipt."""

    date: str  # athlete-local ISO date

    # ── Honest absence ───────────────────────────────────────────────────
    gate: ReadinessGate
    data_age_days: int | None = None
    last_measured_on: str | None = None  # ISO date of the newest overnight row
    withheld: bool = False
    withheld_reason_de: str | None = None

    # ── The decision, and what it replaced ───────────────────────────────
    verdict: ReadinessVerdict | None = None
    session_now: ReadinessSession | None = None
    session_planned: ReadinessSession | None = None
    changed: bool = False
    #: 'recorded' — a PlanAdaptation row already rewrote today's plan row, so
    #: `session_planned` is the literal before-image the engine stored.
    #: 'recomputed' — the decision was re-run with the measurements withheld.
    counterfactual_source: Literal["recorded", "recomputed"] | None = None
    #: True only on the 'recorded' path: the plan row on disk already carries
    #: the change. False means the decision caps today; the row is untouched
    #: until the athlete (or the hourly engine) applies it.
    applied: bool = False

    # ── The measurement ──────────────────────────────────────────────────
    driver: ReadinessDriver | None = None
    inputs: list[ReadinessInput] = Field(default_factory=list)
    #: 'ready' — at least one signal has a real baseline. 'building' — signals
    #: exist but none has enough history yet. 'none' — nothing measured.
    baseline_state: Literal["ready", "building", "none"] = "none"

    # ── Context the client already renders elsewhere, echoed for one fetch ─
    readiness_score: int | None = None
    readiness_tier: str | None = None
    hrv_state: Literal["below", "in", "above", "unknown"] = "unknown"
    #: A plan row exists that ``POST /workouts/today/modify`` can act on.
    can_modify: bool = False
