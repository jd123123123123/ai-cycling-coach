import { useMemo } from 'react'
import { startOfWeek, subWeeks, endOfWeek, isWithinInterval } from 'date-fns'
import { usePMC } from '../../hooks/usePMC'
import { useCountUp } from '../../hooks/useCountUp'
import { useLocale } from '../../contexts/LocaleContext'

// Ramp rate = week-over-week TSS change vs 4-week rolling average.
// Coggan / Skiba safe-zone guidance:
//   < 5 %  → green: sustainable progression
//   5–15%  → amber: watch recovery markers
//   > 15%  → red: overreaching risk, back off
//
// The underlying numbers come from the PMC (daily_tss sums).

const GREEN_MAX = 5
const AMBER_MAX = 15

function tssForWeek(
  entries: Array<{ date: string; daily_tss: number }>,
  weekIndex: number,
): number {
  const today = new Date()
  const weekStart = startOfWeek(subWeeks(today, weekIndex), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  return entries
    .filter((e) => isWithinInterval(new Date(e.date), { start: weekStart, end: weekEnd }))
    .reduce((s, e) => s + (e.daily_tss ?? 0), 0)
}

export default function RampRate() {
  const { locale } = useLocale()
  const { data, isLoading } = usePMC(35)

  const { thisWeek, rampRate, label, zone } = useMemo(() => {
    const entries = data?.entries ?? []
    const w0 = Math.round(tssForWeek(entries, 0))
    const w1 = Math.round(tssForWeek(entries, 1))
    const w2 = Math.round(tssForWeek(entries, 2))
    const w3 = Math.round(tssForWeek(entries, 3))
    const avg = (w1 + w2 + w3) / 3

    const rr = avg > 0 ? Math.round(((w0 - avg) / avg) * 100) : null

    let z: 'green' | 'amber' | 'red' = 'green'
    let lbl = locale === 'de' ? 'Nachhaltig' : 'Sustainable'
    if (rr != null) {
      if (Math.abs(rr) > AMBER_MAX) { z = 'red'; lbl = locale === 'de' ? 'Überlastungsrisiko' : 'Overreaching risk' }
      else if (Math.abs(rr) > GREEN_MAX) { z = 'amber'; lbl = locale === 'de' ? 'Erholung beobachten' : 'Watch recovery' }
    }

    return { thisWeek: w0, rampRate: rr, label: lbl, zone: z }
  }, [data, locale])

  const countedTSS = useCountUp(thisWeek, { duration: 700, enabled: !isLoading })

  const zoneColor = { green: '#30D158', amber: 'var(--color-amber)', red: 'var(--color-alert)' }[zone]

  // Gauge: -25% to +25% range, clipped
  const gaugeMin = -25
  const gaugeMax = 25
  const gaugeRange = gaugeMax - gaugeMin
  const clampedRamp = rampRate != null ? Math.max(gaugeMin, Math.min(gaugeMax, rampRate)) : 0
  const markerPct = ((clampedRamp - gaugeMin) / gaugeRange) * 100

  if (isLoading) {
    return (
      <div
        className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        <div className="h-4 w-36 rounded animate-pulse mb-3" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="h-8 w-full rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      </div>
    )
  }

  // Not enough training history for a week-over-week comparison (prior weeks
  // averaged zero TSS). Render an empty-state card rather than returning null —
  // a bare null would orphan the sibling card in the 2-up grid, leaving a
  // half-width card floating beside an empty gutter.
  if (rampRate === null) {
    return (
      <div
        className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
          {locale === 'de' ? 'Anstiegsrate · diese Woche' : 'Ramp rate · this week'}
        </span>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          {locale === 'de'
            ? 'Noch nicht genug Trainingsverlauf — logge ein paar Wochen, um deinen Belastungstrend von Woche zu Woche zu sehen.'
            : 'Not enough training history yet — log a few weeks to see your week-over-week load trend.'}
        </p>
      </div>
    )
  }

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
            {locale === 'de' ? 'Anstiegsrate · diese Woche' : 'Ramp rate · this week'}
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span
              className="num-display leading-none"
              style={{ fontSize: 'clamp(20px, 2.6vw, 26px)', color: 'var(--color-ink)' }}
            >
              {countedTSS} TSS
            </span>
            <span
              className="num-mono text-[13px] font-semibold"
              style={{ color: zoneColor }}
            >
              {rampRate >= 0 ? '+' : ''}{rampRate}%
            </span>
          </div>
        </div>
        <span
          className="eyebrow mt-1"
          style={{ color: zoneColor, letterSpacing: '0.18em' }}
        >
          {label}
        </span>
      </div>

      {/* Traffic-light gauge bar */}
      <div className="relative mb-2" style={{ height: 8, borderRadius: 4, overflow: 'hidden' }}>
        {/* Background zones */}
        <div className="absolute inset-0 flex">
          {/* Negative ramp: left 50% */}
          <div style={{ flex: 1, background: 'linear-gradient(to right, rgba(255,69,58,0.25), rgba(255,159,10,0.20) 60%, rgba(48,209,88,0.15))' }} />
          {/* Positive ramp: right 50% */}
          <div style={{ flex: 1, background: 'linear-gradient(to right, rgba(48,209,88,0.15), rgba(255,159,10,0.20) 40%, rgba(255,69,58,0.25))' }} />
        </div>
        {/* Zone dividers */}
        {/* Safe zone markers at ±5% and ±15% */}
        {[
          ((-15 - gaugeMin) / gaugeRange) * 100,
          ((-GREEN_MAX - gaugeMin) / gaugeRange) * 100,
          ((GREEN_MAX - gaugeMin) / gaugeRange) * 100,
          ((AMBER_MAX - gaugeMin) / gaugeRange) * 100,
        ].map((pct, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px"
            style={{ left: `${pct}%`, backgroundColor: 'var(--color-rule)' }}
          />
        ))}
        {/* Center line */}
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{ left: '50%', backgroundColor: 'var(--color-rule)', opacity: 0.6 }}
        />
        {/* Marker */}
        <div
          className="absolute top-0 bottom-0 transition-all duration-700"
          style={{
            left: `calc(${markerPct}% - 3px)`,
            width: 6,
            borderRadius: 3,
            backgroundColor: zoneColor,
            boxShadow: `0 0 6px ${zoneColor}88`,
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="num-mono text-[9px]" style={{ color: 'var(--color-alert)', opacity: 0.7 }}>
          {locale === 'de' ? 'übertreiben' : 'overdoing'}
        </span>
        <span className="num-mono text-[9px]" style={{ color: '#30D158', opacity: 0.7 }}>
          {locale === 'de' ? 'sichere Zone' : 'safe zone'}
        </span>
        <span className="num-mono text-[9px]" style={{ color: 'var(--color-alert)', opacity: 0.7 }}>
          {locale === 'de' ? 'Spitze' : 'spiking'}
        </span>
      </div>
    </div>
  )
}
