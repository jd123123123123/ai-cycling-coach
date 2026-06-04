# Rich Chart Model (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a dashboard chart plot multiple metrics together with dual Y-axis, combo (per-metric) mark types, and reference/threshold lines — backward-compatible with existing single-metric charts, and configurable through the existing builder via progressive disclosure.

**Architecture:** Additive optional fields on `ChartSpec` (`encoding.measures[]`, `referenceLines[]`); a refactored `buildEChartsOption` that renders one series per measure (with per-series mark + dual-axis auto/manual assignment) plus ECharts `markLine`/`markArea` reference lines; and `ChartBuilder` additions (multi-metric rows, ref-line editor) that emit the new fields. The query engine already returns multiple measures, so no query-compiler change.

**Tech Stack:** FastAPI + Pydantic (backend); React 19 + TS + ECharts (frontend). Reuses `QuerySpec` (already multi-measure), `ChartCanvas`, `ChartBuilder`, `resolveCssVar`, `athletes/me` profile.

**Builds on spec:** `docs/superpowers/specs/2026-06-04-rich-chart-model-design.md`.

---

## File Structure

**Backend (modify):**
- `backend/app/schemas/user_dashboard.py` — add `MeasureStyle`, `ReferenceLine`; add `measures` to `ChartEncoding`, `reference_lines` to `ChartSpec`; cap validator.
- `backend/tests/test_user_dashboard_schema.py` (create) — validation tests.

**Frontend (modify):**
- `frontend/src/types/chartSpec.ts` — add `MeasureStyle`, `ReferenceLine`; extend `ChartEncoding`/`ChartSpec`.
- `frontend/src/components/charts/ChartCanvas.tsx` — refactor `buildEChartsOption` for multi-measure, combo, dual-axis, reference lines.
- `frontend/src/components/charts/ChartBuilder.tsx` — multi-metric rows + ref-line editor + buildSpec/hydrate updates.

**Naming note:** Use **snake_case** `reference_lines` on the backend Pydantic model (matches `time_grain`, `order_by`, `start_date` convention) and **camelCase** `referenceLines` in the frontend TS type. Axios JSON carries whatever the client sends; the dashboards PUT validates against the backend model, so the FRONTEND must send `reference_lines` in the saved JSON. To keep one shape end-to-end, we use `reference_lines` in BOTH the TS type and the Pydantic model (snake_case everywhere for this feature), mirroring how `time_grain`/`order_by` already appear snake_case in the TS `QuerySpec`. Likewise `encoding.measures` uses the same field name both sides.

---

## Conventions (read once)
- Backend tests: `cd backend && uv run pytest`.
- Frontend: `cd frontend && npx tsc -b --noEmit 2>&1 | grep <file>` — project has ~22 PRE-EXISTING unrelated tsc errors (incl. one in `ChartCanvas.tsx` about `boundaryGap`); only NEW failures referencing touched files matter.
- No frontend unit-test runner is configured; frontend correctness is verified by type-check + the live drive in the final task.
- ECharts is imported as `import * as echarts from 'echarts'` (full bundle) — already in `ChartCanvas.tsx`.

---

### Task 1: Backend schema — MeasureStyle, ReferenceLine, encoding.measures, reference_lines

**Files:**
- Modify: `backend/app/schemas/user_dashboard.py`
- Create: `backend/tests/test_user_dashboard_schema.py`

- [ ] **Step 1: Write failing tests**

```python
"""Validation tests for the rich ChartSpec fields (multi-measure, ref lines)."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.user_dashboard import ChartSpec

BASE = {
    "mark": "line",
    "query": {
        "dataset": "activities",
        "dimensions": [{"column": "started_at", "time_grain": "week", "alias": "date"}],
        "measures": [
            {"column": "tss", "aggregation": "sum", "alias": "sum_tss"},
            {"column": "average_hr", "aggregation": "avg", "alias": "avg_average_hr"},
        ],
    },
    "encoding": {"x": "date", "y": "sum_tss"},
}


def test_accepts_measure_styles_and_axes():
    spec = ChartSpec(**{**BASE, "encoding": {
        "x": "date", "y": "sum_tss",
        "measures": [
            {"key": "sum_tss", "mark": "bar", "axis": "left"},
            {"key": "avg_average_hr", "mark": "line", "axis": "right"},
        ],
    }})
    assert spec.encoding.measures[1].axis == "right"
    assert spec.encoding.measures[0].mark == "bar"


def test_rejects_bad_axis():
    with pytest.raises(ValidationError):
        ChartSpec(**{**BASE, "encoding": {
            "x": "date", "y": "sum_tss",
            "measures": [{"key": "sum_tss", "axis": "middle"}],
        }})


def test_rejects_bad_measure_mark():
    with pytest.raises(ValidationError):
        ChartSpec(**{**BASE, "encoding": {
            "x": "date", "y": "sum_tss",
            "measures": [{"key": "sum_tss", "mark": "pie"}],
        }})


def test_caps_measures_at_four():
    with pytest.raises(ValidationError):
        ChartSpec(**{**BASE, "encoding": {
            "x": "date", "y": "sum_tss",
            "measures": [{"key": f"m{i}"} for i in range(5)],
        }})


def test_accepts_all_reference_line_kinds():
    spec = ChartSpec(**{**BASE, "reference_lines": [
        {"kind": "value", "value": 250, "label": "FTP"},
        {"kind": "average"},
        {"kind": "profile", "source": "ftp"},
        {"kind": "band", "value": -10, "valueMax": 5, "label": "optimal"},
    ]})
    assert len(spec.reference_lines) == 4
    assert spec.reference_lines[3].valueMax == 5


def test_rejects_bad_reference_kind():
    with pytest.raises(ValidationError):
        ChartSpec(**{**BASE, "reference_lines": [{"kind": "diagonal"}]})


def test_legacy_spec_without_new_fields_still_valid():
    spec = ChartSpec(**BASE)
    assert spec.encoding.measures is None
    assert spec.reference_lines == []
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && uv run pytest tests/test_user_dashboard_schema.py -q`
Expected: FAIL (fields/models not defined).

