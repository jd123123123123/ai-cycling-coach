import { motion, useReducedMotion } from 'motion/react'
import { T, FONT, EASE } from './w3tokens'
import type { FormPoint, TrainingImpact } from './w3TrainingImpact'

export function DailyBars({ values, color }: { values: number[]; color: string }) {
  const lo = Math.min(0, ...values), hi = Math.max(1, ...values)
  const y = (n: number) => 3 + (hi - n) / (hi - lo) * 29
  const x = (i: number) => 7 + i * 12
  return <svg aria-hidden viewBox="0 0 86 36" width="100%" height="36" style={{ display: 'block' }}>
    <line x1="0" x2="86" y1={y(0)} y2={y(0)} stroke={T.rule} />
    {values.map((v, i) => <rect key={i} x={x(i) - 4} y={Math.min(y(v), y(0))} width="8" height={Math.max(1.5, Math.abs(y(v) - y(0)))} rx="2" fill={color} opacity={i === values.length - 1 ? 1 : 0.28 + i * 0.07} />)}
    {values.length > 1 && <path d={values.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ')} stroke={color} fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>
}

export function TrainingImpactChart({ history, impact, selected, onSelect }: {
  history: FormPoint[]; impact?: TrainingImpact; selected: number; onSelect: (n: number) => void
}) {
  const reduce = useReducedMotion()
  const transition = { duration: reduce ? 0 : 0.32, ease: EASE }
  const future = impact?.plan ?? []
  const points = [...history, ...future.slice(1)]
  const W = 310, H = 222, top = 22, bottom = 192
  const domain = [...history, ...future]
  const min = Math.min(...domain.flatMap(p => [p.ctl, p.atl]))
  const max = Math.max(...domain.flatMap(p => [p.ctl, p.atl]))
  const padding = Math.max(5, max - min) * 0.15
  const lo = Math.max(0, Math.floor(min - padding))
  const hi = Math.max(lo + 5, Math.ceil(max + padding))
  const x = (i: number) => 8 + i / Math.max(1, points.length - 1) * (W - 33)
  const y = (v: number) => bottom - (v - lo) / (hi - lo) * (bottom - top)
  const path = (ps: FormPoint[], key: 'ctl' | 'atl', offset: number, mult = 1) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(i + offset).toFixed(2)} ${y(p[key] * mult).toFixed(2)}`).join(' ')
  const boundary = history.length - 1
  const chartPoints = [...history.slice(0, -1), ...(future.length ? future : history.slice(-1))]
  const focus = selected < history.length ? history[selected] : future[selected - boundary]
  const dateLabel = (p: FormPoint) => p.date ? new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' }).format(new Date(`${p.date}T12:00:00`)) : ''
  const futurePath = (ps: FormPoint[], key: 'ctl' | 'atl') => `M${x(boundary)} ${y(history[boundary][key])} ` + path(ps, key, boundary).replace(/^M/, 'L')
  return <div role="slider" tabIndex={0} aria-label="Tag im Verlauf auswählen" aria-valuemin={0} aria-valuemax={points.length - 1} aria-valuenow={selected}
    aria-valuetext={focus ? `${dateLabel(focus)}: Fitness ${focus.ctl.toFixed(1)}, Ermüdung ${focus.atl.toFixed(1)}, Form ${focus.tsb.toFixed(1)}` : undefined}
    onKeyDown={event => {
      const n = event.key === 'ArrowRight' ? Math.min(selected + 1, points.length - 1) : event.key === 'ArrowLeft' ? Math.max(0, selected - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : null
      if (n != null) { event.preventDefault(); onSelect(n) }
    }} style={{ borderRadius: 8 }}>
    <svg role="img" aria-label="Fitness und Ermüdung im Tagesverlauf. Der Abstand zeigt deine Form. Gestrichelt: dein geplanter Verlauf. Kein ermittelter Optimalbereich." viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', overflow: 'visible' }}>
      {[lo, Math.round((lo + hi) / 2), hi].map(v => <g key={v}>
        <line x1="8" x2={W - 23} y1={y(v)} y2={y(v)} stroke={T.rule} opacity="0.55" />
        <text x={W} y={y(v) + 3} textAnchor="end" fill={T.quiet} fontFamily={FONT} fontSize="9">{v}</text>
      </g>)}
      {chartPoints.slice(1).map((p, i) => {
        const a = chartPoints[i]
        return <path key={i} d={`M${x(i)} ${y(a.ctl)} L${x(i + 1)} ${y(p.ctl)} L${x(i + 1)} ${y(p.atl)} L${x(i)} ${y(a.atl)}Z`} fill={(a.tsb + p.tsb) / 2 >= 0 ? T.acid : T.orbit} opacity={i >= boundary ? 0.05 : 0.09} />
      })}
      {future.length > 1 && <text x={(x(boundary) + x(points.length - 1)) / 2} y="12" textAnchor="middle" fill={T.mid} fontFamily={FONT} fontSize="9">Geplant</text>}
      {future.length > 0 && <line x1={x(boundary)} x2={x(boundary)} y1="10" y2={bottom + 4} stroke={T.quiet} strokeDasharray="2 5" />}
      {(['ctl', 'atl'] as const).map(key => <g key={key}>
        <path d={path(history, key, 0)} fill="none" stroke={key === 'ctl' ? T.cool : T.orbit} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {future.length > 0 && <motion.path initial={false} animate={{ d: futurePath(future, key) }} transition={transition} fill="none" stroke={key === 'ctl' ? T.cool : T.orbit} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />}
        {focus && <motion.circle initial={false} animate={{ cx: x(selected), cy: y(focus[key]) }} transition={transition} r="3.5" fill={key === 'ctl' ? T.cool : T.orbit} stroke={T.heroDock} strokeWidth="2" />}
      </g>)}
      {focus && Math.abs(y(focus.ctl) - y(focus.atl)) > 22 && <g aria-hidden>
        <path d={`M${x(selected)} ${y(focus.ctl)} h8 V${y(focus.atl)} h-8`} stroke={T.mid} strokeWidth="1" fill="none" />
        <rect x={x(selected) - 18} y={(y(focus.ctl) + y(focus.atl)) / 2 - 11} width="51" height="22" rx="11" fill={T.heroDock} />
        <text x={x(selected) + 7} y={(y(focus.ctl) + y(focus.atl)) / 2 + 4} textAnchor="middle" fill={T.ink} fontFamily={FONT} fontSize="11" fontWeight="600">{focus.tsb > 0 ? '+' : ''}{new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(focus.tsb)}</text>
      </g>}
      {history.map((p, i) => p.tss != null && p.tss > 0 ? <circle key={i} cx={x(i)} cy={y(p.atl)} r="3" stroke={T.heroDock} strokeWidth="1.5" fill={T.orbit}><title>{dateLabel(p)}: {Math.round(p.tss)} TSS erfasst</title></circle> : null)}
      <text x="8" y="216" fill={T.quiet} fontFamily={FONT} fontSize="9">{dateLabel(history[0])}</text>
      <text x={x(boundary)} y="216" textAnchor={future.length > 1 ? 'middle' : 'end'} fill={T.ink} fontFamily={FONT} fontSize="9">{impact?.today === history[boundary].date ? 'Heute' : dateLabel(history[boundary])}</text>
      {future.length > 1 && <text x={W - 23} y="216" textAnchor="end" fill={T.quiet} fontFamily={FONT} fontSize="9">{dateLabel(future.at(-1)!)}</text>}
      {points.map((p, i) => <rect key={i} x={x(i) - (W - 33) / Math.max(1, points.length - 1) / 2} y="0" width={(W - 33) / Math.max(1, points.length - 1)} height={bottom + 4} fill="transparent" onClick={() => onSelect(i)}><title>{dateLabel(p)}</title></rect>)}
    </svg>
  </div>
}
