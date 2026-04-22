import { useState, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import type { DailyMetric } from '../../api/dashboard'
import { normalizeHrv } from '../../utils/metrics'

// The #1 Whoop complaint on Reddit/Twitter is black-boxed scores:
//   "Recovery score has zero correlation with anything."
//   "Nonsensical — slept less, score went up."
// Our counter is aggressive transparency: always show the math on request.
// Every contributor reveals its raw value, its delta vs 30-day baseline, its
// mini-trend, and how much it's currently carrying the composite readiness.

interface Contributor {
  key: 'sleep' | 'hrv' | 'battery' | 'rhr'
  label: string
  value: number | null
  baseline: number | null
  /** +delta good or -delta good — for RHR, lower is better. */
  lowerIsBetter: boolean
  /** Last 14 days values for the sparkline. */
  series: number[]
  /** Its share of the current composite (0..100). */
  contribution: number
  unit: string
}

function mean(values: (number | null | undefined)[]): number | null {
  const clean = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  )
  if (clean.length === 0) return null
  return clean.reduce((s, v) => s + v, 0) / clean.length
}

function seriesFor(
  metrics: DailyMetric[],
  getter: (m: DailyMetric) => number | null,
  days: number,
): number[] {
  const sorted = metrics.slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const recent = sorted.slice(-days)
  const out: number[] = []
  for (const m of recent) {
    const v = getter(m)
    if (v != null && Number.isFinite(v)) out.push(v)
  }
  return out
}

function Sparkline({
  values,
  accent,
  lowerIsBetter = false,
}: {
  values: number[]
  accent: string
  lowerIsBetter?: boolean
}) {
  if (values.length < 2) {
    return (
      <div
        className="w-16 h-6 rounded"
        style={{ backgroundColor: 'var(--color-rule)', opacity: 0.4 }}
        aria-hidden
      />
    )
  }
  const width = 64
  const height = 24
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const norm = (v - min) / range
    const y = lowerIsBetter ? norm * height : height - norm * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg width={width} height={height} className="block" aria-hidden>
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={accent}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={(width * (values.length - 1)) / (values.length - 1)}
        cy={
          lowerIsBetter
            ? ((values[values.length - 1] - min) / range) * height
            : height - ((values[values.length - 1] - min) / range) * height
        }
        r={2}
        fill={accent}
      />
    </svg>
  )
}

function DeltaChip({
  delta,
  lowerIsBetter,
  digits = 0,
  unit = '',
}: {
  delta: number
  lowerIsBetter: boolean
  digits?: number
  unit?: string
}) {
  const good = lowerIsBetter ? delta < 0 : delta > 0
  const bad = lowerIsBetter ? delta > 0 : delta < 0
  const color = good
    ? 'var(--color-forest-2)'
    : bad
      ? 'var(--color-alert)'
      : 'var(--color-muted)'
  const bg = good
    ? 'rgba(48, 108, 64, 0.10)'
    : bad
      ? 'rgba(138, 29, 29, 0.10)'
      : 'rgba(100, 100, 100, 0.08)'
  const sign = delta > 0 ? '+' : ''
  return (
    <span
      className="num-mono text-[10px] px-1.5 py-0.5 rounded-full"
      style={{ color, backgroundColor: bg }}
    >
      {sign}
      {delta.toFixed(digits)}{unit}
    </span>
  )
}

function explanation(contributors: Contributor[]): string {
  // Find the single biggest positive + biggest negative delta to build a
  // one-sentence narrative. Matches the "name the metric in a sentence" rule
  // we lifted from Oura's contributors drawer.
  const scored = contributors
    .filter((c) => c.value != null && c.baseline != null)
    .map((c) => {
      const delta = (c.value! - c.baseline!) * (c.lowerIsBetter ? -1 : 1)
      return { c, adj: delta }
    })
    .sort((a, b) => b.adj - a.adj)

  if (scored.length === 0) return 'Your next sync will fill these in.'

  const top = scored[0]
  const bottom = scored[scored.length - 1]
  const lifting = top.adj > 1
  const dragging = bottom.adj < -1

  if (lifting && dragging) {
    return `${top.c.label} is doing the heavy lifting; ${bottom.c.label.toLowerCase()} is pulling against it.`
  }
  if (lifting) {
    return `${top.c.label} is the strongest signal today.`
  }
  if (dragging) {
    return `${bottom.c.label} is the biggest drag — worth planning around.`
  }
  return 'Every contributor is within baseline — a typical day.'
}

