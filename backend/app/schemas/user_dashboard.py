"""Pydantic schemas for the user_dashboards API."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.analytics import QuerySpec


# ──────────────────────────── chart spec (mirror of frontend) ──────────────

MarkType = Literal["line", "area", "bar", "scatter"]


class ChartEncoding(BaseModel):
    x: str
    y: str
    series: str | None = None


class ChartSpec(BaseModel):
    """Server-side mirror of the frontend ChartSpec.

    Validated on write so a malformed spec from a buggy client never lands
    in the database.
    """
    id: str | None = None
    title: str | None = Field(default=None, max_length=120)
    subtitle: str | None = Field(default=None, max_length=200)
    mark: MarkType
    query: QuerySpec
    encoding: ChartEncoding
    accent: str | None = Field(default=None, max_length=64)
    smooth: bool | None = None
    stacked: bool | None = None


class GridLayoutItem(BaseModel):
    """One cell in a react-grid-layout breakpoint.

    Free-form coordinates so the frontend can rearrange without a roundtrip.
    """
    i: str  # chart id
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1, le=12)
    h: int = Field(ge=1, le=24)
    minW: int | None = None
    minH: int | None = None


# ───────────────────────────────── dashboard ───────────────────────────────


class UserDashboardWrite(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=400)
    layout: list[GridLayoutItem] = Field(default_factory=list)
    charts: list[ChartSpec] = Field(default_factory=list, max_length=15)


class UserDashboardRead(BaseModel):
    id: int
    name: str
    description: str | None
    layout: list[GridLayoutItem]
    charts: list[ChartSpec]
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class UserDashboardListItem(BaseModel):
    id: int
    name: str
    description: str | None
    chart_count: int
    updated_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# Hard cap: prevents runaway dashboards in the UI and runaway queries on the
# server. Matches the product decision (max 15 charts per user). The cap is
# per-user, summed across dashboards — see `enforce_chart_cap` in service.
MAX_CHARTS_PER_USER = 15