- [ ] **Step 3: Implement schema additions**

In `backend/app/schemas/user_dashboard.py`, add these models after the existing `MarkType` definition and before `ChartEncoding`:

```python
AxisSide = Literal["left", "right"]
ReferenceKind = Literal["value", "average", "profile", "band"]
ProfileSource = Literal["ftp", "lthr"]


class MeasureStyle(BaseModel):
    """Per-metric rendering for multi-measure charts."""
    key: str = Field(description="A measure alias present in query.measures")
    label: str | None = Field(default=None, max_length=120)
    mark: MarkType | None = None
    axis: AxisSide | None = Field(default=None, description="omit → renderer auto-assigns")


class ReferenceLine(BaseModel):
    """A horizontal marker (value/average/profile) or a shaded band."""
    kind: ReferenceKind
    label: str | None = Field(default=None, max_length=120)
    value: float | None = None
    valueMax: float | None = None
    axis: AxisSide | None = None
    source: ProfileSource | None = None
```

Change `ChartEncoding` to add `measures`:

```python
class ChartEncoding(BaseModel):
    x: str
    y: str
    series: str | None = None
    measures: list[MeasureStyle] | None = Field(default=None, max_length=4)
```

Add `reference_lines` to `ChartSpec` (after `stacked`):

```python
    reference_lines: list[ReferenceLine] = Field(default_factory=list, max_length=8)
```

(`MarkType`, `Literal`, `BaseModel`, `Field` are already imported in this file.)

- [ ] **Step 4: Run, verify pass + full suite**

Run: `cd backend && uv run pytest tests/test_user_dashboard_schema.py -q` → PASS.
Run: `cd backend && uv run pytest -q` → all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/user_dashboard.py backend/tests/test_user_dashboard_schema.py
git commit -m "feat(charts): backend ChartSpec — multi-measure styles + reference lines"
```

---

### Task 2: Frontend types

**Files:**
- Modify: `frontend/src/types/chartSpec.ts`

- [ ] **Step 1: Add types**

In `frontend/src/types/chartSpec.ts`, after the `MarkType` definition add:

```typescript
export type AxisSide = 'left' | 'right'
export type ReferenceKind = 'value' | 'average' | 'profile' | 'band'

export interface MeasureStyle {
  key: string            // a measure alias present in query.measures
  label?: string
  mark?: MarkType
  axis?: AxisSide        // omit → renderer auto-assigns
}

export interface ReferenceLine {
  kind: ReferenceKind
  label?: string
  value?: number
  valueMax?: number
  axis?: AxisSide
  source?: 'ftp' | 'lthr'
}
```

In `ChartEncoding`, add (alongside `series?`):
```typescript
  measures?: MeasureStyle[]
```

In `ChartSpec`, add (alongside `smooth?`/`stacked?`):
```typescript
  reference_lines?: ReferenceLine[]
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep "chartSpec.ts"` → no output.
```bash
git add frontend/src/types/chartSpec.ts
git commit -m "feat(charts): frontend types — measure styles + reference lines"
```

---

### Task 3: Renderer — multi-measure series, combo marks, dual axis

**Files:**
- Modify: `frontend/src/components/charts/ChartCanvas.tsx`

This refactors `buildEChartsOption` so a chart can render one series per measure with per-series mark and a 2nd Y-axis. Reference lines come in Task 4. The function gains an optional `profile` arg (used in Task 4); add the parameter now but leave it unused until Task 4.

- [ ] **Step 1: Add helpers above `buildEChartsOption`**

Insert these helpers just above `function buildEChartsOption(`:

```typescript
// One ECharts series from a name+data+style. Centralises mark→series mapping
// so single-measure, category-split, and multi-measure paths share it.
function makeSeries(opts: {
  name: string
  data: Array<[string | number, number]>
  color: string
  mark: MarkType
  smooth: boolean
  stacked: boolean
  yAxisIndex: number
  singleSeries: boolean
}): echarts.SeriesOption {
  const { name, data, color, mark, smooth, stacked, yAxisIndex, singleSeries } = opts
  const base = { name, data, itemStyle: { color }, yAxisIndex }
  if (mark === 'bar') {
    return { ...base, type: 'bar', ...(stacked ? { stack: 'all' } : {}), barMaxWidth: 22 }
  }
  if (mark === 'scatter') {
    return { ...base, type: 'scatter', symbolSize: 7 }
  }
  return {
    ...base,
    type: 'line',
    smooth,
    symbol: 'circle',
    symbolSize: singleSeries ? 4 : 0,
    showSymbol: false,
    lineStyle: { width: 2, color },
    ...(mark === 'area'
      ? {
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: `${color}55` },
              { offset: 1, color: `${color}05` },
            ]),
          },
        }
      : {}),
    ...(stacked ? { stack: 'all' } : {}),
  }
}

