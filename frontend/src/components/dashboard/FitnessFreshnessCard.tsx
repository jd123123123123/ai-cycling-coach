/**
 * FitnessFreshnessCard — the pen's "Fitness & Frische" TSB gauge (from V3 ·
 * Load & Form), reused on Today in place of the raw training-load card.
 *
 * A form/freshness gauge bound to real CTL/ATL/TSB: the marker sits on a
 * overreached→sweet-spot→fresh band, with the CTL/ATL/ramp numbers below.
 * Honest absence: with no PMC at all there is nothing to show. A static,
 * self-contained snapshot — the deeper load story now lives inline on Today.
 */
import { TrendingUp, TrendingDown, Zap } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { classifyForm } from '../../utils/loadMetrics'
import { glassCardStyle, GLASS_CARD_MARKER } from './glassCard'

const DASH = '—'
const cardStyle = glassCardStyle

// Gauge scale — matches the Load & Form gauge exactly.
const TSB_MIN = -30
const TSB_MAX = 25
const posTsb = (v: number) => Math.max(0, Math.min(1, (v - TSB_MIN) / (TSB_MAX - TSB_MIN)))
const TSB_SEGS: { color: string; to: number }[] = [
  { color: 'var(--color-move)', to: -15 },
  { color: 'var(--color-amber)', to: -5 },
  { color: 'var(--color-recovery)', to: 10 },
  { color: 'var(--color-strain)', to: TSB_MAX },
]

const showTrend = (v: number | null) => (v == null ? DASH : `${v >= 0 ? '+' : ''}${v}`)

export default function FitnessFreshnessCard({ ctl, atl, tsb, dCtl7 }: {
  ctl: number | null
  atl: number | null
  tsb: number | null
  /** 7-day CTL delta — doubles as the weekly ramp. */
  dCtl7: number | null
}) {
  const { locale } = useLocale()
  const de = locale === 'de'

  // Honest absence: a single real number (CTL or ATL) is enough to render.
  if (ctl == null && atl == null) return null

  const form = classifyForm(tsb, de)
  const ctlDisp = ctl != null ? Math.round(ctl) : null
  const atlDisp = atl != null ? Math.round(atl) : null

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-4" style={cardStyle} {...GLASS_CARD_MARKER}>
      {/* Head — title + TSB value + form pill */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>
            {de ? 'Fitness & Frische' : 'Fitness & Freshness'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{form.sub}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="num-display" style={{ fontSize: 26, fontWeight: 700, color: form.color }}>
            {tsb == null ? DASH : showTrend(Math.round(tsb))}
          </span>
          <span
            className="inline-flex items-center rounded-full"
            style={{ padding: '3px 10px', fontSize: 11, fontWeight: 700, color: form.color, background: `color-mix(in srgb, ${form.color} 15%, transparent)` }}
          >
            {form.label}
          </span>
        </div>
      </div>

      {/* Gauge */}
      <div>
        <div className="relative" style={{ height: 26 }}>
          <div className="absolute flex overflow-hidden" style={{ top: 8, left: 0, right: 0, height: 10, borderRadius: 5, gap: 2 }}>
            {TSB_SEGS.map((s, i) => {
              const from = i === 0 ? TSB_MIN : TSB_SEGS[i - 1].to
              const w = (posTsb(s.to) - posTsb(from)) * 100
              return <div key={i} style={{ width: `${w}%`, height: '100%', background: s.color }} />
            })}
          </div>
          {tsb != null && (
            <div className="absolute" style={{ top: 0, left: `calc(${posTsb(tsb) * 100}% - 3px)`, width: 6, height: 26, borderRadius: 3, background: 'var(--color-ink)', border: '2px solid var(--color-paper-2)' }} />
          )}
        </div>
        <div className="flex justify-between" style={{ marginTop: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'Überlastet' : 'Overreached'}</span>
          <span style={{ fontSize: 11, color: 'var(--color-recovery)' }}>{de ? 'Optimal' : 'Sweet spot'}</span>
          <span style={{ fontSize: 11, color: 'var(--color-strain)' }}>{de ? 'Frisch' : 'Fresh'}</span>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--color-rule)' }} />

      {/* CTL / ATL / Ramp */}
      <div className="flex justify-between">
        {[
          {
            label: de ? 'FITNESS · CTL' : 'FITNESS · CTL', value: ctlDisp ?? DASH,
            chip: dCtl7 != null ? { text: `${showTrend(Math.round(dCtl7))} ${de ? 'Wo' : 'wk'}`, color: dCtl7 < 0 ? 'var(--color-muted)' : 'var(--color-strain)', Icon: dCtl7 < 0 ? TrendingDown : TrendingUp } : null,
          },
          {
            label: de ? 'ERMÜDUNG · ATL' : 'FATIGUE · ATL', value: atlDisp ?? DASH,
            chip: atlDisp != null ? { text: de ? 'akut' : 'acute', color: 'var(--color-amber)', Icon: Zap } : null,
          },
          {
            label: de ? 'AUFBAU/WO' : 'RAMP/WK', value: dCtl7 != null ? showTrend(Math.round(dCtl7)) : DASH,
            chip: null as { text: string; color: string; Icon: typeof Zap } | null,
          },
        ].map((c) => (
          <div key={c.label} className="flex flex-col gap-1">
            <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{c.label}</span>
            <div className="flex items-center gap-1.5">
              <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-ink)' }}>{c.value}</span>
              {c.chip && (
                <span className="inline-flex items-center gap-0.5 rounded-full" style={{ padding: '2px 6px', background: 'var(--color-surface-2)', fontSize: 10, fontWeight: 600, color: c.chip.color }}>
                  <c.chip.Icon size={11} /> {c.chip.text}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
