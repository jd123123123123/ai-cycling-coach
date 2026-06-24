import { useMemo } from 'react'
import { BatteryLow, Battery } from 'lucide-react'
import { useWbalTrace } from '../../hooks/useWbalTrace'
import { useLocale } from '../../contexts/LocaleContext'

// The "anaerobic battery": W′-balance draining and refilling across the
// athlete's most-depleting recent ride. Above the empty line = reserve left;
// dipping to/below 0 = a maximal effort that emptied the tank (W′ depletion).

const VB_W = 340
const VB_H = 110
const PAD_L = 6
const PAD_R = 6
const PAD_T = 10
const PAD_B = 16

export default function WBalanceTraceCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data, isLoading } = useWbalTrace()

  const geo = useMemo(() => {
    const trace = data?.trace
    if (!trace || trace.length < 2 || !data?.duration_s) return null
    const dur = data.duration_s
    const minPct = Math.min(0, ...trace.map((p) => p.pct))
    const ymax = 100
    const ymin = minPct
    const px = (t: number) => PAD_L + (t / dur) * (VB_W - PAD_L - PAD_R)
    const py = (pct: number) => PAD_T + (1 - (pct - ymin) / (ymax - ymin)) * (VB_H - PAD_T - PAD_B)
    const line = trace.map((p) => `${px(p.t)},${py(p.pct)}`).join(' ')
    const area = `${px(trace[0].t)},${py(ymin)} ${line} ${px(trace[trace.length - 1].t)},${py(ymin)}`
    return { line, area, zeroY: py(0), emptyShown: ymin < 0 }
  }, [data])

  if (isLoading) {
    return (
      <div className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
        <div className="h-4 w-44 rounded animate-pulse mb-3" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="h-24 w-full rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      </div>
    )
  }
  if (!data?.available || !geo) return null

  const kj = ((data.w_prime_j ?? 0) / 1000).toFixed(1)
  const depleted = data.depleted

  return (
    <div className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="eyebrow flex items-center gap-1.5" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
          {depleted ? <BatteryLow size={12} color="var(--color-amber)" /> : <Battery size={12} color="var(--color-forest-2)" />}
          {de ? 'ANAEROBE BATTERIE' : 'ANAEROBIC BATTERY'}
        </span>
        <span className="eyebrow num-mono" style={{ color: 'var(--color-muted)', fontSize: 9 }}>
          W′ {kj} kJ · CP {Math.round(data.cp_watts ?? 0)}W
        </span>
      </div>

      <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-ink-2)' }}>
        {data.title} <span style={{ color: 'var(--color-muted)' }}>· {data.date}</span>
      </p>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full mt-2" style={{ display: 'block' }} role="img" aria-label="W-prime balance trace">
        <defs>
          <linearGradient id="wbal-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-forest-2)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-forest-2)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Empty line (0 % reserve) */}
        <line x1={PAD_L} y1={geo.zeroY} x2={VB_W - PAD_R} y2={geo.zeroY} stroke="#FF453A" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
        <text x={PAD_L} y={geo.zeroY - 3} className="num-mono" style={{ fontSize: 8, fill: '#FF453A' }}>{de ? 'leer' : 'empty'}</text>
        <polygon points={geo.area} fill="url(#wbal-area)" />
        <polyline points={geo.line} fill="none" stroke="var(--color-forest-2)" strokeWidth="2" strokeLinejoin="round" />
      </svg>

      <p className="text-[11px] leading-relaxed mt-2" style={{ color: 'var(--color-muted)', maxWidth: '46ch' }}>
        {depleted
          ? (de
              ? `Du hast deine anaerobe Reserve auf dieser Fahrt komplett geleert (bis ${data.min_kj} kJ) — ein echter Maximalaufwand.`
              : `You fully emptied your anaerobic reserve on this ride (to ${data.min_kj} kJ) — a genuine maximal effort.`)
          : (de
              ? 'Die anaerobe Reserve (W′) entlädt sich über der Critical Power und lädt darunter wieder auf.'
              : 'Your anaerobic reserve (W′) drains above Critical Power and recharges below it.')}
      </p>
    </div>
  )
}
