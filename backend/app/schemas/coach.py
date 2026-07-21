"""Pydantic schemas for the /coach/* endpoints.

Phase 5.1 reshape: BriefRead now carries `prescribed_workout` (ONE precisely
structured workout with absolute watts) + `alternates` (2 compact fallbacks),
replacing the old 4-option array. The legacy `options` field is kept optional
for backward compatibility during rollout.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.adaptive import AdaptiveDirective


# ======================================================================
# ONE Daily Decision (usability audit P0-3)
# ======================================================================
#
# Four surfaces (Today, Recovery, Load-Form, Coach) used to issue conflicting
# instructions on the same day ("Ruhetag" vs "belaste hart"). DailyDecision is
# the single producer — computed FRESH per request by
# services.daily_decision.compute_daily_decision — that every surface renders
# subordinately. Surfaces may add flavor but must never contradict `state`.

DailyDecisionState = Literal[
    "sick", "injured", "break",
    "trained_already", "planned_rest",
    "recover", "easy", "quality", "hard",
]


class DailyDecisionCTA(BaseModel):
    """Primary call-to-action for the day (frontend maps `target` to a route)."""
    label: str
    target: str


class DailyDecisionPlanned(BaseModel):
    """Today's planned session, when one exists — the shape the plan keeps
    even when the adaptive directive caps the load."""
    title: str
    template_id: str | None = None
    target_tss: float | None = None
    duration_minutes: int | None = None


class DailyDecisionReadiness(BaseModel):
    score: int | None = None
    tier: str | None = None  # 'rest' | 'easy' | 'moderate' | 'push'


class DailyDecision(BaseModel):
    """The one answer to "what should I do today?" — see services.daily_decision."""
    date: str  # athlete-local ISO date
    state: DailyDecisionState
    verdict: str
    reason: str
    cta: DailyDecisionCTA | None = None
    planned: DailyDecisionPlanned | None = None
    readiness: DailyDecisionReadiness = Field(default_factory=DailyDecisionReadiness)
    tss_target: float | None = None
    # Garmin-style 0-21 strain scale. ALWAYS tss_target/8 — daily_decision.py is
    # the only derivation point. Null on rest / trained / sick days.
    strain_target: float | None = None


class AdaptiveDirectiveRead(AdaptiveDirective):
    """/coach/adaptive response — the directive plus the day's single decision
    so the Load-Form surface can render subordinately to it."""
    daily_decision: DailyDecision | None = None


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
    """One interval block, watts derived from the athlete's FTP. HR bounds
    are populated when the athlete's LTHR is known (or can be derived from
    MHR / age via services.hr_zones)."""
    name: str
    duration_s: int
    target_watts_low: int
    target_watts_high: int
    target_pct_ftp: float
    zone: int = Field(..., ge=1, le=7)
    rpe: int = Field(..., ge=1, le=10)
    cadence_low: int | None = None     # rpm — None means "natural cadence"
    cadence_high: int | None = None
    target_hr_low: int | None = None   # bpm — None when LTHR is unknown
    target_hr_high: int | None = None  # bpm
    open_effort: bool = False          # RPE-guided max effort — watt targets are 0 by design
    # ── Structured-set fields (composite on/off blocks, Jul 2026) ─────────
    # A "30×15/45s" set is stored as ONE block; these carry the real
    # structure: reps × (on_s @ target_watts_* + off_s @ off_watts_*).
    # All None for steady blocks. Invariant: reps × (on_s + off_s) == duration_s.
    reps: int | None = None            # number of on/off repetitions
    on_s: int | None = None            # seconds ON per rep (at target_pct_ftp)
    off_s: int | None = None           # seconds OFF per rep (at off_pct_ftp)
    off_pct_ftp: float | None = None   # recovery/under intensity as %FTP
    off_watts_low: int | None = None   # resolved off-band watts
    off_watts_high: int | None = None


class PrescribedWorkout(BaseModel):
    template_id: str
    title: str
    title_de: str | None = None
    duration_minutes: int
    total_duration_s: int | None = None
    predicted_tss: float
    predicted_ef_range: tuple[float, float] | None = None
    framework_cited: str
    purpose: str | None = None
    purpose_de: str | None = None
    category: str | None = None
    blocks: list[ResolvedBlock]
    why_this_workout: str | None = None


class AlternateWorkout(BaseModel):
    label: Literal["less_time", "recover"]
    one_liner: str
    template_id: str


# ======================================================================
# Propose-before-apply — the AI Coach Proposal Card (V3)
# ======================================================================
#
# A plan-change request PROPOSES first (concrete effect, visualised) and only
# persists on Accept. preview_modification_for_user builds a PlanProposal
# WITHOUT mutating state; the frontend renders the before→after diff (BlockBars
# + TSS/intensity numbers + rationale); Accept applies via the SAME audited
# pipeline (rails, PlannedWorkout write, audit row, feed row, cache invalidation).

class ProposalSession(BaseModel):
    """One resolved session (before or after) — carries BlockBars-ready blocks
    plus the load/intensity numbers the diff visualises."""
    date: str
    template_id: str
    title: str | None = None
    label: str
    duration_min: int
    predicted_tss: float
    intensity_factor: float | None = None
    indoor: bool = False
    blocks: list[ResolvedBlock] = Field(default_factory=list)


class ProposalDayDiff(BaseModel):
    """One day inside a week-scope proposal — before→after label + TSS."""
    date: str
    weekday: str
    before_label: str
    after_label: str
    before_tss: float
    after_tss: float
    changed: bool


class PlanProposal(BaseModel):
    """A dry-run plan change. Persists NOTHING — Accept re-runs the same intent
    through the audited apply pipeline."""
    scope: Literal["day", "week"]
    applicable: bool
    modification_type: str
    target_date: str
    reason: str | None = None
    rails_downgraded: bool = False
    # Day scope: the single session before/after (with BlockBars blocks).
    before: ProposalSession | None = None
    after: ProposalSession | None = None
    # Week scope: per-day before→after rows.
    day_diffs: list[ProposalDayDiff] = Field(default_factory=list)
    # Load impact (honest None where the week can't be resolved).
    week_before_tss: float | None = None
    week_after_tss: float | None = None
    tss_delta: float | None = None
    duration_delta_min: int | None = None
    intensity_delta_pct: float | None = None
    rationale: str
    rationale_de: str


class PlanPreviewRequest(BaseModel):
    date: str | None = None
    modification_type: Literal["shorten", "lengthen", "harder", "easier", "indoor"]
    params: dict = Field(default_factory=dict)
    scope: Literal["day", "week"] = "day"


class PlanApplyRequest(PlanPreviewRequest):
    pass


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
    # Whether this review was compliance-graded at all. Sport-gated days
    # (audit P0-2: gym session on a bike-plan day) emit graded=False with the
    # compliance pairs ABSENT — the UI renders a neutral 'logged' card.
    graded: bool = True
    # Compliance numbers (emitted whenever graded; None/{} on logged-only days
    # — ride_compliance serializes ungraded axes as empty dicts, which must
    # not fail validation and null the whole review).
    duration: CompliancePair | None = None
    tss: CompliancePair | None = None
    intensity_factor: CompliancePair | None = None

    @field_validator("duration", "tss", "intensity_factor", mode="before")
    @classmethod
    def _empty_pair_is_none(cls, v: object) -> object:
        # ride_compliance_to_dict serializes ungraded axes as {} (deliberately
        # crash-safe for dict-get consumers); as a pydantic input that must
        # read as absent, not as an invalid CompliancePair.
        return None if isinstance(v, dict) and not v else v
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
    # "What changed & why" — transparent adaptation of today's plan from the
    # day's real signals (HRV, TSB, CTL ramp, ACWR, sleep, yesterday's session),
    # each grounded in a research-backed principle.
    adaptations: dict | None = None
    # ONE Daily Decision (audit P0-3) — computed FRESH at request time in
    # api/coach.py, never read from the cached row (cache skew between
    # surfaces was half the audit bug). None only when computation fails.
    daily_decision: DailyDecision | None = None

    class Config:
        from_attributes = True


class ExternalWorkoutMatch(BaseModel):
    """One entry from the curated external-workout catalogue."""
    id: str
    title: str
    platform: Literal["zwift", "trainerroad", "rouvy"]
    category: str
    duration_min: int
    intensity_factor: float
    structure: str
    min_ftp: int | None = None
    predicted_tss: int


class ExternalWorkoutsRead(BaseModel):
    """Today's external-platform recommendations, scoped to the brief's
    session category and duration window."""
    session_type: str
    target_minutes: int
    matches: list[ExternalWorkoutMatch] = Field(default_factory=list)


class GoalTrajectoryRead(BaseModel):
    """Structured projection surfaced on the dashboard for A-event athletes.

    The backend's `goal_trajectory.project()` already computes everything an
    informed athlete needs: days to event, projected race-day CTL/TSB, Mujika
    taper classification, on-track gap, and a coach-grade narrative_hook.
    This endpoint is the thin pass-through that exposes it without forcing
    the frontend to re-fetch the full coach brief.
    """
    days_to_goal: int | None = None
    # Projection fields are Optional (audit P0-4): when the underlying data
    # can't support an honest projection the producer emits None and the UI
    # renders an honest dash instead of a fabricated number.
    ctl_now: float | None = None
    ctl_7d_delta: float | None = None
    ctl_projected_at_goal: float | None = None
    ctl_target: float | None = None
    tsb_projected_at_goal: float | None = None
    taper_window: Literal["too_flat", "ideal", "too_fresh", "overreached", "unknown"] = "unknown"
    # 'unknown' is the producer's honesty guard (insufficient history / no
    # projectable basis) — distinct from 'no_goal' (no target event at all).
    # Missing it here made every honest-null projection a 500 (carried minor).
    on_track: Literal["ahead", "on_track", "behind", "no_goal", "unknown"] = "no_goal"
    weekly_tss_required: float | None = None
    weekly_tss_actual: float | None = None
    narrative_hook: str = ""
    # What the projection is anchored on (e.g. 'pmc', 'plan_simulation',
    # 'insufficient_data') — set by goal_trajectory.compute_goal_trajectory.
    projection_basis: str = "pmc"
    # Event metadata enriches the UI without a second profile fetch. All optional
    # so the no-goal path renders the trend-only narrative.
    event_name: str | None = None
    event_date: str | None = None  # ISO date
    event_type: str | None = None  # 'race' | 'fondo' | 'audax' | 'maintenance'
    target_priority: str | None = None  # 'A' | 'B' | 'C'


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