export default function ReadinessContributors({
  metrics,
  latest,
}: {
  metrics: DailyMetric[]
  latest: DailyMetric | null
}) {
  const [open, setOpen] = useState(false)

  const contributors = useMemo<Contributor[]>(() => {
    if (!latest) return []

    const sleep = latest.sleep_score
    const hrv = normalizeHrv(latest.hrv_status)
    const battery = latest.body_battery
    const rhr = latest.resting_hr

    const baseSleep = mean(metrics.map((m) => m.sleep_score))
    const baseHrv = mean(metrics.map((m) => normalizeHrv(m.hrv_status)))
    const baseBattery = mean(metrics.map((m) => m.body_battery))
    const baseRhr = mean(metrics.map((m) => m.resting_hr))

    // Contribution weights — 40% HRV, 35% battery, 25% sleep (RHR is context,
    // not composite input; marked 0).
    return [
      {
        key: 'hrv',
        label: 'HRV',
        value: hrv,
        baseline: baseHrv,
        lowerIsBetter: false,
        series: seriesFor(metrics, (m) => normalizeHrv(m.hrv_status), 14),
        contribution: 40,
        unit: '',
      },
      {
        key: 'battery',
        label: 'Body Battery',
        value: battery,
        baseline: baseBattery,
        lowerIsBetter: false,
        series: seriesFor(metrics, (m) => m.body_battery, 14),
        contribution: 35,
        unit: '',
      },
      {
        key: 'sleep',
        label: 'Sleep',
        value: sleep,
        baseline: baseSleep,
        lowerIsBetter: false,
        series: seriesFor(metrics, (m) => m.sleep_score, 14),
        contribution: 25,
        unit: '',
      },
      {
        key: 'rhr',
        label: 'Resting HR',
        value: rhr,
        baseline: baseRhr,
        lowerIsBetter: true,
        series: seriesFor(metrics, (m) => m.resting_hr, 14),
        contribution: 0,
        unit: ' bpm',
      },
    ]
  }, [metrics, latest])

  if (!latest) return null

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.18em] uppercase transition-colors"
        style={{
          color: 'var(--color-ink-2)',
          fontWeight: 500,
        }}
        aria-expanded={open}
      >
        <span>{open ? 'Hide the math' : 'Why this score?'}</span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          style={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 180ms ease',
          }}
        />
      </button>

      {open && (
        <div
          className="mt-3 rounded-xl px-3 py-3 flex flex-col gap-2.5"
          style={{
            backgroundColor: 'var(--color-paper)',
            border: '1px solid var(--color-rule)',
          }}
        >
          {contributors.map((c) => {
            const hasValue = c.value != null
            const hasBaseline = c.baseline != null
            const delta =
              hasValue && hasBaseline ? c.value! - c.baseline! : null
            const accent =
              delta != null &&
              ((c.lowerIsBetter && delta < 0) ||
                (!c.lowerIsBetter && delta > 0))
                ? 'var(--color-forest-2)'
                : delta != null &&
                    ((c.lowerIsBetter && delta > 0) ||
                      (!c.lowerIsBetter && delta < 0))
                  ? 'var(--color-alert)'
                  : 'var(--color-ink-2)'
            return (
              <div
                key={c.key}
                className="grid items-center gap-2"
                style={{
                  gridTemplateColumns: 'minmax(100px, 1.2fr) auto auto 1fr',
                }}
              >
                <div className="flex flex-col min-w-0">
                  <span
                    className="eyebrow"
                    style={{
                      color: 'var(--color-muted)',
                      fontSize: 9,
                      letterSpacing: '0.18em',
                    }}
                  >
                    {c.label.toUpperCase()}
                    {c.contribution > 0 && (
                      <span className="ml-1 opacity-60 num-mono">
                        · {c.contribution}%
                      </span>
                    )}
                  </span>
                  <span
                    className="num-mono"
                    style={{ color: 'var(--color-ink)', fontSize: 14 }}
                  >
                    {hasValue ? Math.round(c.value!) : '—'}
                    {c.unit}
                  </span>
                </div>
                {delta != null ? (
                  <DeltaChip
                    delta={delta}
                    lowerIsBetter={c.lowerIsBetter}
                    digits={0}
                    unit={c.unit}
                  />
                ) : (
                  <span />
                )}
                <span
                  className="num-mono text-[10px]"
                  style={{ color: 'var(--color-muted)' }}
                  title={`30-day baseline: ${c.baseline ? c.baseline.toFixed(0) : '—'}${c.unit}`}
                >
                  vs {c.baseline ? Math.round(c.baseline) : '—'}{c.unit}
                </span>
                <div className="flex justify-end">
                  <Sparkline
                    values={c.series}
                    accent={accent}
                    lowerIsBetter={c.lowerIsBetter}
                  />
                </div>
              </div>
            )
          })}
          <div
            className="mt-1 pt-2 text-[12px] leading-relaxed"
            style={{
              color: 'var(--color-ink-2)',
              borderTop: '1px solid var(--color-rule)',
            }}
          >
            {explanation(contributors)}
          </div>
        </div>
      )}
    </div>
  )
}
