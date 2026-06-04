/**
 * ChartSpec — declarative chart description, the lingua franca of the
 * customizable dashboard.
 *
 * Two halves:
 *   · `query`   — what data to fetch (mirrors backend QuerySpec)
 *   · `mark` +  — how to draw it
 *     `encoding`
 *
 * Saved to disk as JSON; AI can generate it; renderer compiles it to
 * ECharts options. Designed to compose: more chart types are added by
 * extending the union, not by branching the canvas.
 */

export type DatasetId = 'activities' | 'daily_metrics'
export type Aggregation = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'p50' | 'p95'
export type TimeGrain = 'day' | 'week' | 'month' | 'year'
export type FilterOp = 'eq' | 'ne' | 'in' | 'gt' | 'gte' | 'lt' | 'lte'

export interface QueryDimension {
  column: string
  time_grain?: TimeGrain
  alias?: string
}

export interface QueryMeasure {
  column: string
  aggregation: Aggregation
  alias?: string
}

export interface QueryFilter {
  column: string
  op: FilterOp
  value: string | number | boolean | Array<string | number> | null
}

export interface QuerySpec {
  dataset: DatasetId
  dimensions: QueryDimension[]
  measures: QueryMeasure[]
  filters?: QueryFilter[]
  start_date?: string // yyyy-mm-dd
  end_date?: string
  limit?: number
  order_by?: string
  order_dir?: 'asc' | 'desc'
}

// ─── Visual side ───────────────────────────────────────────────────────────

export type MarkType = 'line' | 'area' | 'bar' | 'scatter'

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

export interface ChartEncoding {
  /** Column alias from the query result that drives the X axis. */
  x: string
  /** Column alias for the Y axis (the measure). */
  y: string
  /** Optional series-splitting dimension alias (e.g. 'sport'). */
  series?: string
  measures?: MeasureStyle[]
}

export interface ChartSpec {
  id?: string // assigned when saved
  title?: string
  subtitle?: string
  mark: MarkType
  query: QuerySpec
  encoding: ChartEncoding
  /** Override the default ECharts theme color for the primary series. */
  accent?: string
  /** Show a smoothed line / area instead of straight segments. */
  smooth?: boolean
  /** Stack series (only meaningful when `series` is set). */
  stacked?: boolean
  reference_lines?: ReferenceLine[]
}

// ─── Query result mirror ───────────────────────────────────────────────────

export interface QueryColumn {
  name: string
  kind: 'dimension' | 'measure'
  type: 'number' | 'string' | 'date' | 'boolean'
}

export interface QueryResult {
  columns: QueryColumn[]
  rows: Array<Record<string, string | number | boolean | null>>
  row_count: number
  truncated: boolean
}