// Max absolute Y across a series' points — used for the auto-dual-axis heuristic.
function seriesMaxAbs(pairs: Array<[string | number, number]>): number {
  return pairs.reduce((m, [, y]) => Math.max(m, Math.abs(Number(y) || 0)), 0)
}

// Decide each measure's axis (0=left,1=right). Honors explicit axis; otherwise
// auto-assigns the smaller-magnitude metric to the right ONLY when exactly two
// measures differ by ≥5×. 3+ measures with no explicit axis all go left.
function resolveAxisIndices(
  measures: MeasureStyle[],
  maxByKey: Record<string, number>,
): number[] {
  const explicit = measures.map((m) => (m.axis === 'right' ? 1 : m.axis === 'left' ? 0 : -1))
  if (explicit.every((v) => v !== -1)) return explicit
  if (measures.length === 2 && explicit.every((v) => v === -1)) {
    const a = maxByKey[measures[0].key] || 0
    const b = maxByKey[measures[1].key] || 0
    const hi = Math.max(a, b), lo = Math.min(a, b)
    if (hi > 0 && lo > 0 && hi / lo >= 5) {
      // smaller one → right
      return a <= b ? [1, 0] : [0, 1]
    }
  }
  return measures.map((v, i) => (explicit[i] === -1 ? 0 : explicit[i]))
}
```

Add `MeasureStyle` to the type import at the top of the file:
```typescript
import type { ChartSpec, MarkType, MeasureStyle, QueryResult } from '../../types/chartSpec'
```
(Adjust to match the existing import — the file already imports `ChartSpec`/`QueryResult`; add `MarkType` and `MeasureStyle` if not present.)

- [ ] **Step 2: Rewrite the series/axes section of `buildEChartsOption`**

Replace the body of `buildEChartsOption` from `const seriesData = pivot(...)` down to the `return { ... }` with this. The multi-measure branch runs when `spec.encoding.measures` has entries; otherwise the legacy `pivot` path runs unchanged.

```typescript
function buildEChartsOption(
  spec: ChartSpec,
  result: QueryResult,
  profile?: { ftp?: number | null; lthr?: number | null },
): echarts.EChartsOption {
  void profile // used by reference lines (Task 4)
  const xType = inferXAxisType(result, spec.encoding.x)
  const palette = DEFAULT_PALETTE.map(resolveCssVar)
  const accent = spec.accent ? resolveCssVar(spec.accent) : palette[0]
  const smooth = spec.smooth ?? true

  const measures = spec.encoding.measures ?? null
  let series: echarts.SeriesOption[]
  let useRightAxis = false
  let rightAxisName = ''
  let leftAxisName = ''

  if (measures && measures.length > 0) {
    // Multi-measure: one series per measure, value = row[measure.key].
    const maxByKey: Record<string, number> = {}
    for (const m of measures) {
      maxByKey[m.key] = seriesMaxAbs(
        result.rows.map((r) => [r[spec.encoding.x] as string | number, (r[m.key] as number) ?? 0]),
      )
    }
    const axisIdx = resolveAxisIndices(measures, maxByKey)
    series = measures.map((m, i) => {
      const data = result.rows.map(
        (r) => [r[spec.encoding.x] as string | number, (r[m.key] as number) ?? 0] as [string | number, number],
      )
      if (axisIdx[i] === 1) { useRightAxis = true; rightAxisName = m.label ?? m.key }
      else leftAxisName = leftAxisName || (m.label ?? m.key)
      return makeSeries({
        name: m.label ?? m.key,
        data,
        color: palette[i % palette.length],
        mark: m.mark ?? spec.mark,
        smooth,
        stacked: false,
        yAxisIndex: axisIdx[i],
        singleSeries: false,
      })
    })
  } else {
    // Legacy: single measure, optionally split into series by a category.
    const seriesData = pivot(result, spec)
    series = seriesData.map((s, i) =>
      makeSeries({
        name: s.name,
        data: s.pairs,
        color: seriesData.length === 1 ? accent : palette[i % palette.length],
        mark: spec.mark,
        smooth,
        stacked: !!spec.stacked,
        yAxisIndex: 0,
        singleSeries: seriesData.length === 1,
      }),
    )
  }

  const axisLabelStyle = {
    color: resolveCssVar('var(--color-muted)'),
    fontSize: 10.5,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  }
  const yAxisBase = {
    type: 'value' as const,
    splitLine: { lineStyle: { color: resolveCssVar('var(--color-rule)'), type: 'dashed' as const } },
    axisLabel: axisLabelStyle,
  }
  const yAxis: echarts.EChartsOption['yAxis'] = useRightAxis
    ? [
        { ...yAxisBase, name: leftAxisName, nameTextStyle: { color: resolveCssVar('var(--color-muted)'), fontSize: 10 } },
        { ...yAxisBase, name: rightAxisName, splitLine: { show: false }, nameTextStyle: { color: resolveCssVar('var(--color-muted)'), fontSize: 10 } },
      ]
    : yAxisBase

  const showLegend = series.length > 1
  return {
    animationDuration: 480,
    animationEasing: 'cubicOut',
    grid: { left: 8, right: 12, top: showLegend ? 24 : 16, bottom: 24, containLabel: true },
    legend: showLegend
      ? {
          top: 0,
          left: 0,
          icon: 'roundRect',
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { fontSize: 11, color: resolveCssVar('var(--color-ink-2)') },
        }
      : { show: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { type: 'dashed', opacity: 0.6 } },
      backgroundColor: resolveCssVar('var(--color-paper)'),
      borderColor: resolveCssVar('var(--color-rule)'),
      textStyle: { color: resolveCssVar('var(--color-ink)'), fontSize: 12 },
      extraCssText: 'box-shadow: 0 8px 28px -12px rgba(20,24,17,0.18); border-radius: 10px;',
    },
    xAxis: {
      type: xType,
      boundaryGap: series.some((s) => s.type === 'bar'),
      axisLine: { lineStyle: { color: resolveCssVar('var(--color-rule)') } },
      axisTick: { show: false },
      axisLabel: axisLabelStyle,
    },
    yAxis,
    series,
  }
}
```

Note: `boundaryGap` now keys off whether any series is a bar (combo-safe), replacing the old `spec.mark === 'bar'`.

- [ ] **Step 3: Update the call site to pass profile (stub for now)**

Find where `buildEChartsOption(spec, data)` is called (inside the `option` `useMemo`). Leave it as `buildEChartsOption(spec, data)` for now — the `profile` param is optional. (Task 4 wires the real profile.)

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep "ChartCanvas"`
Expected: only the PRE-EXISTING `boundaryGap` error at the old line may shift; confirm no NEW errors about `makeSeries`/`resolveAxisIndices`/`MeasureStyle`. If `yAxisIndex` typing complains on `SeriesOption`, it is valid ECharts — cast the return of `makeSeries` with `as echarts.SeriesOption` (already structured that way).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/charts/ChartCanvas.tsx
git commit -m "feat(charts): renderer supports multi-measure series, combo marks, dual axis"
```

---

### Task 4: Renderer — reference lines (value / average / profile / band)

**Files:**
- Modify: `frontend/src/components/charts/ChartCanvas.tsx`

- [ ] **Step 1: Add a reference-line builder helper**

Insert this helper above `buildEChartsOption`. It groups reference markers by axis (0=left, 1=right); the colors are applied where the marks are attached (Step 2).

```typescript
function buildReferenceMarks(
  spec: ChartSpec,
  profile?: { ftp?: number | null; lthr?: number | null },
): { line: Record<number, unknown[]>; area: Record<number, unknown[]> } {
  const line: Record<number, unknown[]> = { 0: [], 1: [] }
  const area: Record<number, unknown[]> = { 0: [], 1: [] }
  for (const ref of spec.reference_lines ?? []) {
    const ax = ref.axis === 'right' ? 1 : 0
    const name = ref.label ?? ''
    if (ref.kind === 'value' && typeof ref.value === 'number') {
      line[ax].push({ yAxis: ref.value, name })
    } else if (ref.kind === 'average') {
      line[ax].push({ type: 'average', name: name || 'avg' })
    } else if (ref.kind === 'profile') {
      const v = ref.source === 'lthr' ? profile?.lthr : profile?.ftp
      if (typeof v === 'number' && v > 0) line[ax].push({ yAxis: v, name: name || (ref.source ?? 'ftp').toUpperCase() })
    } else if (ref.kind === 'band' && typeof ref.value === 'number' && typeof ref.valueMax === 'number') {
      area[ax].push([{ yAxis: ref.value, name }, { yAxis: ref.valueMax }])
    }
  }
  return { line, area }
}
```

- [ ] **Step 2: Attach reference marks to the first series on each axis**

Inside `buildEChartsOption`, AFTER `series` is built and BEFORE the `return`, attach the marks to the first series on each axis:

```typescript
  const refs = buildReferenceMarks(spec, profile)
  const refLineColor = resolveCssVar('var(--color-ink-2)')
  const refBandColor = `${resolveCssVar('var(--color-good)')}22`
  for (const ax of [0, 1] as const) {
    const host = series.find((s) => (s.yAxisIndex ?? 0) === ax) ?? series[0]
    if (!host) continue
    if (refs.line[ax].length) {
      ;(host as { markLine?: unknown }).markLine = {
        symbol: 'none',
        lineStyle: { color: refLineColor, type: 'dashed', width: 1.5 },
        label: { color: refLineColor, fontSize: 10, formatter: '{b}' },
        data: refs.line[ax],
      }
    }
    if (refs.area[ax].length) {
      ;(host as { markArea?: unknown }).markArea = {
        itemStyle: { color: refBandColor },
        label: { color: refLineColor, fontSize: 10, position: 'insideTopLeft' },
        data: refs.area[ax],
      }
    }
  }
