import { useState } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { format, parseISO } from 'date-fns'
import { usePMC } from '../../hooks/usePMC'
import type { PMCEntry } from '../../api/dashboard'

type Sport = 'total' | 'cycling' | 'running' | 'gym'

const SPORTS: { key: Sport; label: string }[] = [
  { key: 'total', label: 'All' },
  { key: 'cycling', label: 'Ride' },
  { key: 'running', label: 'Run' },
  { key: 'gym', label: 'Strength' },
]

const C_CTL = '#1C4433'    // forest (fitness)
const C_ATL = '#B04A0C'    // amber (fatigue)
const C_TSB = '#143555'    // ink-blue (form)

// Interpret TSB (form): >5 fresh, -10..+5 optimal window, <-10 at-risk of overreaching
function formStatus(tsb: number | null): { label: string; color: string; tone: string } {
  if (tsb == null) return { label: '—', color: 'var(--color-muted)', tone: 'unknown' }
  if (tsb > 15) return { label: 'Over-fresh', color: C_CTL, tone: 'Detraining risk. Load up.' }
  if (tsb > 5) return { label: 'Fresh', color: C_CTL, tone: 'Peak window. Race or push.' }
  if (tsb >= -10) return { label: 'Optimal', color: C_TSB, tone: 'Productive training zone.' }
  if (tsb >= -20) return { label: 'Loading', color: C_ATL, tone: 'Deep training block.' }
  return { label: 'At-risk', color: '#8a1d1d', tone: 'Overreach. Dial back.' }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PmcTooltip({ active, payload, label }: TooltipContentProps<any, any>) {
  if (!active || !payload || payload.length === 0) return null
  const dateLabel = label != null ? format(parseISO(String(label)), 'EEE · MMM d') : ''
  const getVal = (key: string): number | null => {
    const hit = payload.find((p) => p.dataKey === key)
    return typeof hit?.value === 'number' ? hit.value : null
  }
  const ctl = getVal('ctl')
  const atl = getVal('atl')
  const tsb = getVal('tsb')
  const daily = getVal('daily_tss')
  const form = formStatus(tsb)

  const row = (label: string, value: number | null, color: string) => (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: color }}
        />
        <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
          {label}
        </span>
      </span>
      <span className="num-mono text-[12px]" style={{ color: 'var(--color-ink)' }}>
        {value != null ? value.toFixed(1) : '—'}
      </span>
    </div>
  )

  return (
    <div
      className="paper-grain rounded-[12px] px-3.5 py-3 min-w-[220px]"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        boxShadow: '0 12px 28px -16px rgba(20, 24, 17, 0.25)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="serif-caps text-[13px]"
          style={{ color: 'var(--color-ink)' }}
        >
          {dateLabel}
        </span>
        {daily != null && daily > 0 && (
          <span
            className="num-mono text-[10px] px-1.5 py-0.5 rounded"
            style={{
              color: 'var(--color-ink)',
              backgroundColor: 'rgba(20, 24, 17, 0.05)',
            }}
          >
            TSS {Math.round(daily)}
          </span>
        )}
      </div>
      {row('Fitness (CTL)', ctl, C_CTL)}
      {row('Fatigue (ATL)', atl, C_ATL)}
      {row('Form (TSB)', tsb, C_TSB)}
      <div
        className="mt-2 pt-2 eyebrow"
        style={{ color: form.color, borderTop: '1px solid var(--color-rule)' }}
      >
        {form.label} · {form.tone}
      </div>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  unit,
  trend,
  accent,
}: {
  label: string
  value: string
  unit?: string
  trend?: string
  accent: string
}) {
  return (
    <div
      className="flex flex-col gap-1 px-4 py-3 flex-1 min-w-[120px]"
      style={{ borderRight: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <span className="eyebrow">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="num-display leading-none"
          style={{ fontSize: 32, color: 'var(--color-ink)' }}
        >
          {value}
        </span>
        {unit && (
          <span
            className="num-mono text-[11px]"
            style={{ color: 'var(--color-muted)' }}
          >
            {unit}
          </span>
        )}
      </div>
      {trend && (
        <span className="num-mono text-[11px]" style={{ color: accent }}>
          {trend}
        </span>
      )}
    </div>
  )
}

export default function PMCChart() {
  const [sport, setSport] = useState<Sport>('total')
  const { data, isLoading, isError, refetch } = usePMC(90)

  const series: PMCEntry[] =
    data == null
      ? []
      : sport === 'total'
      ? data.entries
      : (data.per_sport[sport] ?? [])

  // Summary stats
  const latest = series.length > 0 ? series[series.length - 1] : null
  const priorWeek =
    series.length >= 8 ? series[series.length - 8] : series[0] ?? null

  const ctlDelta = latest && priorWeek ? latest.ctl - priorWeek.ctl : null
  const form = formStatus(latest?.tsb ?? null)

  return (
    <div
      className="paper-grain relative rounded-[20px] overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6 pb-3">
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
            Chapter II · Training Load
          </span>
          <h2
            className="num-display mt-1 leading-none"
            style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              color: 'var(--color-ink)',
            }}
          >
            Fitness, fatigue, form
          </h2>
        </div>
        <div
          className="rounded-full p-0.5 inline-flex"
          style={{
            backgroundColor: 'rgba(20, 24, 17, 0.05)',
            border: '1px solid var(--color-rule)',
          }}
        >
          {SPORTS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSport(key)}
              className="py-2 px-3.5 text-[12px] font-medium rounded-full transition-all min-h-[40px]"
              style={{
                color: sport === key ? 'var(--color-paper)' : 'var(--color-ink-2)',
                backgroundColor: sport === key ? 'var(--color-ink)' : 'transparent',
                letterSpacing: '0.02em',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      {latest && (
        <div
          className="flex flex-wrap items-stretch divide-y sm:divide-y-0"
          style={{
            borderTop: '1px solid var(--color-rule)',
            borderBottom: '1px solid var(--color-rule)',
            backgroundColor: 'rgba(20, 24, 17, 0.02)',
          }}
        >
          <SummaryStat
            label="Fitness · CTL"
            value={latest.ctl.toFixed(1)}
            unit="TSS/d"
            trend={
              ctlDelta == null
                ? undefined
                : `${ctlDelta >= 0 ? '+' : ''}${ctlDelta.toFixed(1)} · 7d`
            }
            accent={C_CTL}
          />
          <SummaryStat
            label="Fatigue · ATL"
            value={latest.atl.toFixed(1)}
            unit="TSS/d"
            accent={C_ATL}
          />
          <SummaryStat
            label="Form · TSB"
            value={(latest.tsb >= 0 ? '+' : '') + latest.tsb.toFixed(1)}
            trend={form.label}
            accent={C_TSB}
          />
        </div>
      )}

      {/* Chart area */}
      <div className="px-3 sm:px-4 pb-4 pt-4 min-w-0">
        {isLoading ? (
          <div
            className="w-full h-64 sm:h-80 min-w-0 rounded-[14px] animate-pulse"
            style={{ backgroundColor: 'var(--color-rule)' }}
          />
        ) : isError ? (
          <div
            className="w-full h-64 sm:h-80 min-w-0 flex flex-col items-center justify-center gap-3"
          >
            <span className="text-[13px]" style={{ color: 'var(--color-alert)' }}>
              Couldn&apos;t load training load
            </span>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-medium"
              style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
            >
              Retry
            </button>
          </div>
        ) : series.length === 0 ? (
          <div
            className="w-full h-64 sm:h-80 min-w-0 flex flex-col items-center justify-center text-center px-6 gap-2"
          >
            <span className="eyebrow" style={{ color: 'var(--color-forest)' }}>
              Nothing plotted yet
            </span>
            <p
              className="serif-caps text-[15px] max-w-sm"
              style={{ color: 'var(--color-ink-2)' }}
            >
              The curves paint themselves once a few sessions are in the logbook.
            </p>
          </div>
        ) : (
          <div className="w-full h-72 sm:h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={series}
                margin={{ top: 10, right: 12, left: 0, bottom: 8 }}
              >
                <defs>
                  <linearGradient id="ctlFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C_CTL} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={C_CTL} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--color-rule)"
                  strokeDasharray="2 3"
                />
                {/* TSB zone bands (reference) */}
                <ReferenceArea y1={-100} y2={-10} fill={C_ATL} fillOpacity={0.03} ifOverflow="extendDomain" />
                <ReferenceArea y1={-10} y2={5} fill={C_TSB} fillOpacity={0.035} ifOverflow="extendDomain" />
                <ReferenceArea y1={5} y2={500} fill={C_CTL} fillOpacity={0.03} ifOverflow="extendDomain" />
                <ReferenceLine y={0} stroke="var(--color-rule)" strokeWidth={1} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                  stroke="var(--color-rule)"
                  interval="preserveStartEnd"
                  minTickGap={40}
                  tickFormatter={(d: string) => format(parseISO(d), 'd MMM')}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-rule)' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip content={PmcTooltip} cursor={{ stroke: 'var(--color-ink-2)', strokeWidth: 1, strokeDasharray: '2 3' }} />
                <Line
                  type="monotone"
                  dataKey="ctl"
                  name="Fitness (CTL)"
                  stroke={C_CTL}
                  strokeWidth={2.25}
                  dot={false}
                  isAnimationActive={false}
                  fill="url(#ctlFill)"
                />
                <Line
                  type="monotone"
                  dataKey="atl"
                  name="Fatigue (ATL)"
                  stroke={C_ATL}
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="tsb"
                  name="Form (TSB)"
                  stroke={C_TSB}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Legend at bottom */}
      {!isLoading && !isError && series.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pb-5 pt-2 sm:px-6"
          style={{ borderTop: '1px solid var(--color-rule)' }}
        >
          <LegendPip label="Fitness" sub="CTL · 42-day load" color={C_CTL} />
          <LegendPip label="Fatigue" sub="ATL · 7-day load" color={C_ATL} dashed />
          <LegendPip label="Form" sub="TSB · CTL − ATL" color={C_TSB} />
        </div>
      )}
    </div>
  )
}

function LegendPip({
  label, sub, color, dashed,
}: { label: string; sub: string; color: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden>
        <line
          x1="1" y1="4" x2="21" y2="4"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? '4 2' : undefined}
          strokeLinecap="round"
        />
      </svg>
      <div className="flex flex-col leading-tight">
        <span
          className="serif-caps text-[12px]"
          style={{ color: 'var(--color-ink)' }}
        >
          {label}
        </span>
        <span className="num-mono text-[10px]" style={{ color: 'var(--color-muted)' }}>
          {sub}
        </span>
      </div>
    </div>
  )
}
