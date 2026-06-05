import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { subDays } from 'date-fns'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { efficiencyFactorSeries, movingAverage } from '../../utils/advanced-metrics'
import { useLocale } from '../../contexts/LocaleContext'

type Loc = 'en' | 'de'

const C_DOTS = '#b04a0c'    // amber — per-ride dots
const C_MA   = '#1c4433'    // forest — moving average line

// Render EF scatter dots without connecting lines
function getDotsPath(): uPlot.Series.PathBuilder {
  // Return a custom path builder that only draws dots
  return () => null
}

function EfUPlot({ efPoints, maPoints, locale }: {
  efPoints: Array<{ date: string; ef: number }>
  maPoints: Array<{ date: string; value: number | null }>
  locale: Loc
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || efPoints.length === 0) return

    const el = containerRef.current
    const width = el.clientWidth || 600

    const timestamps = efPoints.map((p) => new Date(p.date).getTime() / 1000)

    // Align MA values to the same x-axis timestamps
    const maValues = efPoints.map((p) => {
      const match = maPoints.find((m) => m.date === p.date)
      return match?.value ?? null
    })

    const opts: uPlot.Options = {
      width,
      height: 200,
      series: [
        {},
        {
          label: 'EF per ride',
          stroke: C_DOTS,
          fill: C_DOTS + '40',
          width: 0,
          // Draw only dots, no connecting line
          paths: getDotsPath(),
          points: {
            show: true,
            size: 8,
            fill: C_DOTS,
            stroke: '#f3ecdc',
            width: 1.5,
          },
        },
        {
          label: '28-day avg',
          stroke: C_MA,
          width: 2,
          points: { show: false },
        },
      ],
      axes: [
        {
          stroke: '#757465',
          grid: { show: false },
          ticks: { show: false },
          font: '11px Geist, sans-serif',
          values: (_u, splits) =>
            splits.map((ts) => {
              const d = new Date(ts * 1000)
              return `${d.getDate()} ${d.toLocaleString(locale === 'de' ? 'de-DE' : 'default', { month: 'short' })}`
            }),
        },
        {
          stroke: '#757465',
          grid: {
            stroke: '#e2d8c0',
            width: 0.5,
            dash: [2, 3],
          },
          ticks: { show: false },
          font: '11px Geist, sans-serif',
          size: 44,
        },
      ],
      cursor: {
        drag: { x: false },
        focus: { prox: 16 },
      },
      legend: { show: false },
    }

    const data: uPlot.AlignedData = [
      timestamps,
      efPoints.map((p) => p.ef),
      maValues as (number | null)[],
    ]

    const plot = new uPlot(opts, data, el)

    const ro = new ResizeObserver(() => {
      if (el) plot.setSize({ width: el.clientWidth, height: 200 })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      plot.destroy()
    }
  }, [efPoints, maPoints, locale])

  return <div ref={containerRef} className="w-full min-w-0" />
}

export default function EfficiencyTrend() {
  const { locale } = useLocale()
  const today = new Date()
  const startDate = subDays(today, 84)
  const { data: activitiesData, isLoading } = useActivitiesRange(startDate, today)

  const activities = activitiesData?.activities ?? []
  const efPoints = efficiencyFactorSeries(activities)
  const maPoints = movingAverage(efPoints, 28)

  const isEmpty = efPoints.length < 3

  return (
    <div
      className="paper-grain rounded-[20px] p-5 sm:p-6 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="mb-1">
        <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
          {locale === 'de' ? '12 Wochen · Aerober Motor' : '12 weeks · Aerobic engine'}
        </span>
        <h2
          className="num-display mt-1 leading-none"
          style={{ fontSize: 'clamp(20px, 2.5vw, 26px)', color: 'var(--color-ink)' }}
        >
          {locale === 'de' ? 'Effizienzfaktor' : 'Efficiency Factor'}
        </h2>
      </div>

      <p className="text-[12px] leading-relaxed mb-4" style={{ color: 'var(--color-muted)' }}>
        {locale === 'de'
          ? 'EF = normalisierte Leistung ÷ durchschnittliche Herzfrequenz. Über Wochen steigend = tiefere aerobe Basis.'
          : 'EF = normalized power ÷ average heart rate. Rising over weeks = deeper aerobic base.'}
      </p>

      {isLoading ? (
        <div
          className="w-full h-[200px] rounded-[10px] animate-pulse"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
      ) : isEmpty ? (
        <div className="w-full h-[200px] flex flex-col items-center justify-center text-center gap-2 px-4">
          <span className="eyebrow" style={{ color: 'var(--color-forest)' }}>
            {locale === 'de' ? 'Nicht genug Daten' : 'Not enough data'}
          </span>
          <p className="text-[13px] leading-relaxed max-w-xs" style={{ color: 'var(--color-ink-2)' }}>
            {locale === 'de'
              ? 'Benötigt mindestens 3 Radfahrten mit Leistung und Herzfrequenz.'
              : 'Needs at least 3 cycling rides with both power and heart rate.'}
          </p>
        </div>
      ) : (
        <>
          <EfUPlot efPoints={efPoints} maPoints={maPoints} locale={locale} />
          <div className="flex items-center gap-5 mt-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: C_DOTS }}
              />
              <span className="eyebrow">{locale === 'de' ? 'Pro Fahrt' : 'Per ride'}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="18" height="4" viewBox="0 0 18 4" aria-hidden>
                <line x1="1" y1="2" x2="17" y2="2" stroke={C_MA} strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="eyebrow">{locale === 'de' ? '28-Tage-Ø' : '28-day avg'}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