```

- [ ] **Step 3: Wire the athlete profile into ChartCanvas and pass it down**

Near the top of the `ChartCanvas` component body (after `useAnalyticsQuery`), fetch the profile (reuse the existing endpoint; do NOT add a new one):

```typescript
  const { data: profile } = useQuery({
    queryKey: ['athlete', 'me', 'chart-ref'],
    queryFn: async () => {
      const res = await apiClient.get('/athletes/me')
      return res.data as { ftp_watts?: number | null; lthr?: number | null }
    },
    staleTime: 5 * 60_000,
  })
```
Add imports at the top of the file if missing: `import { useQuery } from '@tanstack/react-query'` and `import { apiClient } from '../../api/client'`.

Then change the `option` memo to pass the profile (mapping `ftp_watts` → `ftp`):
```typescript
  const option = useMemo(() => {
    if (!data) return null
    return buildEChartsOption(spec, data, { ftp: profile?.ftp_watts ?? null, lthr: profile?.lthr ?? null })
  }, [data, spec, profile])
```

VERIFY the profile field name: open `backend/app/api/athletes.py` (or the `athletes/me` response schema) and confirm the FTP field key (e.g. `ftp_watts`). If it differs, map the real key. If no LTHR field exists, pass `lthr: null` (profile LTHR ref lines simply won't resolve — acceptable per spec).

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep "ChartCanvas"`
Expected: no NEW errors (pre-existing `boundaryGap` aside).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/charts/ChartCanvas.tsx
git commit -m "feat(charts): reference lines (value/average/profile/band) + dual-axis markers"
```

---

### Task 5: Builder — multi-metric rows + combo mark + axis toggle

**Files:**
- Modify: `frontend/src/components/charts/ChartBuilder.tsx`

Goal: let the user add up to 4 metrics, each with its own mark and L/R axis; disable the category "Split into series" control when >1 metric. Keep the single-metric default identical to today.

- [ ] **Step 1: Extend `BuilderState` with extra metrics**

Change the `BuilderState` interface to add an `extraMeasures` array (the first metric stays `yColumn`/`yAgg` for backward-compatible defaults):

```typescript
interface ExtraMeasure {
  column: string
  agg: Aggregation
  mark: MarkType | ''   // '' = inherit chart mark
  axis: '' | 'left' | 'right'  // '' = auto
}

