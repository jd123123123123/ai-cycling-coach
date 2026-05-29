import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Sparkles } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchDatasets, type DatasetIntrospection } from '../../api/analytics'
import ChartCanvas from './ChartCanvas'
import type {
  Aggregation,
  ChartSpec,
  DatasetId,
  MarkType,
  TimeGrain,
} from '../../types/chartSpec'

/**
 * ChartBuilder — wizard modal for assembling a ChartSpec from scratch.
 *
 * Flow: pick dataset → pick X (dimension, optional time grain) → pick Y
 * (column + aggregation) → optional series split → pick mark type →
 * preview live → save.
 *
 * The preview uses the same `<ChartCanvas>` the dashboard uses, so what
 * you see while building is exactly what you get after saving.
 */

const NUM_AGGS: Aggregation[] = ['sum', 'avg', 'min', 'max', 'p50', 'p95']
const TIME_GRAINS: TimeGrain[] = ['day', 'week', 'month', 'year']
const MARKS: { id: MarkType; label: string; emoji: string }[] = [
  { id: 'line', label: 'Line', emoji: '➰' },
  { id: 'area', label: 'Area', emoji: '🏔' },
  { id: 'bar', label: 'Bar', emoji: '▮' },
  { id: 'scatter', label: 'Scatter', emoji: '⊹' },
]

const FRIENDLY_LABEL: Record<string, string> = {
  started_at: 'Date',
  date: 'Date',
  sport: 'Sport',
  duration_seconds: 'Duration (s)',
  distance_meters: 'Distance (m)',
  tss: 'TSS',
  normalized_power: 'Normalised power',
  average_power: 'Average power',
  average_hr: 'Average HR',
  max_hr: 'Max HR',
  calories: 'Calories',
  source: 'Source',
  sleep_score: 'Sleep score',
  hrv_status: 'HRV',
  body_battery: 'Body battery',
  resting_hr: 'Resting HR',
  stress_level: 'Stress',
  steps: 'Steps',
  weight_kg: 'Weight (kg)',
}

function pretty(col: string): string {
  return FRIENDLY_LABEL[col] ?? col.replace(/_/g, ' ')
}

interface ChartBuilderProps {
  open: boolean
  onClose: () => void
  onSave: (spec: ChartSpec) => void
  /** When set, the wizard opens with this spec preloaded (edit flow). */
  initial?: ChartSpec | null
}

interface BuilderState {
  dataset: DatasetId
  xColumn: string
  xGrain: TimeGrain | ''
  yColumn: string
  yAgg: Aggregation
  seriesColumn: string // '' = none
  mark: MarkType
  title: string
  smooth: boolean
  stacked: boolean
}

const DEFAULT_STATE: BuilderState = {
  dataset: 'activities',
  xColumn: 'started_at',
  xGrain: 'week',
  yColumn: 'tss',
  yAgg: 'sum',
  seriesColumn: 'sport',
  mark: 'bar',
  title: '',
  smooth: true,
  stacked: true,
}

function buildSpec(s: BuilderState): ChartSpec {
  const xAlias = s.xColumn === 'started_at' || s.xColumn === 'date' ? 'date' : s.xColumn
  const yAlias = `${s.yAgg}_${s.yColumn === '*' ? 'count' : s.yColumn}`
  return {
    title: s.title.trim() || `${pretty(s.yColumn)} by ${pretty(s.xColumn)}`,
    mark: s.mark,
    smooth: s.smooth,
    stacked: s.stacked && s.seriesColumn !== '',
    query: {
      dataset: s.dataset,
      dimensions: [
        {
          column: s.xColumn,
          time_grain: s.xGrain || undefined,
          alias: xAlias,
        },
        ...(s.seriesColumn ? [{ column: s.seriesColumn }] : []),
      ],
      measures: [
        {
          column: s.yColumn === '*' ? '*' : s.yColumn,
          aggregation: s.yAgg,
          alias: yAlias,
        },
      ],
      limit: 500,
      order_by: xAlias,
      order_dir: 'asc',
    },
    encoding: {
      x: xAlias,
      y: yAlias,
      series: s.seriesColumn || undefined,
    },
  }
}

