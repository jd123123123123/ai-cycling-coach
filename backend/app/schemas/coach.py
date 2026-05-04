"""Pydantic schemas for the /coach/* endpoints.

Phase 5.1 reshape: BriefRead now carries `prescribed_workout` (ONE precisely
structured workout with absolute watts) + `alternates` (2 compact fallbacks),
replacing the old 4-option array. The legacy `options` field is kept optional
for backward compatibility during rollout.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ======================================================================
# Legacy — kept for backward compat on old rows + /coach endpoints
# ======================================================================

class BriefOption(BaseModel):
    """Legacy 4-option shape from Phase 5. Unused by new responses but the
    field stays on BriefRead as `options: list[BriefOption] | None` so old
    rows in coach_briefs are still serialisable.
    """
    intensity: Literal["rest", "easy", "moderate", "push"]
    title: str
    why: str
    tss_target: float
    blocked: bool = False
    block_reason: str | None = None


# ======================================================================
# Phase 5.1 — prescribed workout shape
# ======================================================================

class ResolvedBlock(BaseModel):
    """One interval block, watts derived from the athlete's FTP."""
    name: str
    duration_s: int
    target_watts_low: int
    target_watts_high: int
    target_pct_ftp: float
    zone: int = Field(..., ge=1, le=7)
    rpe: int = Field(..., ge=1, le=10)


class PrescribedWorkout(BaseModel):
    template_id: str
    title: str
    duration_minutes: int
    total_duration_s: int | None = None
    predicted_tss: float
    predicted_ef_range: tuple[float, float] | None = None
    framework_cited: str
    purpose: str | None = None
    category: str | None = None
    blocks: list[ResolvedBlock]
    why_this_workout: str | None = None


class AlternateWorkout(BaseModel):
    label: Literal["less_time", "recover"]
    one_liner: str
    template_id: str


# ======================================================================
# Phase 5.3 — post-ride review
# ======================================================================

class CompliancePair(BaseModel):
    """target vs actual for one axis (duration, TSS, IF) with delta + band."""
    target: float
    actual: float
    delta_pct: float
    band: Literal["match", "over", "under"]


class ActivityWrapup(BaseModel):
    """One activity inside a multi-activity post-ride review (Step 3).

    Populated when the athlete completed >=2 activities on the local day.
    The frontend renders these as per-row mini cards (sport icon + title +
    duration + distance + TSS chip + per-ride compliance chip).

    All numeric fields are nullable — HR-only devices, treadmill running,
    and strength work won't have IF/EF/VI.
    """
    title: str
    sport: str
    tss: float | None = None
    duration_minutes: int | None = None
    distance_km: float | None = None
    intensity_factor: float | None = None
    efficiency_factor: float | None = None
    variability_index: float | None = None
    # Per-ride compliance chip — only populated when count >= 2; for n=1
    # the top-level `grade` carries this instead.
    compliance_grade: Literal["perfect", "strong", "okay", "overcooked", "undercooked"] | None = None


class WrapupTotals(BaseModel):
    """Sum across all activities for the local day (Step 3)."""
    tss: float = 0.0
    duration_minutes: int = 0
    distance_km: float = 0.0
    count: int = 0


class PostRideReview(BaseModel):
    """Complete post-ride review attached to the brief when the athlete has
    already trained today.

    Trigger (post Step 3): >=1 activity AND total_duration_minutes >= 20.

    Single-session mode (count == 1): the existing fields populate exactly
    as before — top-level `grade`, `duration`, `tss`, narrative paragraphs.
    The new `activities` / `totals` fields are still emitted (one entry +
    matching totals) so the frontend has a uniform shape to read from.

    Multi-session mode (count >= 2): top-level `grade` is None and the
    per-axis pairs (`duration`, `tss`) are aggregated totals; per-ride
    compliance chips live inside `activities[].compliance_grade`. Narrative
    fields are populated with a single combined paragraph covering both
    sessions.

    All new fields default to empty / null so older briefs still validate.
    `grade` is now nullable (was required) — necessary for the multi-session
    case. Existing single-session payloads continue to set it.
    """
    grade: Literal["perfect", "strong", "okay", "overcooked", "undercooked"] | None = None
    headline: str                       # 3-8 words, e.g. "Perfect execution"
    # Compliance numbers (always emitted — simple mode shows them with friendly
    # labels; technical mode shows them with their sports-science names).
    duration: CompliancePair
    tss: CompliancePair
    intensity_factor: CompliancePair | None = None
    variability_index: float | None = None
    ef: float | None = None
    decoupling_pct: float | None = None
    # Narrative fields — language-aware (backend or LLM fills these).
    physiological_read: str             # 2-3 sentences
    goal_trajectory: str                # 1-2 sentences
    next_session_nudge: str             # specific next-action recommendation
    # Context for the UI to render the "what would have been" row.
    target_template_id: str
    target_template_title: str
    session_type: str
    # Step 3 — multi-activity additions. Default to empty so older briefs still
    # validate. When count >= 2, frontend renders the stacked summary header
    # + per-row mini-cards with per-ride compliance chips.
    activities: list[ActivityWrapup] = Field(default_factory=list)
    totals: WrapupTotals = Field(default_factory=WrapupTotals)


