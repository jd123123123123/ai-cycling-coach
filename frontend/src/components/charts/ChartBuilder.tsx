import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Sparkles } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchDatasets, type DatasetIntrospection } from '../../api/analytics'
import ChartCanvas from './ChartCanvas'
import { useLocale } from '../../contexts/LocaleContext'
import type { Locale } from '../../i18n/strings'
import type {
  Aggregation,
  ChartSpec,
  DatasetId,
  MarkType,
  MeasureStyle,
  ReferenceLine,
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
const MARKS: { id: MarkType; label: string; labelDe: string; emoji: string }[] = [
  { id: 'line', label: 'Line', labelDe: 'Linie', emoji: '➰' },
  { id: 'area', label: 'Area', labelDe: 'Fläche', emoji: '🏔' },
  { id: 'bar', label: 'Bar', labelDe: 'Balken', emoji: '▮' },
  { id: 'scatter', label: 'Scatter', labelDe: 'Streuung', emoji: '⊹' },
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

const FRIENDLY_LABEL_DE: Record<string, string> = {
  started_at: 'Datum',
  date: 'Datum',
  sport: 'Sportart',
  duration_seconds: 'Dauer (s)',
  distance_meters: 'Distanz (m)',
  tss: 'TSS',
  normalized_power: 'Normalisierte Leistung',
  average_power: 'Durchschnittsleistung',
  average_hr: 'Durchschnitts-HR',
  max_hr: 'Max-HR',
  calories: 'Kalorien',
  source: 'Quelle',
  sleep_score: 'Schlafwert',
  hrv_status: 'HRV',
  body_battery: 'Body Battery',
  resting_hr: 'Ruhe-HR',
  stress_level: 'Stress',
  steps: 'Schritte',
  weight_kg: 'Gewicht (kg)',
}

function pretty(col: string, locale: Locale = 'en'): string {
  const map = locale === 'de' ? FRIENDLY_LABEL_DE : FRIENDLY_LABEL
  return map[col] ?? FRIENDLY_LABEL[col] ?? col.replace(/_/g, ' ')
}

const GRAIN_LABEL_DE: Record<TimeGrain, string> = {
  day: 'Tag',
  week: 'Woche',
  month: 'Monat',
  year: 'Jahr',
}

function grainLabel(g: TimeGrain, locale: Locale): string {
  return locale === 'de' ? GRAIN_LABEL_DE[g] : g
}

interface ChartBuilderProps {
  open: boolean
  onClose: () => void
  onSave: (spec: ChartSpec) => void
  /** When set, the wizard opens with this spec preloaded (edit flow). */
  initial?: ChartSpec | null
}

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

const DEFAULT_STATE: BuilderState = {
  dataset: 'activities',
  xColumn: 'started_at',
  xGrain: 'week',
  yColumn: 'tss',
  yAgg: 'sum',
  yMark: '',
  yAxis: '',
  extraMeasures: [],
  seriesColumn: 'sport',
  mark: 'bar',
  title: '',
  smooth: true,
  stacked: true,
}

function aliasFor(column: string, agg: Aggregation): string {
  return `${agg}_${column === '*' ? 'count' : column}`
}

function buildSpec(s: BuilderState, referenceLines: ReferenceLine[], locale: Locale): ChartSpec {
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
          { key: allMeasures[0].alias, label: pretty(s.yColumn, locale), ...(s.yMark ? { mark: s.yMark } : {}), ...(s.yAxis ? { axis: s.yAxis } : {}) },
          ...s.extraMeasures.map((m) => ({
            key: aliasFor(m.column, m.agg),
            label: pretty(m.column, locale),
            ...(m.mark ? { mark: m.mark } : {}),
            ...(m.axis ? { axis: m.axis } : {}),
          })),
        ]
      : undefined

  // Category split is mutually exclusive with multi-metric.
  const useSplit = !multi && s.seriesColumn !== ''

  return {
    title: s.title.trim() || (multi
      ? allMeasures.map((m) => pretty(m.column, locale)).join(' & ')
      : locale === 'de'
        ? `${pretty(s.yColumn, locale)} nach ${pretty(s.xColumn, locale)}`
        : `${pretty(s.yColumn, locale)} by ${pretty(s.xColumn, locale)}`),
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

export default function ChartBuilder({ open, onClose, onSave, initial }: ChartBuilderProps) {
  const { locale } = useLocale()
  const { data: datasets } = useQuery<DatasetIntrospection>({
    queryKey: ['analytics', 'datasets'],
    queryFn: fetchDatasets,
    staleTime: Infinity,
  })

  const [state, setState] = useState<BuilderState>(DEFAULT_STATE)
  const [referenceLines, setReferenceLines] = useState<ReferenceLine[]>([])

  // Hydrate from `initial` when editing.
  useEffect(() => {
    if (!open) return
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
  const spec = useMemo(() => buildSpec(state, referenceLines, locale), [state, referenceLines, locale])

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
                {initial
                  ? locale === 'de' ? 'Diagramm bearbeiten' : 'Edit chart'
                  : locale === 'de' ? 'Neues Diagramm' : 'New chart'}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={locale === 'de' ? 'Schließen' : 'Close'}
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
              <Field label={locale === 'de' ? 'Datensatz' : 'Dataset'}>
                <Select
                  value={state.dataset}
                  onChange={(v) => setState({ ...state, dataset: v as DatasetId })}
                  options={[
                    { value: 'activities', label: locale === 'de' ? 'Aktivitäten' : 'Activities' },
                    { value: 'daily_metrics', label: locale === 'de' ? 'Tageswerte' : 'Daily metrics' },
                  ]}
                />
              </Field>

              <Field label={locale === 'de' ? 'X-Achse (gruppieren nach)' : 'X axis (group by)'}>
                <Select
                  value={state.xColumn}
                  onChange={(v) => setState({ ...state, xColumn: v })}
                  options={allCols.map((c) => ({ value: c.name, label: pretty(c.name, locale) }))}
                />
                {dateCols.some((c) => c.name === state.xColumn) && (
                  <Select
                    className="mt-2"
                    value={state.xGrain}
                    onChange={(v) => setState({ ...state, xGrain: v as TimeGrain })}
                    options={[
                      { value: '', label: locale === 'de' ? 'Kein Intervall' : 'No bucket' },
                      ...TIME_GRAINS.map((g) => ({ value: g, label: grainLabel(g, locale) })),
                    ]}
                  />
                )}
              </Field>

              <Field label={locale === 'de' ? 'Metriken' : 'Metrics'}>
                <MetricRow
                  locale={locale}
                  columnOptions={[{ value: '*', label: locale === 'de' ? 'Zeilen zählen' : 'Count rows' }, ...numericCols.map((c) => ({ value: c.name, label: pretty(c.name, locale) }))]}
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
                    locale={locale}
                    columnOptions={[{ value: '*', label: locale === 'de' ? 'Zeilen zählen' : 'Count rows' }, ...numericCols.map((c) => ({ value: c.name, label: pretty(c.name, locale) }))]}
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
                    {locale === 'de' ? '+ Metrik hinzufügen' : '+ Add metric'}
                  </button>
                )}
              </Field>

              <Field label={locale === 'de' ? 'In Serien aufteilen (optional)' : 'Split into series (optional)'}>
                <Select
                  value={state.extraMeasures.length > 0 ? '' : state.seriesColumn}
                  onChange={(v) => setState({ ...state, seriesColumn: v })}
                  options={[
                    {
                      value: '',
                      label:
                        state.extraMeasures.length > 0
                          ? locale === 'de' ? 'Deaktiviert — mehrere Metriken aktiv' : 'Disabled — using multiple metrics'
                          : locale === 'de' ? 'Keine — einzelne Serie' : 'None — single series',
                    },
                    ...stringCols.map((c) => ({ value: c.name, label: pretty(c.name, locale) })),
                  ]}
                />
              </Field>

              <Field label={locale === 'de' ? 'Diagrammtyp' : 'Chart type'}>
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
                        {locale === 'de' ? m.labelDe : m.label}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <Field label={locale === 'de' ? 'Titel' : 'Title'}>
                <input
                  type="text"
                  value={state.title}
                  onChange={(e) => setState({ ...state, title: e.target.value })}
                  placeholder={locale === 'de' ? 'Automatisch aus Auswahl' : 'Auto from selection'}
                  className="w-full rounded-[10px] px-3 py-2 text-[13px]"
                  style={{
                    backgroundColor: 'var(--color-paper)',
                    border: '1px solid var(--color-rule)',
                    color: 'var(--color-ink)',
                  }}
                />
              </Field>

              <Field label={locale === 'de' ? 'Referenzlinien (optional)' : 'Reference lines (optional)'}>
                <div className="flex flex-col gap-2">
                  {referenceLines.map((r, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <select value={r.kind}
                        onChange={(e) => setReferenceLines(referenceLines.map((x, j) => j === i ? { ...x, kind: e.target.value as ReferenceLine['kind'] } : x))}
                        className="rounded-[10px] px-2 py-1.5 text-[12px]"
                        style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }}>
                        <option value="value">{locale === 'de' ? 'Wert' : 'value'}</option>
                        <option value="average">{locale === 'de' ? 'Durchschnitt' : 'average'}</option>
                        <option value="profile">{locale === 'de' ? 'FTP/Zone' : 'FTP/zone'}</option>
                        <option value="band">{locale === 'de' ? 'Band' : 'band'}</option>
                      </select>
                      {r.kind === 'value' && (
                        <input type="number" value={r.value ?? ''} placeholder={locale === 'de' ? 'Wert' : 'value'}
                          onChange={(e) => setReferenceLines(referenceLines.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))}
                          className="w-20 rounded-[10px] px-2 py-1.5 text-[12px]"
                          style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }} />
                      )}
                      {r.kind === 'band' && (
                        <>
                          <input type="number" value={r.value ?? ''} placeholder={locale === 'de' ? 'Min' : 'min'}
                            onChange={(e) => setReferenceLines(referenceLines.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))}
                            className="w-16 rounded-[10px] px-2 py-1.5 text-[12px]"
                            style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)' }} />
                          <input type="number" value={r.valueMax ?? ''} placeholder={locale === 'de' ? 'Max' : 'max'}
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
                      <button type="button" aria-label={locale === 'de' ? 'Referenzlinie entfernen' : 'Remove reference line'}
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
                      {locale === 'de' ? '+ Referenzlinie hinzufügen' : '+ Add reference line'}
                    </button>
                  )}
                </div>
              </Field>

              <div className="flex flex-col gap-2">
                {(state.mark === 'line' || state.mark === 'area') && (
                  <Toggle
                    label={locale === 'de' ? 'Kurve glätten' : 'Smooth curve'}
                    value={state.smooth}
                    onChange={(v) => setState({ ...state, smooth: v })}
                  />
                )}
                {state.seriesColumn !== '' && (
                  <Toggle
                    label={locale === 'de' ? 'Serien stapeln' : 'Stack series'}
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
                {locale === 'de' ? 'Live-Vorschau' : 'Live preview'}
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
              {locale === 'de'
                ? 'Diagramme greifen auf deine eigenen Daten zu; nichts wird geteilt.'
                : 'Charts query your own data; nothing is shared.'}
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
                {locale === 'de' ? 'Abbrechen' : 'Cancel'}
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
                {initial
                  ? locale === 'de' ? 'Diagramm aktualisieren' : 'Update chart'
                  : locale === 'de' ? 'Zum Dashboard hinzufügen' : 'Add to dashboard'}
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

function MetricRow({
  columnOptions, column, agg, mark, axis, showStyle, onChange, onRemove, locale,
}: {
  columnOptions: { value: string; label: string }[]
  column: string
  agg: Aggregation
  mark: MarkType | ''
  axis: '' | 'left' | 'right'
  showStyle: boolean
  onChange: (p: Partial<{ column: string; agg: Aggregation; mark: MarkType | ''; axis: '' | 'left' | 'right' }>) => void
  onRemove?: () => void
  locale: Locale
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
          {(column === '*' ? (['count'] as string[]) : (NUM_AGGS as string[])).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={locale === 'de' ? 'Metrik entfernen' : 'Remove metric'}
            className="px-2 rounded-[10px] text-[13px]" style={{ color: 'var(--color-alert)', border: '1px solid var(--color-rule)' }}>×</button>
        )}
      </div>
      {showStyle && (
        <div className="flex gap-1.5">
          <select value={mark} onChange={(e) => onChange({ mark: e.target.value as MarkType | '' })}
            className="flex-1 rounded-[10px] px-2 py-1.5 text-[12px]"
            style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink-2)' }}>
            <option value="">{locale === 'de' ? 'Form: auto' : 'mark: auto'}</option>
            <option value="line">{locale === 'de' ? 'Linie' : 'line'}</option>
            <option value="area">{locale === 'de' ? 'Fläche' : 'area'}</option>
            <option value="bar">{locale === 'de' ? 'Balken' : 'bar'}</option>
          </select>
          <select value={axis} onChange={(e) => onChange({ axis: e.target.value as '' | 'left' | 'right' })}
            className="rounded-[10px] px-2 py-1.5 text-[12px]"
            style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)', color: 'var(--color-ink-2)' }}>
            <option value="">{locale === 'de' ? 'Achse: auto' : 'axis: auto'}</option>
            <option value="left">{locale === 'de' ? 'links' : 'left'}</option>
            <option value="right">{locale === 'de' ? 'rechts' : 'right'}</option>
          </select>
        </div>
      )}
    </div>
  )
}
