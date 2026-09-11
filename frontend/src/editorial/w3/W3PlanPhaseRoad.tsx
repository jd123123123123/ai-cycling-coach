import { useId, useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'
import './w3PlanPhaseRoad.css'

const labels: Record<string, string> = { accumulation: 'Aufbau', transmutation: 'Intensiv', realization: 'Form', recovery: 'Erholung' }
const route = 'M 23 144 C 71 144 78 64 143 64 S 243 147 295 98 S 326 48 337 40'

export default function W3PlanPhaseRoad({ schedule, index, onOpenPlan }: { schedule: string[]; index: number; onOpenPlan?: () => void }) {
  const uid = useId(); const path = useRef<SVGPathElement>(null); const reduced = useReducedMotion()
  const [points, setPoints] = useState<{ x: number; y: number }[]>([])
  useLayoutEffect(() => { const p = path.current; if (p) setPoints(Array.from({ length: schedule.length }, (_, i) => { const pt = p.getPointAtLength(p.getTotalLength() * i / Math.max(1, schedule.length - 1)); return { x: pt.x, y: pt.y } })) }, [schedule.length])
  const week = Math.max(0, Math.min(index, schedule.length - 1)); const current = points[week]; const remaining = schedule.length - week - 1
  const phases = schedule.reduce<{ phase: string; start: number; weeks: number }[]>((all, phase, i) => { const previous = all.at(-1); if (previous?.phase === phase) previous.weeks += 1; else all.push({ phase, start: i, weeks: 1 }); return all }, [])
  const activePhase = phases.find(p => week >= p.start && week < p.start + p.weeks) ?? phases[0]
  const trans = { duration: reduced ? 0 : .45, ease: [.22, 1, .36, 1] as [number, number, number, number] }
  return <div className="w3-plan-road">
    <div className="road-intro"><div><strong>{labels[schedule[week]] ?? schedule[week]}</strong><span>Woche {activePhase ? week - activePhase.start + 1 : week + 1} von {activePhase?.weeks ?? schedule.length}</span></div><span className="road-count"><b>{String(week + 1).padStart(2, '0')}</b> / {String(schedule.length).padStart(2, '0')}</span></div>
    <svg className="route-art" viewBox="0 0 360 196" aria-label={`Trainingsweg, Planwoche ${week + 1} von ${schedule.length}`}>
      <defs><linearGradient id={`${uid}-road`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#677160" /><stop offset=".5" stopColor="#333c35" /><stop offset="1" stopColor="#293133" /></linearGradient><filter id={`${uid}-road-shadow`} x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="6" /></filter><radialGradient id={`${uid}-marker-light`}><stop stopColor="#c8ff00" stopOpacity=".22" /><stop offset="1" stopColor="#c8ff00" stopOpacity="0" /></radialGradient></defs>
      <g fill="none" stroke="#73806c" strokeWidth=".6" opacity=".17" aria-hidden>{Array.from({ length: 9 }, (_, i) => <path key={i} d={`M ${-90 + i * 10} ${30 + i * 13} C ${30 + i * 5} ${-85 + i * 13}, ${115 + i * 9} ${155 + i * 9}, ${252 + i * 12} ${-25 + i * 11} S ${460 + i * 5} ${140 + i * 10},480 180`} />)}</g>
      <path d={route} fill="none" stroke="#000" strokeWidth="32" transform="translate(0 8)" opacity=".35" filter={`url(#${uid}-road-shadow)`} /><path d={route} fill="none" stroke="#71806a" strokeOpacity=".4" strokeWidth="27" strokeLinecap="round" /><path ref={path} d={route} fill="none" stroke={`url(#${uid}-road)`} strokeWidth="25" strokeLinecap="round" /><path d={route} fill="none" stroke="#c8ff00" strokeWidth="25" strokeOpacity=".10" pathLength="1" strokeDasharray={`${week / Math.max(1, schedule.length - 1)} 1`} strokeLinecap="round" /><path d={route} fill="none" stroke="#b6c1ab" strokeWidth="1" strokeDasharray="2 6" strokeOpacity=".4" />
      {points.map((p, i) => <g key={i}><title>{`Planwoche ${i + 1} · ${labels[schedule[i]] ?? schedule[i]}${i === week ? ' · aktuell' : ''}`}</title><circle cx={p.x} cy={p.y} r="9" fill="#242e27" stroke={i < week ? '#9aac7e' : '#536052'} strokeWidth="1" /><text x={p.x} y={p.y + 3.5} fontSize="10" textAnchor="middle" fill="#d1d9c7">{i + 1}</text></g>)}
      {current && <motion.g initial={false} animate={{ x: current.x, y: current.y }} transition={trans} pointerEvents="none"><circle r="31" fill={`url(#${uid}-marker-light)`} /><circle cy="2" r="15" fill="#0b100b" opacity=".65" /><circle r="14" fill="#c8ff00" stroke="#e9ff9c" strokeWidth="1" /><path d="M 0 -6 L 5 5 L 0 2 L -5 5 Z" fill="#1d2b0b" /></motion.g>}
    </svg>
    <div className="road-phases">{phases.map(phase => <div key={phase.start} className="road-phase" data-active={phase === activePhase}><span>{labels[phase.phase] ?? phase.phase}</span><i>{Array.from({ length: phase.weeks }, (_, i) => <b key={i} data-current={phase.start + i === week} data-past={phase.start + i < week} />)}</i></div>)}</div>
    <div className="road-footer"><span>{remaining ? `Noch ${remaining} ${remaining === 1 ? 'Woche' : 'Wochen'}` : 'Letzte Woche'}</span>{onOpenPlan && <button onClick={onOpenPlan}>Plan ansehen <ArrowUpRight size={14} aria-hidden /></button>}</div>
  </div>
}
