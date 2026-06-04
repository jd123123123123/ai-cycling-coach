import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts'
import { motion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { useAnalyticsQuery } from '../../hooks/useAnalyticsQuery'
import { apiClient } from '../../api/client'
import type { ChartSpec, MarkType, MeasureStyle, QueryResult } from '../../types/chartSpec'

/**
 * ChartCanvas — renders any ChartSpec.
 *
 * Pipeline:
 *   spec → useAnalyticsQuery → rows
 *   rows + spec.encoding → groupedSeries
 *   groupedSeries + spec.mark → ECharts options
 *   options → echarts.init().setOption(...)
 *
 * The component is intentionally render-only: data fetching is delegated
 * to React Query, layout is delegated to the parent, persistence to a
 * future <DashboardCanvas>. That separation lets a single ChartCanvas
 * render both the AI's auto-suggested chart and the one a user dragged
 * into shape — same code path, same caching.
 */

const DEFAULT_PALETTE = [
  'var(--color-forest-2)',
  'var(--color-amber)',
  'var(--color-forest)',
  'var(--color-ink-blue)',
  'var(--color-alert)',
  '#7B5DAB',
  '#3F8FA8',
  '#C66E3D',
]

function resolveCssVar(value: string): string {
  if (typeof window === 'undefined' || !value.startsWith('var(')) return value
  const name = value.slice(4, -1).trim()
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || value
}

interface SeriesData {
  name: string
  pairs: Array<[string | number, number]>
}

/**
 * Pivot the flat rows from /analytics/query into one series per `series`
 * dimension value. When `encoding.series` is unset, everything collapses
 * to a single "Total" series — the simplest case.
 */
function pivot(result: QueryResult, spec: ChartSpec): SeriesData[] {
  const { x, y, series } = spec.encoding
  if (!series) {
    return [
      {
        name: y,
        pairs: result.rows.map((r) => [
          r[x] as string | number,
          (r[y] as number) ?? 0,
        ]),
      },
    ]
  }

  const buckets = new Map<string, Array<[string | number, number]>>()
  for (const row of result.rows) {
    const key = String(row[series] ?? '—')
    const xVal = row[x] as string | number
    const yVal = (row[y] as number) ?? 0
    const arr = buckets.get(key)
    if (arr) arr.push([xVal, yVal])
    else buckets.set(key, [[xVal, yVal]])
  }
  return [...buckets.entries()].map(([name, pairs]) => ({ name, pairs }))
}

function inferXAxisType(result: QueryResult, xKey: string): 'time' | 'category' | 'value' {
  const col = result.columns.find((c) => c.name === xKey)
  if (!col) return 'category'
  if (col.type === 'date') return 'time'
  if (col.type === 'number') return 'value'
  return 'category'
}

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
  return measures.map((_v, i) => (explicit[i] === -1 ? 0 : explicit[i]))
}

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

function buildEChartsOption(
  spec: ChartSpec,
  result: QueryResult,
  profile?: { ftp?: number | null; lthr?: number | null },
): echarts.EChartsOption {
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

  const refs = buildReferenceMarks(spec, profile)
  const refLineColor = resolveCssVar('var(--color-ink-2)')
  const refBandColor = `${resolveCssVar('var(--color-good)')}22`
  for (const ax of [0, 1] as const) {
    const host = series.find((s) => ((s as { yAxisIndex?: number }).yAxisIndex ?? 0) === ax) ?? series[0]
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

interface ChartCanvasProps {
  spec: ChartSpec
  /** Height in px. Width tracks parent. */
  height?: number
  className?: string
}

export default function ChartCanvas({ spec, height = 280, className = '' }: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)
  const { data, isLoading, isError, error } = useAnalyticsQuery(spec.query)

  const { data: profile } = useQuery({
    queryKey: ['athlete', 'me', 'chart-ref'],
    queryFn: async () => {
      const res = await apiClient.get('/athletes/me')
      return res.data as { ftp_watts?: number | null; lthr_cycling?: number | null }
    },
    staleTime: 5 * 60_000,
  })

  // A non-finite height (DashboardCanvas passes NaN) means "fill the parent
  // cell". Applying NaN as a CSS height collapses the container to 0, so
  // ECharts can't size and renders nothing. In fill mode we flex to fill
  // instead; a finite height keeps the fixed-size behaviour (e.g. previews).
  const fill = !Number.isFinite(height)

  const option = useMemo(() => {
    if (!data) return null
    return buildEChartsOption(spec, data, { ftp: profile?.ftp_watts ?? null, lthr: profile?.lthr_cycling ?? null })
  }, [data, spec, profile])

  // Init / dispose.
  useEffect(() => {
    if (!containerRef.current) return
    const inst = echarts.init(containerRef.current, undefined, { renderer: 'svg' })
    instanceRef.current = inst
    const ro = new ResizeObserver(() => inst.resize())
    ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      inst.dispose()
      instanceRef.current = null
    }
  }, [])

  // Push options when data arrives.
  useEffect(() => {
    if (option && instanceRef.current) {
      instanceRef.current.setOption(option, { notMerge: true })
    }
  }, [option])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={`relative @container ${fill ? 'flex flex-col h-full min-h-0' : ''} ${className}`}
    >
      {(spec.title || spec.subtitle) && (
        <header className="flex items-baseline gap-3 mb-3 flex-wrap">
          {spec.title && (
            <h3
              className="leading-tight"
              style={{
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                fontVariationSettings: '"opsz" 144, "SOFT" 30, "wght" 400',
                fontSize: 'clamp(18px, 2.4vw, 22px)',
                color: 'var(--color-ink)',
                letterSpacing: '-0.015em',
              }}
            >
              {spec.title}
            </h3>
          )}
          {spec.subtitle && (
            <span
              className="text-[12px] leading-snug"
              style={{
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                color: 'var(--color-ink-2)',
                fontVariationSettings: '"opsz" 14, "wght" 400',
              }}
            >
              {spec.subtitle}
            </span>
          )}
        </header>
      )}

      <div
        ref={containerRef}
        style={{
          width: '100%',
          ...(fill ? { flexGrow: 1, minHeight: 0 } : { height }),
          opacity: isLoading || !data ? 0.4 : 1,
          transition: 'opacity 240ms ease',
        }}
      />

      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ color: 'var(--color-muted)' }}
        >
          <span
            className="num-mono"
            style={{ fontSize: 10.5, letterSpacing: '0.32em', textTransform: 'uppercase' }}
          >
            loading…
          </span>
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="absolute inset-0 flex items-center justify-center px-4 text-center"
          style={{ color: 'var(--color-alert)' }}
        >
          <span className="text-[12px]">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(error as any)?.response?.data?.detail ?? 'Could not load chart'}
          </span>
        </div>
      )}

      {data?.truncated && (
        <span
          className="absolute right-2 top-2 num-mono"
          style={{
            fontSize: 9.5,
            letterSpacing: '0.18em',
            color: 'var(--color-amber)',
            textTransform: 'uppercase',
          }}
          title={`Showing first ${data.row_count} rows`}
        >
          truncated
        </span>
      )}
    </motion.div>
  )
}
