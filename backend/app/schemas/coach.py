"""Pydantic schemas for the /coach/* endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class BriefOption(BaseModel):
    """A single recommended session option — one of the 4 the coach always returns."""
    intensity: Literal["rest", "easy", "moderate", "push"]
    title: str
    why: str
    tss_target: float
    blocked: bool = False
    block_reason: str | None = None


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
    options: list[BriefOption]
    outlook_7d: list[OutlookEntry] | None = None
    frameworks_cited: list[str] = Field(default_factory=list)
    model_used: str
    from_cache: bool

    class Config:
        from_attributes = True


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


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
