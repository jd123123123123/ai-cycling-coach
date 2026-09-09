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
  const W = 310, H = 192, top = 17, bottom = 163
  const domain = [...history, ...future]
  const min = Math.min(...domain.flatMap(p => [p.ctl, p.atl]))
  const max = Math.max(...domain.flatMap(p => [p.ctl * 1.3, p.atl]))
  const padding = Math.max(5, max - min) * 0.15
  const lo = Math.max(0, Math.floor(min - padding))
  const hi = Math.max(lo + 5, Math.ceil(max + padding))
  const x = (i: number) => 8 + i / Math.max(1, points.length - 1) * (W - 33)
  const y = (v: number) => bottom - (v - lo) / (hi - lo) * (bottom - top)
  const path = (ps: FormPoint[], key: 'ctl' | 'atl', offset: number, mult = 1) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(i + offset).toFixed(2)} ${y(p[key] * mult).toFixed(2)}`).join(' ')
  const boundary = history.length - 1
  const bandPoints = [...history.slice(0, -1), ...(future.length ? future : history.slice(-1))]
  const ribbon = path(bandPoints, 'ctl', 0, 1.3) + [...bandPoints].reverse().map((p, i) => `L${x(bandPoints.length - i - 1)} ${y(p.ctl * 1.1)}`).join(' ') + 'Z'
  const focus = selected < history.length ? history[selected] : future[selected - boundary]
  const dateLabel = (p: FormPoint) => p.date ? new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' }).format(new Date(`${p.date}T12:00:00`)) : ''
  const futurePath = (ps: FormPoint[], key: 'ctl' | 'atl') => `M${x(boundary)} ${y(history[boundary][key])} ` + path(ps, key, boundary).replace(/^M/, 'L')
  return <div role="slider" tabIndex={0} aria-label="Tag im Verlauf auswählen" aria-valuemin={0} aria-valuemax={points.length - 1} aria-valuenow={selected}
    aria-valuetext={focus ? `${dateLabel(focus)}: Fitness ${focus.ctl.toFixed(1)}, Ermüdung ${focus.atl.toFixed(1)}, Form ${focus.tsb.toFixed(1)}` : undefined}
    onKeyDown={event => {
      const n = event.key === 'ArrowRight' ? Math.min(selected + 1, points.length - 1) : event.key === 'ArrowLeft' ? Math.max(0, selected - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : null
      if (n != null) { event.preventDefault(); onSelect(n) }
    }} style={{ borderRadius: 8 }}>
    <svg role="img" aria-label="Fitness und Ermüdung im Tagesverlauf. Grün: Modellbereich für Aufbau; gestrichelt: Planrechnung." viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', overflow: 'visible' }}>
      {[lo, Math.round((lo + hi) / 2), hi].map(v => <g key={v}>
        <line x1="8" x2={W - 23} y1={y(v)} y2={y(v)} stroke={T.rule} opacity="0.55" />
        <text x={W} y={y(v) + 3} textAnchor="end" fill={T.quiet} fontFamily={FONT} fontSize="9">{v}</text>
      </g>)}
      <motion.path initial={false} animate={{ d: ribbon }} transition={transition} fill={T.training} opacity="0.1" />
      <motion.path initial={false} animate={{ d: path(bandPoints, 'ctl', 0, 1.3) }} transition={transition} fill="none" stroke={T.training} strokeWidth="0.7" opacity="0.5" />
      <motion.path initial={false} animate={{ d: path(bandPoints, 'ctl', 0, 1.1) }} transition={transition} fill="none" stroke={T.training} strokeWidth="0.7" opacity="0.5" />
      {future.length > 0 && <line x1={x(boundary)} x2={x(boundary)} y1="10" y2={bottom + 4} stroke={T.quiet} strokeDasharray="2 5" />}
      {(['ctl', 'atl'] as const).map(key => <g key={key}>
        <path d={path(history, key, 0)} fill="none" stroke={key === 'ctl' ? T.cool : T.orbit} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {future.length > 0 && <motion.path initial={false} animate={{ d: futurePath(future, key) }} transition={transition} fill="none" stroke={key === 'ctl' ? T.cool : T.orbit} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />}
        {focus && <motion.circle initial={false} animate={{ cx: x(selected), cy: y(focus[key]) }} transition={transition} r="3.5" fill={key === 'ctl' ? T.cool : T.orbit} stroke={T.heroDock} strokeWidth="2" />}
      </g>)}
      <text x="8" y="186" fill={T.quiet} fontFamily={FONT} fontSize="9">{dateLabel(history[0])}</text>
      <text x={x(boundary)} y="186" textAnchor={future.length > 1 ? 'middle' : 'end'} fill={T.ink} fontFamily={FONT} fontSize="9">{impact?.today === history[boundary].date ? 'Heute' : dateLabel(history[boundary])}</text>
      {future.length > 1 && <text x={W - 23} y="186" textAnchor="end" fill={T.quiet} fontFamily={FONT} fontSize="9">{dateLabel(future.at(-1)!)}</text>}
      {points.map((p, i) => <rect key={i} x={x(i) - (W - 33) / Math.max(1, points.length - 1) / 2} y="0" width={(W - 33) / Math.max(1, points.length - 1)} height={bottom + 4} fill="transparent" onClick={() => onSelect(i)}><title>{dateLabel(p)}</title></rect>)}
    </svg>
  </div>
}