interface BuilderState {
  dataset: DatasetId
  xColumn: string
  xGrain: TimeGrain | ''
  yColumn: string
  yAgg: Aggregation
  yMark: MarkType | ''        // first metric's mark override ('' = inherit)
  yAxis: '' | 'left' | 'right'
  extraMeasures: ExtraMeasure[]
  seriesColumn: string
  mark: MarkType
  title: string
  smooth: boolean
  stacked: boolean
}
```

Update `DEFAULT_STATE` to add: `yMark: '', yAxis: '', extraMeasures: [],`.

Add `MeasureStyle`/`ReferenceLine` to the type import:
```typescript
import type { Aggregation, ChartSpec, DatasetId, MarkType, MeasureStyle, ReferenceLine, TimeGrain } from '../../types/chartSpec'
```

- [ ] **Step 2: Rewrite `buildSpec` to emit measures + (passthrough) reference lines**

Replace `buildSpec` with:

```typescript
function aliasFor(column: string, agg: Aggregation): string {
  return `${agg}_${column === '*' ? 'count' : column}`
}

function buildSpec(s: BuilderState, referenceLines: ReferenceLine[]): ChartSpec {
  const xAlias = s.xColumn === 'started_at' || s.xColumn === 'date' ? 'date' : s.xColumn
  const multi = s.extraMeasures.length > 0

  const allMeasures = [
    { column: s.yColumn === '*' ? '*' : s.yColumn, aggregation: s.yAgg, alias: aliasFor(s.yColumn, s.yAgg) },
    ...s.extraMeasures.map((m) => ({
      column: m.column === '*' ? '*' : m.column,
      aggregation: m.agg,
      alias: aliasFor(m.column, m.agg),
    })),
  ]
  const yAlias = allMeasures[0].alias

  // Per-metric styling only when multi-metric OR the first metric has overrides.
  const measureStyles: MeasureStyle[] | undefined =
    multi || s.yMark !== '' || s.yAxis !== ''
      ? [
          { key: allMeasures[0].alias, label: pretty(s.yColumn), ...(s.yMark ? { mark: s.yMark } : {}), ...(s.yAxis ? { axis: s.yAxis } : {}) },
          ...s.extraMeasures.map((m) => ({
            key: aliasFor(m.column, m.agg),
            label: pretty(m.column),
            ...(m.mark ? { mark: m.mark } : {}),
            ...(m.axis ? { axis: m.axis } : {}),
          })),
        ]
      : undefined

  // Category split is mutually exclusive with multi-metric.
  const useSplit = !multi && s.seriesColumn !== ''

  return {
    title: s.title.trim() || (multi ? allMeasures.map((m) => pretty(m.column)).join(' & ') : `${pretty(s.yColumn)} by ${pretty(s.xColumn)}`),
    mark: s.mark,
    smooth: s.smooth,
    stacked: s.stacked && useSplit,
    query: {
      dataset: s.dataset,
      dimensions: [
        { column: s.xColumn, time_grain: s.xGrain || undefined, alias: xAlias },
        ...(useSplit ? [{ column: s.seriesColumn }] : []),
      ],
      measures: allMeasures,
      limit: 500,
      order_by: xAlias,
      order_dir: 'asc',
    },
    encoding: {
      x: xAlias,
      y: yAlias,
      series: useSplit ? s.seriesColumn : undefined,
      ...(measureStyles ? { measures: measureStyles } : {}),
    },
    ...(referenceLines.length ? { reference_lines: referenceLines } : {}),
  }
}
```

- [ ] **Step 3: Add reference-lines state + hydrate, and update the spec memo**

In the component, add state:
```typescript
  const [referenceLines, setReferenceLines] = useState<ReferenceLine[]>([])
