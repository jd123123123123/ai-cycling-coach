import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts'
import { motion } from 'motion/react'
import { useAnalyticsQuery } from '../../hooks/useAnalyticsQuery'
import type { ChartSpec, QueryResult } from '../../types/chartSpec'

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

function buildEChartsOption(spec: ChartSpec, result: QueryResult): echarts.EChartsOption {
  const seriesData = pivot(result, spec)
  const xType = inferXAxisType(result, spec.encoding.x)

  // Resolve palette + accent up-front so we don't pay per-series.
  const palette = DEFAULT_PALETTE.map(resolveCssVar)
  const accent = spec.accent ? resolveCssVar(spec.accent) : palette[0]

  const series: echarts.SeriesOption[] = seriesData.map((s, i) => {
    const color = seriesData.length === 1 ? accent : palette[i % palette.length]
    const base = {
      name: s.name,
      data: s.pairs,
      itemStyle: { color },
    }
    if (spec.mark === 'bar') {
      return {
        ...base,
        type: 'bar',
        ...(spec.stacked ? { stack: 'all' } : {}),
        barMaxWidth: 22,
      } satisfies echarts.SeriesOption
    }
    if (spec.mark === 'scatter') {
      return {
        ...base,
        type: 'scatter',
        symbolSize: 7,
      } satisfies echarts.SeriesOption
    }
    // line / area
    return {
      ...base,
      type: 'line',
      smooth: spec.smooth ?? true,
      symbol: 'circle',
      symbolSize: seriesData.length === 1 ? 4 : 0,
      showSymbol: false,
      lineStyle: { width: 2, color },
      ...(spec.mark === 'area'
        ? {
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: `${color}55` },
                { offset: 1, color: `${color}05` },
              ]),
            },
          }
        : {}),
      ...(spec.stacked ? { stack: 'all' } : {}),
    } satisfies echarts.SeriesOption
  })

  return {
    animationDuration: 480,
    animationEasing: 'cubicOut',
    grid: { left: 8, right: 12, top: 24, bottom: 24, containLabel: true },
    legend:
      seriesData.length > 1
        ? {
            top: 0,
            left: 0,
            icon: 'roundRect',
            itemWidth: 10,
            itemHeight: 10,
            textStyle: {
              fontSize: 11,
              color: resolveCssVar('var(--color-ink-2)'),
            },
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
      boundaryGap: spec.mark === 'bar',
      axisLine: { lineStyle: { color: resolveCssVar('var(--color-rule)') } },
      axisTick: { show: false },
      axisLabel: {
        color: resolveCssVar('var(--color-muted)'),
        fontSize: 10.5,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: resolveCssVar('var(--color-rule)'), type: 'dashed' } },
      axisLabel: {
        color: resolveCssVar('var(--color-muted)'),
        fontSize: 10.5,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      },
    },
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

  // A non-finite height (DashboardCanvas passes NaN) means "fill the parent
  // cell". Applying NaN as a CSS height collapses the container to 0, so
  // ECharts can't size and renders nothing. In fill mode we flex to fill
  // instead; a finite height keeps the fixed-size behaviour (e.g. previews).
  const fill = !Number.isFinite(height)

  const option = useMemo(() => {
    if (!data) return null
    return buildEChartsOption(spec, data)
  }, [data, spec])

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
