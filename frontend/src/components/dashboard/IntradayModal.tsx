import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { X, Heart, Waves, Zap } from 'lucide-react'
import { useIntradayDay } from '../../hooks/useIntraday'
import type { IntradayPoint } from '../../api/dashboard'
import { useLocale } from '../../contexts/LocaleContext'

export type IntradayMetric = 'body_battery' | 'stress' | 'hrv'

interface MetricMeta {
  key: IntradayMetric
  label: string
  labelDe: string
  unit: string
  color: string
  icon: React.ReactNode
  domain: [number, number] | null   // forced y-axis domain (null = auto)
  zones: Array<[number, number, string, string]>  // [y0, y1, fill, label]
  copy: string
  copyDe: string
}

const META: Record<IntradayMetric, MetricMeta> = {
  body_battery: {
    key: 'body_battery',
    label: 'Body battery',
    labelDe: 'Body Battery',
    unit: '/100',
    color: '#2a6147',
    icon: <Zap size={14} strokeWidth={1.8} />,
    domain: [0, 100],
    zones: [
      [0, 25, 'rgba(138, 29, 29, 0.08)', 'Drained'],
      [25, 50, 'rgba(217, 108, 26, 0.08)', 'Low'],
      [50, 75, 'rgba(42, 97, 71, 0.08)', 'Charged'],
      [75, 100, 'rgba(28, 68, 51, 0.1)', 'Peak'],
    ],
    copy: 'Garmin\u2019s composite energy reserve. Drops during stress and exertion, charges during sleep and calm periods.',
    copyDe: 'Garmins kombinierte Energiereserve. F\u00e4llt bei Stress und Anstrengung, l\u00e4dt bei Schlaf und ruhigen Phasen.',
  },
  stress: {
    key: 'stress',
    label: 'Stress',
    labelDe: 'Stress',
    unit: '/100',
    color: '#b04a0c',
    icon: <Waves size={14} strokeWidth={1.8} />,
    domain: [0, 100],
    zones: [
      [0, 25, 'rgba(28, 68, 51, 0.08)', 'Calm'],
      [25, 50, 'rgba(20, 53, 85, 0.07)', 'Balanced'],
      [50, 75, 'rgba(217, 108, 26, 0.08)', 'Active'],
      [75, 100, 'rgba(138, 29, 29, 0.08)', 'High'],
    ],
    copy: 'Derived from HRV. Lower is better; sustained highs compound into accumulated fatigue.',
    copyDe: 'Abgeleitet aus der HRV. Niedriger ist besser; anhaltende H\u00f6chstwerte summieren sich zu angesammelter Erm\u00fcdung.',
  },
  hrv: {
    key: 'hrv',
    label: 'Heart rate variability',
    labelDe: 'Herzfrequenzvariabilit\u00e4t',
    unit: 'ms',
    color: '#1c4433',
    icon: <Heart size={14} strokeWidth={1.8} />,
    domain: null,
    zones: [],
    copy: 'Overnight rMSSD readings (every 5 min during sleep). Higher + more stable = deeper parasympathetic recovery.',
    copyDe: 'N\u00e4chtliche rMSSD-Werte (alle 5 Min im Schlaf). H\u00f6her + stabiler = tiefere parasympathische Erholung.',
  },
}

const METRIC_TABS: IntradayMetric[] = ['body_battery', 'stress', 'hrv']

// ─── Chart body ──────────────────────────────────────────────────────────────