```
Update the hydrate effect to also restore extras + reference lines from `initial`:
```typescript
    if (initial) {
      const dim0 = initial.query.dimensions[0]
      const dim1 = initial.query.dimensions[1]
      const ms = initial.encoding.measures ?? []
      const m0 = initial.query.measures[0]
      const styleFor = (alias: string) => ms.find((x) => x.key === alias)
      setState({
        dataset: initial.query.dataset,
        xColumn: dim0?.column ?? 'started_at',
        xGrain: (dim0?.time_grain as TimeGrain) ?? '',
        yColumn: m0?.column ?? 'tss',
        yAgg: m0?.aggregation ?? 'sum',
        yMark: (styleFor(m0 ? aliasFor(m0.column, m0.aggregation) : '')?.mark as MarkType) ?? '',
        yAxis: (styleFor(m0 ? aliasFor(m0.column, m0.aggregation) : '')?.axis as 'left' | 'right') ?? '',
        extraMeasures: initial.query.measures.slice(1).map((m) => ({
          column: m.column,
          agg: m.aggregation,
          mark: (styleFor(aliasFor(m.column, m.aggregation))?.mark as MarkType) ?? '',
          axis: (styleFor(aliasFor(m.column, m.aggregation))?.axis as 'left' | 'right') ?? '',
        })),
        seriesColumn: dim1?.column ?? '',
        mark: initial.mark,
        title: initial.title ?? '',
        smooth: initial.smooth ?? true,
        stacked: initial.stacked ?? false,
      })
      setReferenceLines(initial.reference_lines ?? [])
    } else {
      setState(DEFAULT_STATE)
      setReferenceLines([])
    }
```
Update the spec memo:
```typescript
  const spec = useMemo(() => buildSpec(state, referenceLines), [state, referenceLines])
```
And the footer save already calls `onSave(spec)` — unchanged.

- [ ] **Step 4: Render the multi-metric UI**

Replace the existing single `Field label="Y axis (measure)"` block with a metrics section that renders the primary metric plus extras and an "Add metric" button. Insert this in place of the current Y-axis `<Field>`:

```tsx
              <Field label="Metrics">
                <MetricRow
                  columnOptions={[{ value: '*', label: 'Count rows' }, ...numericCols.map((c) => ({ value: c.name, label: pretty(c.name) }))]}
                  column={state.yColumn}
                  agg={state.yAgg}
                  mark={state.yMark}
                  axis={state.yAxis}
                  showStyle={state.extraMeasures.length > 0}
                  onChange={(p) => setState({ ...state, yColumn: p.column ?? state.yColumn, yAgg: p.agg ?? state.yAgg, yMark: p.mark ?? state.yMark, yAxis: p.axis ?? state.yAxis })}
                />
                {state.extraMeasures.map((m, i) => (
                  <MetricRow
                    key={i}
                    columnOptions={[{ value: '*', label: 'Count rows' }, ...numericCols.map((c) => ({ value: c.name, label: pretty(c.name) }))]}
                    column={m.column}
                    agg={m.agg}
                    mark={m.mark}
                    axis={m.axis}
                    showStyle
                    onRemove={() => setState({ ...state, extraMeasures: state.extraMeasures.filter((_, j) => j !== i) })}
                    onChange={(p) => setState({
                      ...state,
                      extraMeasures: state.extraMeasures.map((x, j) => j === i ? { ...x, ...('column' in p ? { column: p.column! } : {}), ...('agg' in p ? { agg: p.agg! } : {}), ...('mark' in p ? { mark: p.mark! } : {}), ...('axis' in p ? { axis: p.axis! } : {}) } : x),
                    })}
                  />
                ))}
                {state.extraMeasures.length < 3 && (
                  <button
                    type="button"
                    onClick={() => setState({ ...state, extraMeasures: [...state.extraMeasures, { column: numericCols[0]?.name ?? 'tss', agg: 'avg', mark: '', axis: '' }] })}
                    className="mt-1 text-[12px] rounded-[10px] py-1.5"
                    style={{ color: 'var(--color-forest-2)', border: '1px dashed var(--color-rule)' }}
                  >
                    + Add metric
                  </button>
                )}
              </Field>