export default function ChartBuilder({ open, onClose, onSave, initial }: ChartBuilderProps) {
  const { data: datasets } = useQuery<DatasetIntrospection>({
    queryKey: ['analytics', 'datasets'],
    queryFn: fetchDatasets,
    staleTime: Infinity,
  })

  const [state, setState] = useState<BuilderState>(DEFAULT_STATE)

  // Hydrate from `initial` when editing.
  useEffect(() => {
    if (!open) return
    if (initial) {
      const dim0 = initial.query.dimensions[0]
      const dim1 = initial.query.dimensions[1]
      const m0 = initial.query.measures[0]
      setState({
        dataset: initial.query.dataset,
        xColumn: dim0?.column ?? 'started_at',
        xGrain: (dim0?.time_grain as TimeGrain) ?? '',
        yColumn: m0?.column ?? 'tss',
        yAgg: m0?.aggregation ?? 'sum',
        seriesColumn: dim1?.column ?? '',
        mark: initial.mark,
        title: initial.title ?? '',
        smooth: initial.smooth ?? true,
        stacked: initial.stacked ?? false,
      })
    } else {
      setState(DEFAULT_STATE)
    }
  }, [open, initial])

  const datasetMeta = datasets?.datasets[state.dataset]
  const numericCols = useMemo(
    () =>
      datasetMeta?.columns.filter((c) => c.type === 'number' && !['id'].includes(c.name)) ?? [],
    [datasetMeta],
  )
  const allCols = datasetMeta?.columns ?? []
  const dateCols = allCols.filter((c) => c.type === 'date')
  const stringCols = allCols.filter((c) => c.type === 'string')

  // Live spec for preview.
  const spec = useMemo(() => buildSpec(state), [state])

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-stretch justify-center"
        style={{ backgroundColor: 'rgba(20,24,17,0.45)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative my-auto mx-3 sm:mx-6 w-full max-w-[1080px] rounded-[20px] overflow-hidden"
          style={{
            backgroundColor: 'var(--color-paper)',
            border: '1px solid var(--color-rule)',
            boxShadow: '0 32px 80px -32px rgba(20,24,17,0.35)',
            maxHeight: 'calc(100vh - 32px)',
          }}
        >
          {/* Header */}
          <header
            className="flex items-center justify-between px-5 sm:px-7 py-4"
            style={{ borderBottom: '1px solid var(--color-rule)' }}
          >
            <div className="flex items-center gap-3">
              <Sparkles size={16} strokeWidth={2} style={{ color: 'var(--color-amber)' }} />
              <span
                className="eyebrow"
                style={{ color: 'var(--color-ink)', letterSpacing: '0.28em', fontSize: 11, fontWeight: 600 }}
              >
                {initial ? 'Edit chart' : 'New chart'}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full w-8 h-8 inline-flex items-center justify-center"
              style={{ color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)' }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </header>

          {/* Body — split into Builder shelf + live Preview */}
          <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] overflow-y-auto" style={{ maxHeight: 'calc(100vh - 156px)' }}>
            {/* Shelf */}
            <aside
              className="flex flex-col gap-4 p-5"
              style={{ borderRight: '1px solid var(--color-rule)', backgroundColor: 'var(--color-paper-2)' }}
            >
              <Field label="Dataset">
                <Select
                  value={state.dataset}
                  onChange={(v) => setState({ ...state, dataset: v as DatasetId })}
                  options={[
                    { value: 'activities', label: 'Activities' },
                    { value: 'daily_metrics', label: 'Daily metrics' },
                  ]}
                />
              </Field>

              <Field label="X axis (group by)">
                <Select
                  value={state.xColumn}
                  onChange={(v) => setState({ ...state, xColumn: v })}
                  options={allCols.map((c) => ({ value: c.name, label: pretty(c.name) }))}
                />
                {dateCols.some((c) => c.name === state.xColumn) && (
                  <Select
                    className="mt-2"
                    value={state.xGrain}
                    onChange={(v) => setState({ ...state, xGrain: v as TimeGrain })}
                    options={[
                      { value: '', label: 'No bucket' },
                      ...TIME_GRAINS.map((g) => ({ value: g, label: g })),
                    ]}
                  />
                )}
              </Field>

              <Field label="Y axis (measure)">
                <Select
                  value={state.yColumn}
                  onChange={(v) => setState({ ...state, yColumn: v })}
                  options={[
                    { value: '*', label: 'Count rows' },
                    ...numericCols.map((c) => ({ value: c.name, label: pretty(c.name) })),
                  ]}
                />
                <Select
                  className="mt-2"
                  value={state.yAgg}
                  onChange={(v) => setState({ ...state, yAgg: v as Aggregation })}
                  options={
                    state.yColumn === '*'
                      ? [{ value: 'count', label: 'count' }]
                      : NUM_AGGS.map((a) => ({ value: a, label: a }))
                  }
                />
              </Field>

              <Field label="Split into series (optional)">
                <Select
                  value={state.seriesColumn}
                  onChange={(v) => setState({ ...state, seriesColumn: v })}
                  options={[
                    { value: '', label: 'None — single series' },
                    ...stringCols.map((c) => ({ value: c.name, label: pretty(c.name) })),
                  ]}
                />
              </Field>

              <Field label="Chart type">
                <div className="grid grid-cols-2 gap-2">
                  {MARKS.map((m) => {
                    const active = state.mark === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setState({ ...state, mark: m.id })}
                        className="flex items-center justify-center gap-2 py-2 rounded-[10px] text-[12px]"
                        style={{
                          color: active ? 'var(--color-paper)' : 'var(--color-ink-2)',
                          backgroundColor: active ? 'var(--color-ink)' : 'var(--color-paper)',
                          border: `1px solid ${active ? 'var(--color-ink)' : 'var(--color-rule)'}`,
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        <span aria-hidden>{m.emoji}</span>
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <Field label="Title">
                <input
                  type="text"
                  value={state.title}
                  onChange={(e) => setState({ ...state, title: e.target.value })}
                  placeholder="Auto from selection"
                  className="w-full rounded-[10px] px-3 py-2 text-[13px]"
                  style={{
                    backgroundColor: 'var(--color-paper)',
                    border: '1px solid var(--color-rule)',
                    color: 'var(--color-ink)',
                  }}
                />
              </Field>

              <div className="flex flex-col gap-2">
                {(state.mark === 'line' || state.mark === 'area') && (
                  <Toggle
                    label="Smooth curve"
                    value={state.smooth}
                    onChange={(v) => setState({ ...state, smooth: v })}
                  />
                )}
                {state.seriesColumn !== '' && (
                  <Toggle
                    label="Stack series"
                    value={state.stacked}
                    onChange={(v) => setState({ ...state, stacked: v })}
                  />
                )}
              </div>
            </aside>

            {/* Preview */}
            <section className="p-5 sm:p-6 flex flex-col gap-3 min-w-0">
              <span
                className="eyebrow"
                style={{ color: 'var(--color-muted)', letterSpacing: '0.28em', fontSize: 10 }}
              >
                Live preview
              </span>
              <div
                className="rounded-[14px] p-4"
                style={{
                  backgroundColor: 'var(--color-paper-2)',
                  border: '1px solid var(--color-rule)',
                  minHeight: 320,
                }}
              >
                <ChartCanvas spec={spec} height={320} />
              </div>
            </section>
          </div>

          {/* Footer */}
          <footer
            className="flex items-center justify-between gap-3 px-5 sm:px-7 py-4"
            style={{ borderTop: '1px solid var(--color-rule)', backgroundColor: 'var(--color-paper-2)' }}
          >
            <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              Charts query your own data; nothing is shared.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full text-[13px]"
                style={{
                  color: 'var(--color-ink-2)',
                  border: '1px solid var(--color-rule)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onSave(spec)}
                className="px-4 py-2 rounded-full text-[13px] font-medium"
                style={{
                  color: 'var(--color-paper)',
                  backgroundColor: 'var(--color-ink)',
                }}
              >
                {initial ? 'Update chart' : 'Add to dashboard'}
              </button>
            </div>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Tiny inputs ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="eyebrow"
        style={{ color: 'var(--color-ink-2)', letterSpacing: '0.22em', fontSize: 9.5, fontWeight: 600 }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

function Select({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-[10px] px-3 py-2 text-[13px] ${className}`}
      style={{
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
        color: 'var(--color-ink)',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className="inline-flex items-center rounded-full transition-colors"
        style={{
          width: 32,
          height: 18,
          backgroundColor: value ? 'var(--color-forest-2)' : 'var(--color-rule)',
          padding: 2,
        }}
      >
        <span
          className="rounded-full transition-transform"
          style={{
            width: 14,
            height: 14,
            backgroundColor: 'var(--color-paper)',
            transform: value ? 'translateX(14px)' : 'translateX(0)',
          }}
        />
      </span>
      <span className="text-[12px]" style={{ color: 'var(--color-ink)' }}>
        {label}
      </span>
    </label>
  )
}
