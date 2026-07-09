import React, { useState, useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { format } from 'date-fns'
import { usePMC } from '../../hooks/usePMC'
import type { PMCEntry } from '../../api/dashboard'
import { prefersReducedMotion } from '../../utils/motion'
import Sparkline from './Sparkline'
import { useLocale } from '../../contexts/LocaleContext'

type Sport = 'total' | 'cycling' | 'running' | 'gym'

const SPORTS: { key: Sport; label: string; labelDe: string }[] = [
  { key: 'total', label: 'All', labelDe: 'Alle' },
  { key: 'cycling', label: 'Ride', labelDe: 'Rad' },
  { key: 'running', label: 'Run', labelDe: 'Lauf' },
  { key: 'gym', label: 'Strength', labelDe: 'Kraft' },
]

const C_CTL = '#30D158'    // bright green (fitness)
const C_ATL = '#FF9F0A'    // amber (fatigue — caution semantic, legitimate amber use)
const C_TSB = '#0A84FF'    // blue (form)

// Interpret TSB (form): >5 fresh, -10..+5 optimal window, <-10 at-risk of overreaching
function formStatus(tsb: number | null, de: boolean): { label: string; color: string; tone: string } {
  if (tsb == null) return { label: '—', color: 'var(--color-muted)', tone: de ? 'unbekannt' : 'unknown' }
  if (tsb > 15) return { label: de ? 'Überfrisch' : 'Over-fresh', color: C_CTL, tone: de ? 'Detraining-Risiko. Belastung hoch.' : 'Detraining risk. Load up.' }
  if (tsb > 5) return { label: de ? 'Frisch' : 'Fresh', color: C_CTL, tone: de ? 'Peak-Fenster. Rennen oder pushen.' : 'Peak window. Race or push.' }
  if (tsb >= -10) return { label: 'Optimal', color: C_TSB, tone: de ? 'Produktive Trainingszone.' : 'Productive training zone.' }
  if (tsb >= -20) return { label: de ? 'Aufbau' : 'Loading', color: C_ATL, tone: de ? 'Tiefer Trainingsblock.' : 'Deep training block.' }
  return { label: de ? 'Risiko' : 'At-risk', color: 'var(--color-alert)', tone: de ? 'Überlastung. Zurückfahren.' : 'Overreach. Dial back.' }
}

function SummaryStat({
  label,
  value,
  unit,
  trend,
  accent,
  children,
}: {
  label: string
  value: string
  unit?: string
  trend?: string
  accent: string
  /** Optional content rendered below the value row (e.g. a Sparkline) */
  children?: React.ReactNode
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
      {children}
    </div>
  )
}

// ─── uPlot chart ────────────────────────────────────────────────────────────────

interface HoverInfo {
  idx: number
  left: number   // px within container
  top: number    // px within container
}

function PmcUPlot({ series }: { series: PMCEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const { locale } = useLocale()
  const de = locale === 'de'

  useEffect(() => {
    if (!containerRef.current || series.length === 0) return

    const el = containerRef.current
    const width = el.clientWidth || 600

    // Apple chart-polish (Wave 3): linearGradient fill factories for CTL + ATL.
    // Created via canvas ctx.createLinearGradient (uPlot is canvas-based).
    // TSB stays as a plain line (the diagnostic trace — no fill intended).
    const reducedMotion = prefersReducedMotion()

    const opts: uPlot.Options = {
      width,
      height: 280,
      series: [
        {},
        {
          label: 'Fitness (CTL)',
          stroke: C_CTL,
          width: 2.25,
          // Fill is set dynamically in the ready hook below via gradient
          fill: (_u, _seriesIdx) => {
            const canvas = el.querySelector('canvas')
            if (!canvas) return C_CTL + '25'
            const ctx = canvas.getContext('2d')
            if (!ctx) return C_CTL + '25'
            const grad = ctx.createLinearGradient(0, 0, 0, 280)
            grad.addColorStop(0, C_CTL + 'CC')   // 80% opacity top
            grad.addColorStop(1, C_CTL + '00')   // transparent bottom
            return grad
          },
        },
        {
          label: de ? 'Ermüdung (ATL)' : 'Fatigue (ATL)',
          stroke: C_ATL,
          width: 1.5,
          dash: [5, 3],
          fill: (_u, _seriesIdx) => {
            const canvas = el.querySelector('canvas')
            if (!canvas) return C_ATL + '18'
            const ctx = canvas.getContext('2d')
            if (!ctx) return C_ATL + '18'
            const grad = ctx.createLinearGradient(0, 0, 0, 280)
            grad.addColorStop(0, C_ATL + '80')   // 50% opacity top
            grad.addColorStop(1, C_ATL + '00')   // transparent bottom
            return grad
          },
        },
        {
          label: 'Form (TSB)',
          stroke: C_TSB,
          width: 2,
        },
      ],
      axes: [
        {
          // x-axis: no grid (already off), clean labels
          stroke: 'var(--color-chart-axis)',
          grid: { show: false },
          ticks: { show: false },
          font: '11px Geist, sans-serif',
          values: (_u, splits) =>
            splits.map((ts) => format(new Date(ts * 1000), 'd MMM')),
        },
        {
          // y-axis: REMOVE gridlines (Apple chart polish — no gridlines)
          stroke: 'var(--color-chart-axis)',
          grid: { show: false },
          ticks: { show: false },
          font: '11px Geist, sans-serif',
        },
      ],
      hooks: {
        drawClear: [
          (u) => {
            // Paint TSB zone bands on the canvas before any series lines.
            const ctx = u.ctx
            // Zone: at-risk <-10, optimal -10..+5, fresh 5+
            const zones: Array<[number, number, string]> = [
              [-200, -10, 'rgba(255, 69, 58, 0.08)'],      // at-risk
              [-10, 5, 'rgba(10, 132, 255, 0.07)'],         // optimal
              [5, 200, 'rgba(48, 209, 88, 0.07)'],           // fresh
            ]
            ctx.save()
            for (const [y0, y1, fillStyle] of zones) {
              const yTop = u.valToPos(y1, 'y', true)
              const yBot = u.valToPos(y0, 'y', true)
              ctx.fillStyle = fillStyle
              ctx.fillRect(u.bbox.left, yTop, u.bbox.width, yBot - yTop)
            }
            ctx.restore()
          },
        ],
        // Draw-on animation (Wave 3 Apple polish): fade the canvas in on mount
        // by animating canvas opacity from 0 → 1 over 750ms ease-out.
        // uPlot's canvas element is the child of the container. This approach
        // avoids interfering with the draw pipeline while still delivering the
        // mount animation. Skipped under prefers-reduced-motion.
        ready: [
          (u) => {
            if (reducedMotion) return
            const canvas = u.ctx.canvas
            canvas.style.opacity = '0'
            canvas.style.transition = 'opacity 750ms cubic-bezier(0.65, 0, 0.35, 1)'
            requestAnimationFrame(() => {
              canvas.style.opacity = '1'
            })
          },
        ],
        setCursor: [
          (u) => {
            // Bridge uPlot cursor idx -> React state so we can render a rich
            // HTML tooltip with the per-day narrative outside the canvas.
            const idx = u.cursor.idx
            if (idx == null || idx < 0) {
              setHover(null)
              return
            }
            const left = u.cursor.left ?? 0
            const top = u.cursor.top ?? 0
            // left/top from uPlot are relative to the plot canvas. The canvas
            // is positioned inside .u-wrap which fills our container, so these
            // coords already work as container offsets.
            setHover({ idx, left, top })
          },
        ],
        // Forward TSB projection: draw 14 dashed projected lines on top of
        // existing series after each render. Zero-TSS rest scenario (worst
        // case). Formula: CTL decays τ=42d, ATL decays τ=7d.
        draw: [
          (u) => {
            if (series.length === 0) return
            const last = series[series.length - 1]
            const ctx = u.ctx
            const PROJ_DAYS = 14
            const DAY_S = 86400  // seconds

            const lastTs = new Date(last.date).getTime() / 1000

            // Build projected arrays
            const projCTL: number[] = []
            const projATL: number[] = []
            const projTSB: number[] = []
            const projTs: number[] = []

            let ctl = last.ctl
            let atl = last.atl
            for (let i = 0; i <= PROJ_DAYS; i++) {
              projTs.push(lastTs + i * DAY_S)
              projCTL.push(ctl)
              projATL.push(atl)
              projTSB.push(ctl - atl)
              // Decay for next step (zero TSS)
              ctl = ctl * (1 - 1 / 42)
              atl = atl * (1 - 1 / 7)
            }

            ctx.save()
            ctx.setLineDash([5, 4])

            const drawLine = (ts: number[], values: number[], color: string, lineWidth: number) => {
              ctx.strokeStyle = color
              ctx.lineWidth = lineWidth
              ctx.globalAlpha = 0.55
              ctx.beginPath()
              ts.forEach((t, i) => {
                const x = u.valToPos(t, 'x', true)
                const y = u.valToPos(values[i], 'y', true)
                if (i === 0) ctx.moveTo(x, y)
                else ctx.lineTo(x, y)
              })
              ctx.stroke()
            }

            drawLine(projTs, projCTL, C_CTL, 1.5)
            drawLine(projTs, projATL, C_ATL, 1.5)
            drawLine(projTs, projTSB, C_TSB, 1.5)

            // "Projection" label at the start of the dashed region
            const labelX = u.valToPos(lastTs + DAY_S * 2, 'x', true)
            const labelY = u.bbox.top + 12
            ctx.globalAlpha = 0.45
            ctx.fillStyle = 'var(--color-muted)'
            ctx.font = '9px Geist, sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText(de ? 'Ruhe →' : 'rest →', labelX, labelY)

            ctx.restore()
          },
        ],
      },
      cursor: {
        drag: { x: false },
        focus: { prox: 16 },
      },
      legend: { show: false },
    }

    const data: uPlot.AlignedData = [
      series.map((s) => new Date(s.date).getTime() / 1000),
      series.map((s) => s.ctl),
      series.map((s) => s.atl),
      series.map((s) => s.tsb),
    ]

    const plot = new uPlot(opts, data, el)

    const ro = new ResizeObserver(() => {
      if (el) plot.setSize({ width: el.clientWidth, height: 280 })
    })
    ro.observe(el)

    const onLeave = () => setHover(null)
    el.addEventListener('mouseleave', onLeave)

    return () => {
      ro.disconnect()
      el.removeEventListener('mouseleave', onLeave)
      plot.destroy()
    }
  }, [series, de])

  const hoveredEntry =
    hover && hover.idx >= 0 && hover.idx < series.length ? series[hover.idx] : null

  return (
    <div ref={containerRef} className="w-full min-w-0 relative">
      {hoveredEntry && hover && (
        <HoverTooltip entry={hoveredEntry} left={hover.left} top={hover.top} />
      )}
    </div>
  )
}

// ─── Hover tooltip with per-day narrative ───────────────────────────────────

function HoverTooltip({
  entry,
  left,
  top,
}: {
  entry: PMCEntry
  left: number
  top: number
}) {
  // Max-width tooltip card. We nudge it right/above the cursor and cap
  // it so long narratives wrap within ~280px for readability.
  const OFFSET_X = 14
  const OFFSET_Y = -12
  const dateLabel = format(new Date(entry.date), 'EEE, d MMM')
  const tsb = entry.tsb
  const narrative = entry.narrative?.trim()
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-[10px] px-3 py-2 shadow-md"
      style={{
        left: left + OFFSET_X,
        top: top + OFFSET_Y,
        maxWidth: 280,
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
        // Prevent overflow past container right edge
        transform: 'translateZ(0)',
      }}
    >
      {/* Date label: .eyebrow class (muted caps) */}
      <div
        className="eyebrow text-[11px] mb-1"
        style={{ color: 'var(--color-muted)' }}
      >
        {dateLabel}
      </div>
      <div className="flex gap-3 num-mono text-[12px]" style={{ color: 'var(--color-ink)' }}>
        <span><span style={{ color: C_CTL }}>●</span> CTL {entry.ctl.toFixed(1)}</span>
        <span><span style={{ color: C_ATL }}>●</span> ATL {entry.atl.toFixed(1)}</span>
        <span><span style={{ color: C_TSB }}>●</span> TSB {(tsb >= 0 ? '+' : '') + tsb.toFixed(1)}</span>
      </div>
      {narrative && (
        <p
          className="mt-2 text-[13px]"
          style={{
            color: 'var(--color-ink-2)',
            lineHeight: 1.35,
            // Tight wrap — 280px max-width above; no further constraint here
          }}
        >
          {narrative}
        </p>
      )}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function PMCChart() {
  const { t, locale } = useLocale()
  const de = locale === 'de'
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
  const form = formStatus(latest?.tsb ?? null, de)

  // 12-day sparkline slices for each summary stat
  const last12 = series.length >= 2 ? series.slice(-12) : []
  const ctlLast12: Array<number | null> = last12.map((e) => e.ctl)
  const atlLast12: Array<number | null> = last12.map((e) => e.atl)
  const tsbLast12: Array<number | null> = last12.map((e) => e.tsb)

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
          {/* Muted eyebrow — amber decoration removed per 06.2 must_haves */}
          <span className="eyebrow">
            {t('training_load_90d')}
          </span>
          <h2
            className="num-display mt-1 leading-none"
            style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              color: 'var(--color-ink)',
            }}
          >
            {t('fitness_fatigue_form')}
          </h2>
        </div>
        <div
          className="rounded-full p-0.5 inline-flex"
          style={{
            backgroundColor: 'var(--color-paper)',
            border: '1px solid var(--color-rule)',
          }}
        >
          {SPORTS.map(({ key, label, labelDe }) => (
            <button
              key={key}
              onClick={() => setSport(key)}
              className="py-1.5 px-3.5 text-[12px] font-medium rounded-full transition-all min-h-[36px]"
              style={{
                color: sport === key ? 'var(--color-paper)' : 'var(--color-ink-2)',
                backgroundColor: sport === key ? 'var(--color-ink)' : 'transparent',
                letterSpacing: '0.02em',
              }}
            >
              {de ? labelDe : label}
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
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
        >
          <SummaryStat
            label={t('fitness_ctl')}
            value={latest.ctl.toFixed(1)}
            unit="TSS/d"
            trend={
              ctlDelta == null
                ? undefined
                : `${ctlDelta >= 0 ? '+' : ''}${ctlDelta.toFixed(1)} · 7d`
            }
            accent={C_CTL}
          >
            {/* 12-day CTL sparkline */}
            {ctlLast12.length >= 2 ? (
              <div className="mt-1">
                <Sparkline values={ctlLast12} width={84} height={20} stroke="var(--color-forest-2)" showDot />
              </div>
            ) : <div style={{ height: 0 }} />}
          </SummaryStat>
          <SummaryStat
            label={t('fatigue_atl')}
            value={latest.atl.toFixed(1)}
            unit="TSS/d"
            accent={C_ATL}
          >
            {/* 12-day ATL sparkline — amber is caution-semantic for fatigue, not decoration */}
            {atlLast12.length >= 2 ? (
              <div className="mt-1">
                <Sparkline values={atlLast12} width={84} height={20} stroke="var(--color-amber)" showDot />
              </div>
            ) : <div style={{ height: 0 }} />}
          </SummaryStat>
          <SummaryStat
            label={t('form_tsb')}
            value={(latest.tsb >= 0 ? '+' : '') + latest.tsb.toFixed(1)}
            trend={form.label}
            accent={C_TSB}
          >
            {/* 12-day TSB sparkline */}
            {tsbLast12.length >= 2 ? (
              <div className="mt-1">
                <Sparkline values={tsbLast12} width={84} height={20} stroke="var(--color-ink-blue)" showDot />
              </div>
            ) : <div style={{ height: 0 }} />}
          </SummaryStat>
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
              {de ? 'Trainingslast konnte nicht geladen werden' : "Couldn't load training load"}
            </span>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-medium"
              style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
            >
              {de ? 'Erneut' : 'Retry'}
            </button>
          </div>
        ) : series.length === 0 ? (
          <div
            className="w-full h-64 sm:h-80 min-w-0 flex flex-col items-center justify-center text-center px-6 gap-2"
          >
            <span className="eyebrow" style={{ color: 'var(--color-forest)' }}>
              {de ? 'Noch nichts geplottet' : 'Nothing plotted yet'}
            </span>
            <p
              className="text-[15px] max-w-sm"
              style={{ color: 'var(--color-ink-2)' }}
            >
              {de
                ? 'Die Kurven zeichnen sich selbst, sobald ein paar Einheiten im Logbuch sind.'
                : 'The curves paint themselves once a few sessions are in the logbook.'}
            </p>
          </div>
        ) : (
          <PmcUPlot series={series} />
        )}
      </div>

      {/* TSB tone caption — below chart canvas, not inside summary cell */}
      {latest && !isLoading && !isError && series.length > 0 && (
        <p
          className="eyebrow px-5 pb-3 sm:px-6"
          style={{ color: 'var(--color-muted)' }}
        >
          {form.tone}
        </p>
      )}

      {/* Legend at bottom */}
      {!isLoading && !isError && series.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pb-5 pt-2 sm:px-6"
          style={{ borderTop: '1px solid var(--color-rule)' }}
        >
          <LegendPip label="Fitness" sub={de ? 'CTL · 42-Tage-Last' : 'CTL · 42-day load'} color={C_CTL} />
          <LegendPip label={de ? 'Ermüdung' : 'Fatigue'} sub={de ? 'ATL · 7-Tage-Last' : 'ATL · 7-day load'} color={C_ATL} dashed />
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
          className="eyebrow text-[12px]"
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
