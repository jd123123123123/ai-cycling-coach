"""SQL compiler for analytics QuerySpec → safe parameterised query.

Defence-in-depth strategy:

1. **Allowlist registry**: every dataset declares its table name, time
   column, and the exact set of columns clients may reference. Any column
   name in a `QuerySpec` is rejected unless it appears in the registry.
2. **Parameterised values only**: filter values are bound via SQLAlchemy's
   `text(...).bindparams(...)`, never interpolated as strings. Identifiers
   (column / table) are validated against the allowlist before being
   inlined — no user-supplied identifier ever reaches the SQL string.
3. **Hard row limit**: the API layer also enforces a cap, but the compiler
   double-checks. `limit + 1` is requested so we can flag truncation.
4. **RLS-protected session**: callers pass `db: AsyncSession` from
   `get_db_for_user`, so even a buggy compiler can only read the current
   user's rows.

Adding a new dataset = add an entry to `DATASETS` below.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date as _date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.analytics import (
    Aggregation,
    Filter,
    QueryColumn,
    QueryResult,
    QuerySpec,
)


@dataclass(frozen=True)
class _Column:
    name: str
    sql_type: str  # 'number' | 'string' | 'date' | 'boolean'


@dataclass(frozen=True)
class _Dataset:
    table: str
    time_column: str
    columns: dict[str, _Column]


# Allowlist of every column the user can reference. Stored separately so a
# typo in a QuerySpec cannot leak data from elsewhere in the schema.
DATASETS: dict[str, _Dataset] = {
    "activities": _Dataset(
        table="activities",
        time_column="started_at",
        columns={
            "id":                _Column("id", "number"),
            "started_at":        _Column("started_at", "date"),
            "sport":             _Column("sport", "string"),
            "duration_seconds":  _Column("duration_seconds", "number"),
            "distance_meters":   _Column("distance_meters", "number"),
            "tss":               _Column("tss", "number"),
            "normalized_power":  _Column("normalized_power", "number"),
            "average_power":     _Column("average_power", "number"),
            "average_hr":        _Column("average_hr", "number"),
            "max_hr":            _Column("max_hr", "number"),
            "calories":          _Column("calories", "number"),
            "title":             _Column("title", "string"),
            "source":            _Column("source", "string"),
        },
    ),
    "daily_metrics": _Dataset(
        table="daily_metrics",
        time_column="date",
        columns={
            "id":            _Column("id", "number"),
            "date":          _Column("date", "date"),
            "sleep_score":   _Column("sleep_score", "number"),
            "hrv_status":    _Column("hrv_status", "number"),
            "body_battery":  _Column("body_battery", "number"),
            "resting_hr":    _Column("resting_hr", "number"),
            "stress_level": _Column("stress_level", "number"),
            "steps":         _Column("steps", "number"),
            "weight_kg":     _Column("weight_kg", "number"),
            "source":        _Column("source", "string"),
        },
    ),
}

_AGG_SQL: dict[Aggregation, str] = {
    "count": "count({col})",
    "sum":   "sum({col})",
    "avg":   "avg({col})",
    "min":   "min({col})",
    "max":   "max({col})",
    "p50":   "percentile_cont(0.5) within group (order by {col})",
    "p95":   "percentile_cont(0.95) within group (order by {col})",
}

_FILTER_OP_SQL: dict[str, str] = {
    "eq":  "=",
    "ne":  "<>",
    "gt":  ">",
    "gte": ">=",
    "lt":  "<",
    "lte": "<=",
}

_TIME_GRAIN_SQL: dict[str, str] = {
    "day":   "date_trunc('day', {col})",
    "week":  "date_trunc('week', {col})",
    "month": "date_trunc('month', {col})",
    "year":  "date_trunc('year', {col})",
}


class QuerySpecError(ValueError):
    """Raised when a QuerySpec references unknown fields or violates rules."""


def _validate_column(ds: _Dataset, name: str) -> _Column:
    col = ds.columns.get(name)
    if col is None:
        raise QuerySpecError(f"Unknown column '{name}' for dataset '{ds.table}'")
    return col


def _measure_sql(ds: _Dataset, agg: Aggregation, column: str) -> tuple[str, str]:
    """Return (sql_expression, output_alias_default)."""
    if agg == "count" and column == "*":
        return "count(*)", "count"
    col = _validate_column(ds, column)
    expr = _AGG_SQL[agg].format(col=col.name)
    return expr, f"{agg}_{col.name}"


def _dimension_sql(ds: _Dataset, column: str, time_grain: str | None) -> tuple[str, str]:
    col = _validate_column(ds, column)
    if time_grain:
        if col.sql_type != "date":
            raise QuerySpecError(
                f"time_grain '{time_grain}' is only valid on date columns; '{column}' is {col.sql_type}"
            )
        expr = _TIME_GRAIN_SQL[time_grain].format(col=col.name)
        return expr, col.name
    return col.name, col.name


async def execute_query(db: AsyncSession, spec: QuerySpec, hard_limit: int = 5_000) -> QueryResult:
    """Compile + execute a QuerySpec inside the caller's RLS-bound session."""
    ds = DATASETS.get(spec.dataset)
    if ds is None:
        raise QuerySpecError(f"Unknown dataset '{spec.dataset}'")

    if not spec.measures:
        raise QuerySpecError("At least one measure is required")

    # ── SELECT clauses ────────────────────────────────────────────────
    select_parts: list[str] = []
    columns_meta: list[QueryColumn] = []

    for dim in spec.dimensions:
        expr, default_alias = _dimension_sql(ds, dim.column, dim.time_grain)
        alias = dim.alias or default_alias
        if not _is_safe_alias(alias):
            raise QuerySpecError(f"Invalid alias '{alias}'")
        select_parts.append(f'{expr} AS "{alias}"')
        col_type = ds.columns[dim.column].sql_type if dim.column in ds.columns else "string"
        columns_meta.append(QueryColumn(name=alias, kind="dimension", type=col_type))  # type: ignore[arg-type]

    for m in spec.measures:
        expr, default_alias = _measure_sql(ds, m.aggregation, m.column)
        alias = m.alias or default_alias
        if not _is_safe_alias(alias):
            raise QuerySpecError(f"Invalid alias '{alias}'")
        select_parts.append(f'{expr} AS "{alias}"')
        columns_meta.append(QueryColumn(name=alias, kind="measure", type="number"))

    select_clause = ", ".join(select_parts)

    # ── WHERE ─────────────────────────────────────────────────────────
    where_parts: list[str] = []
    bindparams: dict[str, Any] = {}

    # Convenience start/end filters on the canonical time column
    if spec.start_date is not None:
        where_parts.append(f"{ds.time_column} >= :_start_date")
        bindparams["_start_date"] = spec.start_date
    if spec.end_date is not None:
        where_parts.append(f"{ds.time_column} <= :_end_date")
        bindparams["_end_date"] = spec.end_date

    for i, f in enumerate(spec.filters):
        col = _validate_column(ds, f.column)
        if f.op == "in":
            if not isinstance(f.value, list) or not f.value:
                raise QuerySpecError("`in` filter needs a non-empty list")
            placeholders: list[str] = []
            for j, v in enumerate(f.value):
                key = f"_f{i}_{j}"
                placeholders.append(f":{key}")
                bindparams[key] = v
            where_parts.append(f"{col.name} IN ({', '.join(placeholders)})")
        else:
            sql_op = _FILTER_OP_SQL.get(f.op)
            if sql_op is None:
                raise QuerySpecError(f"Unsupported filter op '{f.op}'")
            key = f"_f{i}"
            where_parts.append(f"{col.name} {sql_op} :{key}")
            bindparams[key] = f.value

    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

    # ── GROUP BY ──────────────────────────────────────────────────────
    group_clause = ""
    if spec.dimensions:
        group_clause = "GROUP BY " + ", ".join(
            str(i + 1) for i in range(len(spec.dimensions))
        )

    # ── ORDER BY ──────────────────────────────────────────────────────
    order_clause = ""
    if spec.order_by:
        # Allow ordering by either an alias we just declared OR a known column.
        valid_aliases = {c.name for c in columns_meta}
        if spec.order_by in valid_aliases:
            order_clause = f'ORDER BY "{spec.order_by}" {spec.order_dir.upper()}'
        elif spec.order_by in ds.columns:
            order_clause = f"ORDER BY {spec.order_by} {spec.order_dir.upper()}"
        else:
            raise QuerySpecError(f"Cannot order_by unknown column/alias '{spec.order_by}'")
    elif spec.dimensions:
        # Sensible default: order by the first dimension ascending
        order_clause = "ORDER BY 1 ASC"

    # ── LIMIT (request +1 so we can flag truncation) ──────────────────
    limit = min(spec.limit, hard_limit)
    limit_plus_one = limit + 1

    sql = (
        f"SELECT {select_clause} FROM {ds.table} {where_clause} "
        f"{group_clause} {order_clause} LIMIT {limit_plus_one}"
    ).strip()

    rs = await db.execute(text(sql).bindparams(**bindparams))
    rows = [dict(r._mapping) for r in rs.all()]
    truncated = len(rows) > limit
    if truncated:
        rows = rows[:limit]

    # Coerce date/datetime to ISO so the JSON response is portable.
    for row in rows:
        for k, v in list(row.items()):
            if hasattr(v, "isoformat"):
                row[k] = v.isoformat()

    return QueryResult(
        columns=columns_meta,
        rows=rows,
        row_count=len(rows),
        truncated=truncated,
    )


# Aliases must look like a normal SQL identifier so we can safely quote them.
import re

_ALIAS_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]{0,63}$")


def _is_safe_alias(alias: str) -> bool:
    return bool(_ALIAS_RE.match(alias))


def list_datasets() -> dict[str, dict]:
    """Public introspection for the chart builder."""
    return {
        ds_id: {
            "table": ds.table,
            "time_column": ds.time_column,
            "columns": [
                {"name": c.name, "type": c.sql_type}
                for c in ds.columns.values()
            ],
        }
        for ds_id, ds in DATASETS.items()
    }