```

Add the `MetricRow` component near the other tiny inputs (after `Toggle`):

```tsx
function MetricRow({
  columnOptions, column, agg, mark, axis, showStyle, onChange, onRemove,
}: {
  columnOptions: { value: string; label: string }[]
  column: string
  agg: Aggregation
  mark: MarkType | ''
  axis: '' | 'left' | 'right'
  showStyle: boolean
  onChange: (p: Partial<{ column: string; agg: Aggregation; mark: MarkType | ''; axis: '' | 'left' | 'right' }>) => void
  onRemove?: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 mb-2 pb-2" style={{ borderBottom: showStyle ? '1px solid var(--color-rule)' : 'none' }}>
      <div className="flex gap-1.5">
        <select value={column} onChange={(e) => onChange({ column: e.target.value })}
          className="flex-1 rounded-[10px] px-2 py-2 text-[13px]"
          style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }}>
          {columnOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={agg} onChange={(e) => onChange({ agg: e.target.value as Aggregation })}
          className="rounded-[10px] px-2 py-2 text-[13px]"
          style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }}>
          {(column === '*' ? ['count'] : ['sum', 'avg', 'min', 'max', 'p50', 'p95']).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label="Remove metric"
            className="px-2 rounded-[10px] text-[13px]" style={{ color: 'var(--color-alert)', border: '1px solid var(--color-rule)' }}>×</button>
        )}
      </div>
      {showStyle && (
        <div className="flex gap-1.5">
          <select value={mark} onChange={(e) => onChange({ mark: e.target.value as MarkType | '' })}
            className="flex-1 rounded-[10px] px-2 py-1.5 text-[12px]"
            style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink-2)' }}>
            <option value="">mark: auto</option>
            <option value="line">line</option>
            <option value="area">area</option>
            <option value="bar">bar</option>
          </select>
          <select value={axis} onChange={(e) => onChange({ axis: e.target.value as '' | 'left' | 'right' })}
            className="rounded-[10px] px-2 py-1.5 text-[12px]"
            style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink-2)' }}>
            <option value="">axis: auto</option>
            <option value="left">left</option>
            <option value="right">right</option>
          </select>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Disable "Split into series" when multi-metric**

Change the "Split into series" `<Field>` to disable + explain when extras exist:
```tsx
              <Field label="Split into series (optional)">
                <Select
                  value={state.extraMeasures.length > 0 ? '' : state.seriesColumn}
                  onChange={(v) => setState({ ...state, seriesColumn: v })}
                  options={[
                    { value: '', label: state.extraMeasures.length > 0 ? 'Disabled — using multiple metrics' : 'None — single series' },
                    ...stringCols.map((c) => ({ value: c.name, label: pretty(c.name) })),
                  ]}
                />
              </Field>
```
(When `extraMeasures.length > 0`, `buildSpec` already ignores `seriesColumn` via `useSplit = !multi && …`, so this is purely a UI affordance.)

- [ ] **Step 6: Type-check + lint**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep "ChartBuilder"` → no NEW errors.
Run: `cd frontend && npx eslint src/components/charts/ChartBuilder.tsx` → clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/charts/ChartBuilder.tsx
git commit -m "feat(charts): builder multi-metric rows + combo mark + axis toggle"
```

---

### Task 6: Builder — reference-lines editor

**Files:**
- Modify: `frontend/src/components/charts/ChartBuilder.tsx`

- [ ] **Step 1: Add the reference-lines editor UI**

After the "Title" field (and before the toggles), insert a collapsible-style section that lists `referenceLines` and lets the user add/remove them:

```tsx
              <Field label="Reference lines (optional)">
                <div className="flex flex-col gap-2">
                  {referenceLines.map((r, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <select value={r.kind}
                        onChange={(e) => setReferenceLines(referenceLines.map((x, j) => j === i ? { ...x, kind: e.target.value as ReferenceLine['kind'] } : x))}
                        className="rounded-[10px] px-2 py-1.5 text-[12px]"
                        style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }}>
                        <option value="value">value</option>
                        <option value="average">average</option>
                        <option value="profile">FTP/zone</option>
                        <option value="band">band</option>
                      </select>
                      {r.kind === 'value' && (
                        <input type="number" value={r.value ?? ''} placeholder="value"
                          onChange={(e) => setReferenceLines(referenceLines.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))}
                          className="w-20 rounded-[10px] px-2 py-1.5 text-[12px]"
                          style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }} />
                      )}
                      {r.kind === 'band' && (
                        <>
                          <input type="number" value={r.value ?? ''} placeholder="min"
                            onChange={(e) => setReferenceLines(referenceLines.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))}
                            className="w-16 rounded-[10px] px-2 py-1.5 text-[12px]"
                            style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }} />
                          <input type="number" value={r.valueMax ?? ''} placeholder="max"
                            onChange={(e) => setReferenceLines(referenceLines.map((x, j) => j === i ? { ...x, valueMax: Number(e.target.value) } : x))}
                            className="w-16 rounded-[10px] px-2 py-1.5 text-[12px]"
                            style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }} />
                        </>
                      )}
                      {r.kind === 'profile' && (
                        <select value={r.source ?? 'ftp'}
                          onChange={(e) => setReferenceLines(referenceLines.map((x, j) => j === i ? { ...x, source: e.target.value as 'ftp' | 'lthr' } : x))}
                          className="rounded-[10px] px-2 py-1.5 text-[12px]"
                          style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }}>
                          <option value="ftp">FTP</option>
                          <option value="lthr">LTHR</option>
                        </select>
                      )}
                      <button type="button" aria-label="Remove reference line"
                        onClick={() => setReferenceLines(referenceLines.filter((_, j) => j !== i))}
                        className="ml-auto px-2 rounded-[10px] text-[13px]"
                        style={{ color: 'var(--color-alert)', border: '1px solid var(--color-rule)' }}>×</button>
                    </div>
                  ))}
                  {referenceLines.length < 6 && (
                    <button type="button"
                      onClick={() => setReferenceLines([...referenceLines, { kind: 'average' }])}
                      className="text-[12px] rounded-[10px] py-1.5"
                      style={{ color: 'var(--color-forest-2)', border: '1px dashed var(--color-rule)' }}>
                      + Add reference line
                    </button>
                  )}
                </div>
              </Field>
```

