# Rich Chart Model (Sub-project A) — Design Spec

**Date:** 2026-06-04
**Status:** Approved for planning
**Part of:** "More complex graphs + easier for non-experts" (decomposed into A: rich chart model, B: approachability & AI guidance). This spec is **A only**; B is a later cycle that builds on A.

## Goal

Let a dashboard chart plot **multiple metrics together**, with **dual Y-axis**, **combo mark types** (bars + line), and **reference/threshold lines** — while keeping the builder simple for non-experts via progressive disclosure. Fully backward-compatible with existing saved charts.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| Capabilities | Multiple measures per chart; dual Y-axis; combo (per-measure mark); reference lines. |
| Reference line kinds | All four: static value, computed average/baseline, profile threshold (FTP/zones), target band (min–max). |
| Dual-axis behaviour | Auto-assign 2nd axis when scales differ a lot; manual `[L|R]` override per metric. |
| Multi-metric vs category split | **Mutually exclusive** in v1 (a chart is either "one metric split by a category" OR "several metrics") — keeps charts legible. |
| Metric cap | **4** metrics per chart. |

## Architecture

The analytics query engine (`execute_query`) **already returns multiple measures** (it iterates `spec.query.measures`), so no query-compiler change is needed. This work is **spec model + renderer + builder**.

### 1. Spec model (additive, backward-compatible)

`ChartSpec.encoding` keeps its current shape (`{ x, y, series? }`) so existing saved charts render unchanged. Two optional fields are added to `ChartSpec`:

**`encoding.measures?: MeasureStyle[]`** — when present (length ≥ 1) it DRIVES multi-metric rendering; when absent, the renderer falls back to today's `{ y, series }` behaviour.
```
MeasureStyle {
  key: string                  // a measure alias present in query.measures (e.g. "sum_tss")
  label?: string               // friendly legend/axis label; defaults to a prettified key
  mark?: 'line' | 'area' | 'bar'   // per-metric mark (combo); defaults to ChartSpec.mark
  axis?: 'left' | 'right'      // omitted → auto-assigned by the renderer
}
```

**`referenceLines?: ReferenceLine[]`**
```
ReferenceLine {
  kind: 'value' | 'average' | 'profile' | 'band'
  label?: string
  value?: number               // for 'value' and band lower bound
  valueMax?: number            // for 'band' upper bound
  axis?: 'left' | 'right'      // which axis it attaches to (default left)
  source?: 'ftp' | 'lthr'      // for 'profile' kind
}
```

The same optional fields are mirrored on the **backend** `ChartSpec` Pydantic model (`app/schemas/user_dashboard.py`) so save/validation accept them. `MarkType`/axis values are constrained by `Literal` types.

### 2. Renderer — `ChartCanvas` / `buildEChartsOption`

- **Series source precedence**: `encoding.measures?.length` → one ECharts series per measure (value = `row[measure.key]`), each with `mark = measure.mark ?? spec.mark`; else if `encoding.series` set → category split (existing pivot); else single series.
- **Dual axis**: construct a second `yAxis` when any rendered measure resolves to `axis: 'right'`. Series get `yAxisIndex` 0/1 accordingly. **Auto-assignment** (only when `axis` unset and exactly 2 measures): compute each measure's max abs value; if `max(a)/max(b) ≥ 5` (or ≤ 1/5), put the smaller-magnitude measure on the right. With 3–4 measures and no explicit axes, all default left (avoids unreadable multi-axis).
- **Reference lines** → ECharts `series`-level `markLine`/`markArea` (attached to a lightweight invisible series or the first series on the target axis):
  - `value` → horizontal `markLine` at `value`.
  - `average` → `markLine` with `type: 'average'` over the target measure's data (ECharts computes it), or a precomputed mean.
  - `profile` → resolve `value` from the athlete profile (FTP / LTHR) fetched via the existing `athletes/me` data; attach only when the target axis carries a power/HR metric; omit silently if the profile value is missing.
  - `band` → shaded `markArea` between `value` and `valueMax`.
- Legend shown when >1 series. Palette per series (existing `DEFAULT_PALETTE`, resolved via `resolveCssVar`). ECharts renders mixed bar+line natively.
- Builds on the existing fill-height fix (charts size to their cell).

### 3. Builder — `ChartBuilder` (progressive disclosure)

- Default view unchanged (one metric → single chart), preserving today's simplicity.
- **"+ Add metric"** reveals a compact per-metric row: measure column + aggregation + a small mark picker (line/area/bar) + an `[L|R]` axis toggle (defaults to "auto"). Up to **4** metrics.
- When **>1 metric**, the existing category **"Split into series"** control is disabled (mutually exclusive), with a one-line hint explaining why.
- A collapsible **"Reference lines"** section: "+ Add line" → pick kind → contextual inputs (number for `value`; min+max for `band`; nothing for `average`; a source dropdown for `profile`).
- `buildSpec(state)` emits `encoding.measures` (when >1 metric or any per-metric styling set) and `referenceLines`; for the single-metric/no-styling case it emits today's shape (so nothing regresses).
- The live `<ChartCanvas>` preview reflects all of the above (it already powers the preview).

## Error handling & edge cases

- **Legacy specs** (no `encoding.measures`, no `referenceLines`): render exactly as before.
- **Missing measure alias** in results → that series is skipped, no crash.
- **`profile` ref line** with no matching profile value → omitted silently.
- **Auto dual-axis** only at exactly 2 metrics; otherwise all-left unless overridden.
- **>4 metrics**: builder prevents adding; backend caps/validates the array length.
- **Mixed types on one axis** (e.g. a count and a percentage) is allowed but the user chose it — no auto-prevention beyond the dual-axis heuristic.

## Testing strategy

- **Backend**: `ChartSpec` accepts the new optional fields and validates them (good `MeasureStyle`/`ReferenceLine` pass; bad `axis`/`kind`/`mark` enum values rejected; `measures` length capped). Saving a dashboard with the new fields round-trips.
- **Frontend**: type-check + lint. Pure-function checks on `buildEChartsOption` where feasible (multi-measure → N series; a right-axis measure → 2 `yAxis`; a `band` → a `markArea`; legacy spec → unchanged single series). Manual live drive: build "TSS (bars) + HRV (line), dual-axis, with an FTP reference line", confirm it renders correctly and an existing single-metric chart is unaffected.

## Out of scope (this sub-project)

- AI auto-picking/auto-improving charts, plain-language captions, suggested-chart gallery, friendlier jargon labels/formatting — **all Sub-project B**.
- Combining a category split AND multiple measures in one chart.
- More than 4 metrics, stacked multi-axis (>2 axes), or per-point annotations.
- Query-engine changes (multi-measure already supported).

## Non-obvious integration notes

- Keep `encoding.{x,y,series}` as the legacy/primary path; `encoding.measures` is the additive richer path. Renderer precedence is `measures` → `series` → single. This is what guarantees backward compatibility.
- The frontend `types/chartSpec.ChartSpec` and backend `app/schemas/user_dashboard.ChartSpec` must add the SAME optional fields (they are the save/validation contract and, later, the interpret response model that B will populate).
- Reference `profile` resolution reuses the already-fetched `athletes/me` profile on the client; do not add a new endpoint.
- The dual-axis auto-heuristic lives in the renderer (pure, testable), not the builder, so AI-generated specs (Sub-project B) benefit from it without re-implementing.
