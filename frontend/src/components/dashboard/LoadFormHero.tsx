import { TrendingUp, TrendingDown, Zap, Check } from 'lucide-react'
import { usePMC } from '../../hooks/usePMC'
import { useLocale } from '../../contexts/LocaleContext'

// Load & Form hero — rebuilt 1:1 from pencil-new.pen "Screen · Load & Form".
// Big TSB number + a four-zone form gauge (Overreach → Overload → Optimal →
// Fresh) with a live marker, then the CTL / ATL tiles. Fed by our real PMC.

// TSB → form state. Domain [-30, +25] drives both the gauge segments and the
// marker so the marker always lands in the zone whose colour matches the state.
const TSB_MIN = -30
const TSB_MAX = 25
const BOUND = { overload: -15, optimal: -5, fresh: 10 } // zone edges in TSB
const pos = (tsb: number) => Math.max(0, Math.min(1, (tsb - TSB_MIN) / (TSB_MAX - TSB_MIN)))

type State = { key: string; label: string; labelDe: string; color: string; Icon: typeof TrendingUp }
function formState(tsb: number): State {
  if (tsb <= BOUND.overload) return { key: 'overreached', label: 'Overreached', labelDe: 'Überlastet', color: 'var(--color-move)', Icon: TrendingDown }
  if (tsb <= BOUND.optimal) return { key: 'building', label: 'Building', labelDe: 'Aufbauend', color: 'var(--color-amber)', Icon: Zap }
  if (tsb <= BOUND.fresh) return { key: 'balanced', label: 'Race-ready', labelDe: 'Wettkampfbereit', color: 'var(--color-recovery)', Icon: Check }
  return { key: 'fresh', label: 'Race-fresh', labelDe: 'Frisch', color: 'var(--color-recovery)', Icon: TrendingUp }
}

const SEGMENTS = [
  { color: 'var(--color-move)', to: BOUND.overload },
  { color: 'var(--color-amber)', to: BOUND.optimal },
  { color: 'var(--color-recovery)', to: BOUND.fresh },
  { color: 'var(--color-strain)', to: TSB_MAX },
]

function DeltaPill({ value, unit, color, Icon }: { value: string; unit: string; color: string; Icon: typeof TrendingUp }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: 'var(--color-surface-2)' }}>
      <Icon size={12} strokeWidth={2.4} style={{ color }} />
      <span style={{ fontSize: 11, fontWeight: 600, color }}>{value} {unit}</span>
    </span>
  )
}

function FitFatTile({ label, value, pill }: { label: string; value: number; pill: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow" style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--color-muted)' }}>{label}</span>
      <div className="flex items-center gap-2">
        <span className="num-display" style={{ fontSize: 26, color: 'var(--color-ink)' }}>{Math.round(value)}</span>
        {pill}
      </div>
    </div>
  )
}

export default function LoadFormHero() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = usePMC(90)
  const series = data?.entries ?? []
  if (series.length === 0) return null

  const latest = series[series.length - 1]
  const prevWeek = series.length >= 8 ? series[series.length - 8] : series[0]
  const tsb = latest.tsb
  const ctl = latest.ctl
  const atl = latest.atl
  const dCtl7 = Math.round(latest.ctl - prevWeek.ctl)
  const dAtl7 = Math.round(latest.atl - prevWeek.atl)
  const st = formState(tsb)
  const markerPct = pos(tsb) * 100

  return (
    <div className="paper-grain rounded-[24px] p-[22px] flex flex-col gap-5" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      {/* Big TSB + state pill */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="eyebrow" style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{de ? 'Form · TSB' : 'Form · TSB'}</span>
          <span className="num-display" style={{ fontSize: 52, lineHeight: 1, color: st.color }}>{tsb >= 0 ? '+' : ''}{Math.round(tsb)}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 self-start" style={{ background: `color-mix(in srgb, ${st.color} 15%, transparent)` }}>
          <st.Icon size={16} strokeWidth={2.4} style={{ color: st.color }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: st.color }}>{de ? st.labelDe : st.label}</span>
        </span>
      </div>

      {/* Four-zone form gauge + marker */}
      <div className="flex flex-col gap-2">
        <div className="relative" style={{ height: 12 }}>
          <div className="absolute inset-0 flex gap-0.5 overflow-hidden" style={{ borderRadius: 6 }}>
            {SEGMENTS.map((s, i) => {
              const from = i === 0 ? TSB_MIN : SEGMENTS[i - 1].to
              const w = (pos(s.to) - pos(from)) * 100
              return <div key={i} style={{ width: `${w}%`, background: s.color }} />
            })}
          </div>
          <div className="absolute" style={{ left: `${markerPct}%`, top: -8, transform: 'translateX(-50%)', width: 6, height: 28, borderRadius: 3, background: '#FFFFFF', border: '2px solid var(--color-paper-2)' }} />
        </div>
        <div className="flex justify-between" style={{ fontSize: 11, fontWeight: 500 }}>
          <span style={{ color: 'var(--color-muted)' }}>{de ? 'Überlastet' : 'Overreached'}</span>
          <span style={{ color: 'var(--color-muted)' }}>{de ? 'Optimal' : 'Optimal'}</span>
          <span style={{ color: 'var(--color-strain)' }}>{de ? 'Frisch' : 'Fresh'}</span>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--color-rule)' }} />

      {/* CTL + ATL */}
      <div className="flex justify-between">
        <FitFatTile label={de ? 'Fitness · CTL' : 'Fitness · CTL'} value={ctl}
          pill={<DeltaPill value={`${dCtl7 >= 0 ? '+' : ''}${dCtl7}`} unit={de ? 'Woche' : 'this week'} color="var(--color-strain)" Icon={dCtl7 >= 0 ? TrendingUp : TrendingDown} />} />
        <FitFatTile label={de ? 'Ermüdung · ATL' : 'Fatigue · ATL'} value={atl}
          pill={<DeltaPill value={dAtl7 >= 0 ? (de ? 'steigend' : 'building') : (de ? 'fallend' : 'easing')} unit="" color="var(--color-amber)" Icon={dAtl7 >= 0 ? Zap : TrendingDown} />} />
      </div>
    </div>
  )
}