function IntradayChart({
  points,
  meta,
  iso,
}: {
  points: IntradayPoint[]
  meta: MetricMeta
  iso: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || points.length === 0) return

    const xs = points.map((p) => new Date(p.t).getTime() / 1000)
    const ys = points.map((p) => p.v)

    // Anchor the x-axis to the full day for readable hour labels
    const dayStart = new Date(`${iso}T00:00:00Z`).getTime() / 1000
    const dayEnd = dayStart + 86_400
    const paddedXs = [dayStart, ...xs, dayEnd]
    const paddedYs: (number | null)[] = [null, ...ys, null]

    const opts: uPlot.Options = {
      width: el.clientWidth || 600,
      height: 360,
      scales: {
        y: meta.domain ? { range: meta.domain } : {},
      },
      series: [
        {},
        {
          label: meta.label,
          stroke: meta.color,
          width: 2,
          fill: meta.color + '18',
          spanGaps: false,
          points: { show: false },
        },
      ],
      axes: [
        {
          stroke: '#757465',
          grid: { stroke: '#e2d8c0', width: 0.5, dash: [2, 3] },
          ticks: { show: false },
          font: '11px Geist, sans-serif',
          size: 32,
          values: (_u, splits) =>
            splits.map((ts) => format(new Date(ts * 1000), 'HH:mm')),
        },
        {
          stroke: '#757465',
          grid: { stroke: '#e2d8c0', width: 0.5, dash: [2, 3] },
          ticks: { show: false },
          font: '11px Geist, sans-serif',
          size: 40,
        },
      ],
      hooks: {
        drawClear: [
          (u) => {
            const ctx = u.ctx
            ctx.save()
            for (const [y0, y1, fillStyle] of meta.zones) {
              const yTop = u.valToPos(y1, 'y', true)
              const yBot = u.valToPos(y0, 'y', true)
              ctx.fillStyle = fillStyle
              ctx.fillRect(u.bbox.left, yTop, u.bbox.width, yBot - yTop)
            }
            ctx.restore()
          },
        ],
        setCursor: [
          (u) => {
            const tip = tooltipRef.current
            if (!tip) return
            const idx = u.cursor.idx
            if (idx == null || u.cursor.left == null || u.cursor.left < 0) {
              tip.style.opacity = '0'
              return
            }
            const ts = u.data[0][idx]
            const val = u.data[1][idx]
            if (ts == null || val == null) {
              tip.style.opacity = '0'
              return
            }
            const t = new Date((ts as number) * 1000)
            const timeLabel = format(t, 'HH:mm')
            const valueLabel = `${Math.round(val as number)} ${meta.unit}`
            tip.innerHTML = `<div class="num-mono text-[10px]" style="color:var(--color-muted);letter-spacing:0.1em;text-transform:uppercase">${timeLabel}</div><div class="num-display text-[20px] leading-tight" style="color:var(--color-ink)">${valueLabel}</div>`

            const tipWidth = 120
            const tipHeight = 52
            let left = (u.cursor.left as number) + 14
            if (left + tipWidth > el.clientWidth - 4) {
              left = (u.cursor.left as number) - tipWidth - 14
            }
            let top = (u.cursor.top as number) - tipHeight - 8
            if (top < 0) top = (u.cursor.top as number) + 12
            tip.style.left = `${left}px`
            tip.style.top = `${top}px`
            tip.style.opacity = '1'
          },
        ],
      },
      cursor: {
        drag: { x: false },
        focus: { prox: 24 },
        x: true,
        y: false,
      },
      legend: { show: false },
    }

    const data: uPlot.AlignedData = [paddedXs, paddedYs]
    const plot = new uPlot(opts, data, el)
    const ro = new ResizeObserver(() => {
      if (el) plot.setSize({ width: el.clientWidth, height: 360 })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      plot.destroy()
    }
  }, [points, meta, iso])

  return (
    <div className="relative w-full">
      <div ref={containerRef} className="w-full" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute px-3 py-2 rounded-lg"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
          boxShadow: '0 10px 26px -12px rgba(20,24,17,0.28)',
          opacity: 0,
          transition: 'opacity 80ms ease',
          zIndex: 10,
          whiteSpace: 'nowrap',
        }}
      />
    </div>
  )
}

// ─── Main modal ──────────────────────────────────────────────────────────────

interface IntradayModalProps {
  open: boolean
  onClose: () => void
  iso: string | null   // yyyy-mm-dd
  initialMetric: IntradayMetric
}

