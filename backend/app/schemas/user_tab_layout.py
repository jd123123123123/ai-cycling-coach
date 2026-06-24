"""Schemas for per-user tab card layouts.

A user's layout is a JSON blob keyed by tab id (e.g. "today", "trends"),
each holding an ordered list of {id, hidden} entries. Stored opaquely at the
DB layer; validated here. Caps bound the payload so a malicious client can't
store an unbounded blob.
"""
from pydantic import BaseModel, Field, field_validator

MAX_TABS = 32
MAX_CARDS_PER_TAB = 64


class CardPref(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    hidden: bool = False


class TabLayoutsPayload(BaseModel):
    layouts: dict[str, list[CardPref]] = Field(default_factory=dict)

    @field_validator("layouts")
    @classmethod
    def _within_caps(cls, v: dict[str, list[CardPref]]) -> dict[str, list[CardPref]]:
        if len(v) > MAX_TABS:
            raise ValueError(f"too many tabs (max {MAX_TABS})")
        for tab, cards in v.items():
            if len(cards) > MAX_CARDS_PER_TAB:
                raise ValueError(f"too many cards in '{tab}' (max {MAX_CARDS_PER_TAB})")
        return v


class TabLayoutsRead(TabLayoutsPayload):
    pass
