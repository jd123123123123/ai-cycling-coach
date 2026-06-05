import { useEffect, useMemo, useRef, useState } from 'react'
import { subDays, format } from 'date-fns'
import { de } from 'date-fns/locale'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { hrvBaselineBand } from '../../utils/advanced-metrics'
import { useCountUp } from '../../hooks/useCountUp'
import { useLocale } from '../../contexts/LocaleContext'

type Loc = 'en' | 'de'

// HRV trend with ±1 SD baseline band, interactive cursor.
// The chart measures its own container via ResizeObserver so it scales
// correctly at any width without stretching. Dots colored against the band:
//   above band  → green  (recovered)
//   within band → amber  (normal)
//   below band  → red    (suppressed)

const DAYS = 30
const CHART_H = 180
const PADDING = { top: 20, right: 18, bottom: 30, left: 36 }

interface BandPoint {
  value: number | null
  lower: number | null
  upper: number | null
}

/** Catmull-Rom → cubic Bezier, handles null breaks by splitting into runs. */
function smoothPath(points: Array<{ x: number; y: number } | null>): string {
  // Split into contiguous non-null runs
  const runs: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []
  for (const p of points) {
    if (p == null) {
      if (current.length > 0) runs.push(current)
      current = []
    } else {
      current.push(p)
    }
  }
  if (current.length > 0) runs.push(current)

  let out = ''
  for (const run of runs) {
    if (run.length === 0) continue
    if (run.length === 1) {
      // Single point — render as a tiny horizontal tick
      const p = run[0]
      out += ` M ${p.x - 1},${p.y} L ${p.x + 1},${p.y}`
      continue
    }
    out += ` M ${run[0].x},${run[0].y}`
    for (let i = 0; i < run.length - 1; i++) {
      const p0 = run[i - 1] ?? run[i]
      const p1 = run[i]
      const p2 = run[i + 1]
      const p3 = run[i + 2] ?? run[i + 1]
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      out += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
    }
  }
  return out.trim()
}

