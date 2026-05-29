"""Analytics query schemas — the shared contract between the chart builder
on the frontend and the SQL compiler on the backend.

Goal: a small declarative `QuerySpec` shape that describes a question — pick
a dataset, dimensions to group by, measures (column + aggregation), filters,
optional time grain — without ever exposing raw SQL to the client.

The compiler in `services/analytics_query.py` validates every field against
an allowlist before composing SQL, so a malicious or buggy spec cannot
exfiltrate other tables or other users' rows.
"""
from __future__ import annotations

from datetime import date as _date
from typing import Literal

from pydantic import BaseModel, Field

DatasetId = Literal["activities", "daily_metrics"]
Aggregation = Literal["count", "sum", "avg", "min", "max", "p50", "p95"]
TimeGrain = Literal["day", "week", "month", "year"]
FilterOp = Literal["eq", "ne", "in", "gt", "gte", "lt", "lte"]


class Measure(BaseModel):
    """An aggregated value: avg(tss), sum(distance_meters), count(*)…"""
    column: str = Field(description="Column name from the dataset's allowlist; '*' allowed only with count.")
    aggregation: Aggregation
    alias: str | None = Field(default=None, description="Display name; defaults to '<agg>_<column>'.")


class Dimension(BaseModel):
    """A grouping axis: 'sport', 'started_at' (with time_grain), …"""
    column: str
    time_grain: TimeGrain | None = Field(
        default=None,
        description="Only valid when the column is a date/datetime; bins rows into day/week/month/year.",
    )
    alias: str | None = None


class Filter(BaseModel):
    column: str
    op: FilterOp
    # Single value for eq/ne/gt/gte/lt/lte; list for `in`. Date strings are
    # accepted; the compiler normalises them.
    value: str | int | float | bool | list[str | int | float] | None = None


class QuerySpec(BaseModel):
    """Full description of an analytics question."""
    dataset: DatasetId
    dimensions: list[Dimension] = Field(default_factory=list)
    measures: list[Measure] = Field(default_factory=list, min_length=1)
    filters: list[Filter] = Field(default_factory=list)
    # Optional convenience: when set, applied as filters on the dataset's
    # canonical time column (started_at for activities, date for daily_metrics).
    start_date: _date | None = None
    end_date: _date | None = None
    # Hard cap to prevent runaway queries; the API layer also clamps this.
    limit: int = Field(default=1000, ge=1, le=10_000)
    # Server-side ordering — frontend can override on the chart side.
    order_by: str | None = None
    order_dir: Literal["asc", "desc"] = "asc"


class QueryColumn(BaseModel):
    name: str
    kind: Literal["dimension", "measure"]
    type: Literal["number", "string", "date", "boolean"]


class QueryResult(BaseModel):
    columns: list[QueryColumn]
    rows: list[dict]  # rows are {column_name: value} maps for cheap JSON
    row_count: int
    truncated: bool = False