- [ ] **Step 2: Type-check + lint**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep "ChartBuilder"` → no NEW errors.
Run: `cd frontend && npx eslint src/components/charts/ChartBuilder.tsx` → clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/charts/ChartBuilder.tsx
git commit -m "feat(charts): builder reference-lines editor"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1:** Ensure backend (`:8000`, `--reload`) + frontend (`:5173`) + DB are running.
- [ ] **Step 2:** On `/dashboards`, open a dashboard → Edit → "Add chart". Build a **multi-metric dual-axis combo**: metric 1 = TSS (sum, bar), metric 2 = Average HR (avg, line, axis auto). Confirm the live preview shows **bars + a line on a second (right) axis**, with a legend. Add a **reference line**: kind = FTP/zone (profile) — confirm a dashed line appears if the profile has an FTP; and a **band** (e.g. value 120, max 150) — confirm a shaded area. Add to dashboard → Save → reload → the chart persists and still renders. **Look at the screenshot.**
- [ ] **Step 3:** Confirm **backward compatibility**: the existing preset charts ("Weekly TSS by sport", "Distance, last 90 days") still render exactly as before (single metric / category split).
- [ ] **Step 4:** Confirm the builder guardrails: with 2+ metrics, "Split into series" shows "Disabled — using multiple metrics"; "+ Add metric" stops at 4 total.
- [ ] **Step 5:** Run full backend suite: `cd backend && uv run pytest -q` → all pass.

---

## Self-Review

**Spec coverage:**
- Multiple measures per chart → Tasks 1,2 (schema), 3 (renderer multi-measure), 5 (builder). ✓
- Dual Y-axis (auto + manual) → Task 3 (`resolveAxisIndices` auto ≥5×; explicit axis honored), 5 (per-metric L/R toggle). ✓
- Combo (per-metric mark) → Task 3 (`makeSeries` per measure mark), 5 (per-metric mark picker). ✓
- Reference lines (value/average/profile/band) → Tasks 1,2 (schema), 4 (renderer markLine/markArea + profile via athletes/me), 6 (editor). ✓
- Multi-metric vs category split mutually exclusive → Task 5 (`useSplit = !multi`, UI disable). ✓
- 4-metric cap → Task 1 (`max_length=4`), 5 (Add stops at 3 extras = 4 total). ✓
- Backward compatibility → Task 3 (legacy `pivot` path when no `encoding.measures`), Task 1 (`test_legacy_spec_…`), Task 7 step 3. ✓
- Testing → Task 1 (backend validation), Task 7 (live drive; no FE runner exists). ✓

**Placeholder scan:** Task 4 Step 1 deliberately contains a wrong draft with an explicit "DELETE the `&&` line / use Step 2's clean version" instruction; Step 2 supplies the correct, complete helper. No TODO/TBD elsewhere; every code step is complete. (Implementer: use Task 4 Step 2's `buildReferenceMarks` verbatim and ignore the Step-1 draft.)

**Type consistency:** `MeasureStyle { key,label?,mark?,axis? }` and `ReferenceLine { kind,label?,value?,valueMax?,axis?,source? }` are identical across backend Pydantic (Task 1) and frontend TS (Task 2). `encoding.measures` + `reference_lines` (snake_case) used consistently in renderer (Tasks 3–4), builder `buildSpec` (Task 5), and editor (Task 6). `aliasFor(column, agg)` defined once in Task 5 and reused in the hydrate effect. Renderer reads `r[m.key]` where `m.key` equals the measure alias `buildSpec` emits (`aliasFor`), so encoding keys match query result columns. `resolveAxisIndices`/`makeSeries`/`seriesMaxAbs`/`buildReferenceMarks` are all defined in Tasks 3–4 before use.

**Executor notes:**
- Task 3 Step 3 / Task 4 Step 3: verify the real FTP field name on `athletes/me` (`ftp_watts` assumed) and that `apiClient` import path is `../../api/client` (confirmed used elsewhere).
- The pre-existing `boundaryGap` tsc error in ChartCanvas is unrelated; Task 3 changes that line's expression but not its type — if it newly errors, leave the pre-existing behavior (boolean boundaryGap is valid at runtime; it's a known ECharts typing quirk).