function Chart({
  values,
  bands,
  dates,
  locale,
}: {
  values: Array<number | null>
  bands: BandPoint[]
  dates: string[]
  locale: Loc
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>(600)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth
      setWidth(Math.max(200, Math.floor(w)))
    })
    ro.observe(el)
    setWidth(el.clientWidth || 600)
    return () => ro.disconnect()
  }, [])

  const definedVals = values.filter((v): v is number => v != null)
  if (definedVals.length < 3) return <div ref={containerRef} className="w-full h-[180px]" />

  // Y-range: include band extents so band never clips the drawing area
  const allBandLow = bands.map((b) => b.lower).filter((v): v is number => v != null)
  const allBandHigh = bands.map((b) => b.upper).filter((v): v is number => v != null)
  const yMinRaw = Math.min(...definedVals, ...allBandLow)
  const yMaxRaw = Math.max(...definedVals, ...allBandHigh)
  const pad = Math.max(3, (yMaxRaw - yMinRaw) * 0.12)
  const yMin = Math.floor(yMinRaw - pad)
  const yMax = Math.ceil(yMaxRaw + pad)
  const yRange = Math.max(1, yMax - yMin)

  const plotW = width - PADDING.left - PADDING.right
  const plotH = CHART_H - PADDING.top - PADDING.bottom
  const N = values.length
  const stepX = N > 1 ? plotW / (N - 1) : 0

  const toX = (i: number) => PADDING.left + i * stepX
  const toY = (v: number) => PADDING.top + (1 - (v - yMin) / yRange) * plotH

  // Band polygon — upper path forward + lower path reversed
  const upperPts: Array<{ x: number; y: number } | null> = bands.map((b, i) =>
    b.upper != null ? { x: toX(i), y: toY(b.upper) } : null,
  )
  const lowerPts: Array<{ x: number; y: number } | null> = bands.map((b, i) =>
    b.lower != null ? { x: toX(i), y: toY(b.lower) } : null,
  )
  const bandRuns: string[] = []
  let runUpper: Array<{ x: number; y: number }> = []
  let runLower: Array<{ x: number; y: number }> = []
  for (let i = 0; i < N; i++) {
    const u = upperPts[i]
    const l = lowerPts[i]
    if (u && l) {
      runUpper.push(u)
      runLower.push(l)
    } else if (runUpper.length >= 2) {
      bandRuns.push(
        `M ${runUpper.map((p) => `${p.x},${p.y}`).join(' L ')} L ${[...runLower].reverse().map((p) => `${p.x},${p.y}`).join(' L ')} Z`,
      )
      runUpper = []
      runLower = []
    }
  }
  if (runUpper.length >= 2) {
    bandRuns.push(
      `M ${runUpper.map((p) => `${p.x},${p.y}`).join(' L ')} L ${[...runLower].reverse().map((p) => `${p.x},${p.y}`).join(' L ')} Z`,
    )
  }

  // Value line (smooth)
  const linePts = values.map((v, i) => (v != null ? { x: toX(i), y: toY(v) } : null))
  const linePath = smoothPath(linePts)

  // Upper/lower edges (dashed)
  const upperEdgePath = smoothPath(upperPts)
  const lowerEdgePath = smoothPath(lowerPts)

  // Y-axis ticks (4)
  const yTicks = Array.from({ length: 4 }, (_, i) => {
    const t = yMin + (yRange * i) / 3
    return Math.round(t)
  })

  // X-axis tick labels (first, middle, last)
  const xTicks = [0, Math.floor((N - 1) / 2), N - 1]

  const hoverVal = hoverIdx != null ? values[hoverIdx] : null
  const hoverBand = hoverIdx != null ? bands[hoverIdx] : null
  const hoverDate = hoverIdx != null ? dates[hoverIdx] : null

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const relX = x - PADDING.left
    if (relX < 0 || relX > plotW) {
      setHoverIdx(null)
      return
    }
    const idx = Math.max(0, Math.min(N - 1, Math.round(relX / stepX)))
    setHoverIdx(idx)
  }

  return (
    <div ref={containerRef} className="w-full relative">
      <svg
        width={width}
        height={CHART_H}
        viewBox={`0 0 ${width} ${CHART_H}`}
        className="block"
        style={{ overflow: 'visible' }}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* Y-axis grid + ticks */}
        {yTicks.map((t) => (
          <g key={`yt-${t}`}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={toY(t)}
              y2={toY(t)}
              stroke="var(--color-rule)"
              strokeWidth={0.5}
              strokeDasharray="2 3"
              opacity={0.5}
            />
            <text
              x={PADDING.left - 8}
              y={toY(t) + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-muted)"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              {t}
            </text>
          </g>
        ))}

        {/* Band fill */}
        {bandRuns.map((d, i) => (
          <path
            key={`band-${i}`}
            d={d}
            fill="rgba(48, 209, 88, 0.08)"
            stroke="none"
          />
        ))}

        {/* Upper / Lower band edges, dashed */}
        {upperEdgePath && (
          <path
            d={upperEdgePath}
            fill="none"
            stroke="rgba(48, 209, 88, 0.28)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        {lowerEdgePath && (
          <path
            d={lowerEdgePath}
            fill="none"
            stroke="rgba(255, 69, 58, 0.22)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {/* Value line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Dots — colored by band zone */}
        {values.map((v, i) => {
          if (v == null) return null
          const band = bands[i]
          let fill = 'var(--color-muted)'
          if (band?.upper != null && band?.lower != null) {
            if (v > band.upper) fill = '#30D158'
            else if (v < band.lower) fill = 'var(--color-alert)'
            else fill = 'var(--color-amber)'
          }
          const isLast = i === N - 1
          const isHover = hoverIdx === i
          const r = isLast || isHover ? 4 : 2.5
          return (
            <g key={`dot-${i}`}>
              {(isLast || isHover) && (
                <circle
                  cx={toX(i)}
                  cy={toY(v)}
                  r={r + 3}
                  fill={fill}
                  opacity={0.18}
                />
              )}
              <circle
                cx={toX(i)}
                cy={toY(v)}
                r={r}
                fill={fill}
                stroke="var(--color-paper-2)"
                strokeWidth={isLast || isHover ? 1.5 : 0}
              />
            </g>
          )
        })}

        {/* Hover cursor */}
        {hoverIdx != null && hoverVal != null && (
          <line
            x1={toX(hoverIdx)}
            x2={toX(hoverIdx)}
            y1={PADDING.top}
            y2={CHART_H - PADDING.bottom}
            stroke="var(--color-ink-2)"
            strokeWidth={0.8}
            strokeDasharray="2 3"
            opacity={0.5}
          />
        )}

        {/* X-axis labels */}
        {xTicks.map((i) => {
          const d = dates[i]
          if (!d) return null
          const label = format(new Date(d), 'd LLL', locale === 'de' ? { locale: de } : undefined)
          return (
            <text
              key={`xt-${i}`}
              x={toX(i)}
              y={CHART_H - 10}
              textAnchor={i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle'}
              fontSize={10}
              fill="var(--color-muted)"
              style={{ fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.05em' }}
            >
              {label.toUpperCase()}
            </text>
          )
        })}
      </svg>

      {/* Hover tooltip */}
      {hoverIdx != null && hoverVal != null && hoverDate && (
        <div
          className="absolute pointer-events-none rounded-[10px] px-3 py-2 text-[11px] num-mono"
          style={{
            left: Math.min(width - 160, Math.max(0, PADDING.left + hoverIdx * stepX - 70)),
            top: 0,
            backgroundColor: 'var(--color-paper)',
            border: '1px solid var(--color-rule)',
            color: 'var(--color-ink)',
            minWidth: 140,
            boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.12em' }}>
            {format(new Date(hoverDate), 'EEE · d LLL', locale === 'de' ? { locale: de } : undefined).toUpperCase()}
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="num-display leading-none" style={{ fontSize: 20, color: 'var(--color-ink)' }}>
              {hoverVal}
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>hrv</span>
          </div>
          {hoverBand?.upper != null && hoverBand.lower != null && (
            <div style={{ color: 'var(--color-muted)', marginTop: 4, fontSize: 10 }}>
              {locale === 'de' ? 'Band' : 'band'} {Math.round(hoverBand.lower)}–{Math.round(hoverBand.upper)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function HRVTrend() {
  const { locale } = useLocale()
  const today = new Date()
  const start = subDays(today, DAYS)
  const { data, isLoading } = useDailyMetrics(start, today)

  const { values, bands, dates, current, baseline, status } = useMemo(() => {
    const metrics = (data?.metrics ?? [])
      .filter((m) => m.date)
      .sort((a, b) => (a.date! > b.date! ? 1 : -1))
      .slice(-DAYS)

    const vals = metrics.map((m) => m.hrv_status)
    const bds = hrvBaselineBand(vals, 7)
    const dts = metrics.map((m) => m.date!)

    const lastWithValue = [...metrics].reverse().find((m) => m.hrv_status != null)
    const cur = lastWithValue?.hrv_status ?? null
    const lastBand = bds[bds.length - 1]

    let st: 'above' | 'within' | 'below' | 'unknown' = 'unknown'
    if (cur != null && lastBand?.upper != null && lastBand?.lower != null) {
      if (cur > lastBand.upper) st = 'above'
      else if (cur < lastBand.lower) st = 'below'
      else st = 'within'
    }

    const baselineVals = bds.map((b) => b.value).filter((v): v is number => v != null)
    const bl = baselineVals.length > 0
      ? Math.round(baselineVals.slice(-7).reduce((s, v) => s + v, 0) / Math.min(7, baselineVals.length))
      : null

    return { values: vals, bands: bds, dates: dts, current: cur, baseline: bl, status: st }
  }, [data])

  const countedCurrent = useCountUp(current ?? 0, { duration: 800, enabled: current != null })

  const statusColor = {
    above: '#30D158',
    within: 'var(--color-amber)',
    below: 'var(--color-alert)',
    unknown: 'var(--color-muted)',
  }[status]

  const statusLabel = (locale === 'de'
    ? {
        above: 'Über Baseline',
        within: 'Innerhalb Baseline',
        below: 'Unter Baseline',
        unknown: '—',
      }
    : {
        above: 'Above baseline',
        within: 'Within baseline',
        below: 'Below baseline',
        unknown: '—',
      })[status]

  const isEmpty = values.filter((v) => v != null).length < 5

  if (isLoading) {
    return (
      <div
        className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        <div className="h-4 w-32 rounded animate-pulse mb-3" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="h-[180px] w-full rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      </div>
    )
  }

  if (isEmpty) return null

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
            {locale === 'de' ? 'HRV · letzte 30 Tage' : 'HRV · last 30 days'}
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span
              className="num-display leading-none"
              style={{ fontSize: 'clamp(28px, 3.2vw, 36px)', color: 'var(--color-ink)' }}
            >
              {current != null ? countedCurrent : '—'}
            </span>
            {current != null && (
              <span className="num-mono text-[11px]" style={{ color: statusColor }}>
                {statusLabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {baseline != null && (
            <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
              {locale === 'de' ? 'Baseline' : 'baseline'} ~{baseline}
            </span>
          )}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#30D158' }} />
              <span className="eyebrow" style={{ fontSize: 9, color: 'var(--color-muted)' }}>{locale === 'de' ? 'ÜBER' : 'ABOVE'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-amber)' }} />
              <span className="eyebrow" style={{ fontSize: 9, color: 'var(--color-muted)' }}>{locale === 'de' ? 'INNEN' : 'WITHIN'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-alert)' }} />
              <span className="eyebrow" style={{ fontSize: 9, color: 'var(--color-muted)' }}>{locale === 'de' ? 'UNTER' : 'BELOW'}</span>
            </div>
          </div>
        </div>
      </div>

      <Chart values={values} bands={bands} dates={dates} locale={locale} />
    </div>
  )
}