class OutlookEntry(BaseModel):
    """7-day forward projection — one entry per day."""
    day_offset: int = Field(..., ge=0, le=6)
    suggested_tss: float
    note: str


# ======================================================================
# Today-runthrough Step 7 — tomorrow plan + regeneration
# ======================================================================


IntensityChip = Literal["recovery", "endurance", "tempo", "threshold", "vo2", "race"]


class TomorrowPlan(BaseModel):
    """Forward-looking 3–5 sentence preview of tomorrow's session.

    Step 7 (today-runthrough): rendered as a compact card below the workout
    card. `description` is the prose ("steady push for ~75 minutes…"), the
    `predicted_tss` and `intensity_chip` drive the chips above the paragraph.

    Optional everywhere — older briefs that don't ship this block still
    validate. When the LLM omits it, the frontend simply hides the card.
    """
    description: str  # 3–5 sentences
    predicted_tss: float
    intensity_chip: IntensityChip


class Regeneration(BaseModel):
    """Plain-text regeneration bullets — sleep, fuel, mobility, caffeine.

    Step 7: 2–3 short lines, no acronyms. Frontend renders as a hairline-
    divided list under the tomorrow card. Optional on purpose so older
    briefs still parse.
    """
    bullets: list[str] = Field(default_factory=list, max_length=4)


class BriefRead(BaseModel):
    """Response for GET /coach/brief and POST /coach/brief/refresh."""
    id: int
    generated_at: datetime
    verdict: str
    rationale: str
    evidence: dict                  # the full snapshot the coach saw
    prescribed_workout: PrescribedWorkout | None = None
    alternates: list[AlternateWorkout] = Field(default_factory=list)
    # Legacy — populated only when reading pre-5.1 briefs. New generations set None.
    options: list[BriefOption] | None = None
    outlook_7d: list[OutlookEntry] | None = None
    frameworks_cited: list[str] = Field(default_factory=list)
    model_used: str
    from_cache: bool
    # Phase 5.2 — which language the brief is in ('simple' is default).
    # Read from evidence.language when present; pre-5.2 rows coalesce to 'simple'.
    language: Literal["simple", "technical"] = "simple"
    # Phase 5.3 — when the athlete has already trained today, the brief carries
    # a full post-ride review that the frontend renders in place of the
    # prescribed-workout card.
    post_ride_review: PostRideReview | None = None
    # Step 7 (today-runthrough) — optional forward-looking blocks. Older briefs
    # without these fields continue to validate (defaults are None).
    tomorrow_plan: TomorrowPlan | None = None
    regeneration: Regeneration | None = None

    class Config:
        from_attributes = True


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    # Phase 5.2 — request chat replies in simple (plain English) or technical
    # (full vocabulary with inline explanations). Default is simple.
    language: Literal["simple", "technical"] = "simple"


class CauseEntry(BaseModel):
    label: str
    severity: Literal["low", "med", "high"]
    evidence: str


class WhyTiredRead(BaseModel):
    """Response for GET /coach/why — the causal synthesizer."""
    causes: list[CauseEntry]
    snapshot: dict


class TransparencyRead(BaseModel):
    """Response for GET /coach/transparency — 'show me what the AI saw'."""
    snapshot: dict
    system_prompt: str
    model: str
    last_brief_id: int | None
    last_generated_at: datetime | None
