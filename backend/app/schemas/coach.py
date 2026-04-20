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


class OutlookEntry(BaseModel):
    """7-day forward projection — one entry per day."""
    day_offset: int = Field(..., ge=0, le=6)
    suggested_tss: float
    note: str


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