export default function IntradayModal({
  open, onClose, iso, initialMetric,
}: IntradayModalProps) {
  const { locale } = useLocale()
  const [metric, setMetric] = useState<IntradayMetric>(initialMetric)

  useEffect(() => {
    if (open) setMetric(initialMetric)
  }, [open, initialMetric])

  const { data, isLoading, isError } = useIntradayDay(open && iso ? iso : null)

  // Body scroll lock + Escape to close
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const points = useMemo(() => {
    if (!data) return [] as IntradayPoint[]
    return data[metric] ?? []
  }, [data, metric])

  // Stats strip
  const values = points.map((p) => p.v)
  const min = values.length > 0 ? Math.min(...values) : null
  const max = values.length > 0 ? Math.max(...values) : null
  const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null

  if (!open || !iso) return null

  const title = format(parseISO(iso), 'EEEE · d MMMM yyyy', locale === 'de' ? { locale: de } : undefined)
  const meta = META[metric]

  const content = (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(20,24,17,0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="intraday-modal-title"
    >
      <div
        className="paper-grain bg-[var(--color-paper-2)] w-full sm:max-w-3xl sm:rounded-[20px] rounded-t-[20px] shadow-2xl max-h-[92vh] overflow-y-auto border border-[var(--color-rule)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-7">
          <div className="min-w-0">
            <span
              className="eyebrow"
              style={{ color: 'var(--color-amber)' }}
            >
              {locale === 'de' ? 'Tagesverlauf · über den Tag' : 'Intraday · throughout the day'}
            </span>
            <h2
              id="intraday-modal-title"
              className="num-display mt-1 leading-none dashboard-break-words"
              style={{
                fontSize: 'clamp(22px, 3vw, 30px)',
                color: 'var(--color-ink)',
              }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
            style={{
              color: 'var(--color-ink-2)',
              border: '1px solid var(--color-rule)',
              backgroundColor: 'var(--color-paper)',
            }}
            aria-label={locale === 'de' ? 'Schließen' : 'Close'}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Metric tabs */}
        <div className="px-5 sm:px-8 mt-4">
          <div
            className="rounded-full p-0.5 inline-flex flex-wrap gap-0.5"
            style={{
              backgroundColor: 'rgba(20, 24, 17, 0.05)',
              border: '1px solid var(--color-rule)',
            }}
          >
            {METRIC_TABS.map((m) => {
              const count = data?.[m]?.length ?? 0
              const disabled = count === 0 && !isLoading
              return (
                <button
                  key={m}
                  disabled={disabled}
                  onClick={() => setMetric(m)}
                  className="py-2 px-3.5 text-[12px] font-medium rounded-full transition-all inline-flex items-center gap-1.5 min-h-[40px] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    color: metric === m ? 'var(--color-paper)' : 'var(--color-ink-2)',
                    backgroundColor: metric === m ? 'var(--color-ink)' : 'transparent',
                    letterSpacing: '0.02em',
                  }}
                >
                  {META[m].icon}
                  {locale === 'de' ? META[m].labelDe : META[m].label}
                  {count > 0 && metric !== m && (
                    <span className="num-mono opacity-60 text-[10px]">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Stats strip */}
        {points.length > 0 && (
          <div
            className="mx-5 sm:mx-8 mt-5 flex items-stretch divide-x"
            style={{
              border: '1px solid var(--color-rule)',
              borderRadius: 14,
              backgroundColor: 'rgba(20,24,17,0.02)',
            }}
          >
            {[
              ['min', min],
              [locale === 'de' ? 'Ø' : 'avg', avg],
              ['max', max],
            ].map(([label, v]) => (
              <div key={label as string} className="flex-1 px-4 py-3">
                <div className="eyebrow">{label}</div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span
                    className="num-display leading-none"
                    style={{ fontSize: 26, color: 'var(--color-ink)' }}
                  >
                    {v != null ? Math.round(v as number) : '—'}
                  </span>
                  <span
                    className="num-mono text-[11px]"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {meta.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chart body */}
        <div className="px-3 sm:px-6 pt-5 pb-3 min-w-0">
          {isLoading ? (
            <div
              className="w-full h-[360px] rounded-[14px] animate-pulse flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-rule)' }}
            >
              <span
                className="text-[14px]"
                style={{ color: 'var(--color-muted)' }}
              >
                {locale === 'de'
                  ? 'Wird von Garmin geladen — erstmalige Ladevorgänge können ~10 Sekunden dauern'
                  : 'Fetching from Garmin — first-time loads can take ~10 seconds'}
              </span>
            </div>
          ) : isError ? (
            <div
              className="w-full h-[360px] flex items-center justify-center text-center px-6"
            >
              <p
                className="text-[15px] max-w-sm"
                style={{ color: 'var(--color-alert)' }}
              >
                {locale === 'de'
                  ? 'Tagesverlaufsdaten konnten nicht geladen werden. Versuche es gleich erneut.'
                  : 'Couldn’t fetch intraday data. Try again in a moment.'}
              </p>
            </div>
          ) : points.length === 0 ? (
            <div
              className="w-full h-[360px] flex items-center justify-center text-center px-6"
            >
              <p
                className="text-[15px] max-w-sm"
                style={{ color: 'var(--color-muted)' }}
              >
                {locale === 'de'
                  ? `Keine ${meta.labelDe}-Werte für diesen Tag. Entweder wurde die Uhr nicht getragen oder Garmin hat nichts aufgezeichnet.`
                  : `No ${meta.label.toLowerCase()} readings for this day. Either the watch wasn’t worn or Garmin didn’t record it.`}
              </p>
            </div>
          ) : (
            <IntradayChart points={points} meta={meta} iso={iso} />
          )}
        </div>

        {/* Footer copy */}
        <div className="px-5 sm:px-8 pb-7 pt-2 flex items-start justify-between gap-3 flex-wrap">
          <p
            className="text-[12px] leading-relaxed max-w-xl"
            style={{ color: 'var(--color-ink-2)' }}
          >
            {locale === 'de' ? meta.copyDe : meta.copy}
          </p>
          {data?.fetched_live && (
            <span
              className="num-mono text-[10px] px-2 py-1 rounded whitespace-nowrap"
              style={{
                color: 'var(--color-forest)',
                backgroundColor: 'rgba(28, 68, 51, 0.08)',
                border: '1px solid rgba(28, 68, 51, 0.2)',
              }}
            >
              {locale === 'de' ? 'frisch geladen' : 'freshly fetched'}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
