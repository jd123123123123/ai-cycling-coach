/**
 * RecoveryEtaCard — "fresh by Thursday" (roadmap P0.3).
 *
 * Rolls the athlete's TSB forward under the PLANNED week (recent-average
 * fallback) and answers the one question fatigue actually raises: when am I
 * fresh again? Headline landmark + a small forward area chart with an honest
 * execution-variability band. Single series → no legend; text wears ink
 * tokens; the band/line reuse the app's recovery hue.
 */
import { useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import { BatteryCharging, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLocale } from '../../contexts/LocaleContext'
import { useRecoveryEta } from '../../hooks/useRecoveryEta'

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

export default function RecoveryEtaCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useRecoveryEta()
  const [hi, setHi] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const days = data?.days ?? []

  const chart = useMemo(() => {
    if (days.length < 2) return null
    const W = 300, H = 64, pad = 6
    const vals = days.flatMap((d) => [d.tsb_low, d.tsb_high])
    const min = Math.min(-1, ...vals) - 2
    const max = Math.max(1, ...vals) + 2
    const x = (i: number) => pad + (i / (days.length - 1)) * (W - 2 * pad)
    const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (H - 2 * pad)
    const mid = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.tsb).toFixed(1)}`).join(' ')
    const band = [
      ...days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.tsb_high).toFixed(1)}`),
      ...[...days].reverse().map((d, i) => `L${x(days.length - 1 - i).toFixed(1)},${y(d.tsb_low).toFixed(1)}`),
      'Z',
    ].join(' ')
    const freshIdx = data?.fresh_on ? days.findIndex((d) => d.date === data.fresh_on) : -1
    return { W, H, x, y, mid, band, zeroY: y(0), freshIdx }
  }, [days, data?.fresh_on])

  if (!data || days.length < 2) return null

  const dayName = (iso: string) => format(parseISO(iso), 'EEEE', { locale: de ? deLocale : undefined })
  const shortDay = (iso: string) => format(parseISO(iso), de ? 'EE' : 'EEE', { locale: de ? deLocale : undefined })

  const headline = data.already_fresh
    ? data.race_sharp_on
      ? (de ? `Frisch — richtig spritzig am ${dayName(data.race_sharp_on)}` : `Fresh now — race-sharp by ${dayName(data.race_sharp_on)}`)
      : (de ? 'Du bist frisch' : "You're fresh")
    : data.fresh_on
      ? data.race_sharp_on
        ? (de ? `Frisch am ${dayName(data.fresh_on)} · spritzig am ${dayName(data.race_sharp_on)}` : `Fresh by ${dayName(data.fresh_on)} · race-sharp by ${dayName(data.race_sharp_on)}`)
        : (de ? `Frisch am ${dayName(data.fresh_on)}` : `Fresh by ${dayName(data.fresh_on)}`)
      : (de ? 'Noch im Aufbau — Frische liegt jenseits dieser Woche' : 'Still rebuilding — freshness is beyond this window')

  const basisNote = data.basis === 'plan'
    ? (de ? 'Basierend auf deinem Wochenplan' : 'Based on your planned week')
    : data.basis === 'recent-average'
      ? (de ? 'Kein Plan hinterlegt — angenommen wird deine übliche Last' : 'No plan on file — assumes your typical recent load')
      : (de ? 'Teils Plan, teils übliche Last' : 'Part plan, part typical recent load')

  const pick = (clientX: number) => {
    const el = ref.current
    if (!el || !chart) return
    const r = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    setHi(Math.round(f * (days.length - 1)))
  }
  const sel = hi != null ? days[hi] : null

  return (
    <Link to="/load-form" className="rounded-[24px] p-5 hover-card flex flex-col gap-3" style={cardStyle}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BatteryCharging size={16} style={{ color: 'var(--color-recovery)' }} />
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>
            {de ? 'ERHOLUNGS-AUSBLICK' : 'RECOVERY OUTLOOK'}
          </span>
        </div>
        <span className="hover-arrow"><ChevronRight size={16} style={{ color: 'var(--color-muted)' }} /></span>
      </div>

      <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.3 }}>{headline}</p>

      {chart && (
        <div className="flex flex-col gap-1">
          <div
            ref={ref}
            style={{ position: 'relative', width: '100%', height: chart.H, touchAction: 'none', cursor: 'pointer' }}
            onPointerMove={(e) => pick(e.clientX)}
            onPointerDown={(e) => pick(e.clientX)}
            onPointerLeave={() => setHi(null)}
          >
            {sel && (
              <div className="num-mono" style={{ position: 'absolute', top: -4, left: 0, right: 0, textAlign: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--color-ink-2)', pointerEvents: 'none' }}>
                {shortDay(sel.date)} · {de ? 'Form' : 'Form'} {sel.tsb > 0 ? '+' : ''}{sel.tsb.toFixed(0)}
                <span style={{ color: 'var(--color-muted)' }}> ({sel.tsb_low.toFixed(0)}…{sel.tsb_high > 0 ? '+' : ''}{sel.tsb_high.toFixed(0)})</span>
              </div>
            )}
            <svg viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              {/* zero (fresh boundary) gridline — recessive */}
              <line x1={0} x2={chart.W} y1={chart.zeroY} y2={chart.zeroY} stroke="var(--color-rule)" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              {/* execution-variability band */}
              <path d={chart.band} fill="color-mix(in srgb, var(--color-recovery) 14%, transparent)" />
              {/* projected form — 2px line */}
              <path d={chart.mid} fill="none" stroke="var(--color-recovery)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              {/* freshness landmark */}
              {chart.freshIdx >= 0 && (
                <circle cx={chart.x(chart.freshIdx)} cy={chart.y(days[chart.freshIdx].tsb)} r={4} fill="var(--color-recovery)" stroke="var(--color-paper-2)" strokeWidth={2} />
              )}
              {sel && hi != null && (
                <line x1={chart.x(hi)} x2={chart.x(hi)} y1={0} y2={chart.H} stroke="var(--color-ink-2)" strokeWidth={1} opacity={0.5} vectorEffect="non-scaling-stroke" />
              )}
            </svg>
          </div>
          <div className="flex justify-between">
            <span className="eyebrow" style={{ fontSize: 10, color: 'var(--color-muted)' }}>{shortDay(days[0].date)}</span>
            <span className="eyebrow" style={{ fontSize: 10, color: 'var(--color-muted)' }}>{de ? 'Form 0 = frisch' : 'Form 0 = fresh'}</span>
            <span className="eyebrow" style={{ fontSize: 10, color: 'var(--color-muted)' }}>{shortDay(days[days.length - 1].date)}</span>
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.4 }}>{basisNote}</p>
    </Link>
  )
}
