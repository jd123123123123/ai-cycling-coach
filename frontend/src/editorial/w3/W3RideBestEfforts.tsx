import { useState } from 'react'
import type { W3Rank } from './W3RideDetailView'
import { T } from './w3tokens'
import { smoothCurve } from './w3SmoothCurve'

const watts = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })

/** Measured best efforts share a zero-based power axis; duration is logarithmic. */
export default function W3RideBestEfforts({ ranks }: { ranks: W3Rank[] }) {
  const sorted = [...ranks].filter(r => r.durationSeconds > 0).sort((a,b) => a.durationSeconds-b.durationSeconds)
  const [chosen, setChosen] = useState<number | null>(null)
  const selected = sorted.find(r => r.durationSeconds === chosen) ?? sorted.find(r => r.pr) ?? sorted[0]
  if (!selected) return null
  const ceiling = Math.max(1, ...sorted.flatMap(r => [r.wattsValue, r.bestWattsValue ?? 0]))
  const lo = Math.log(sorted[0].durationSeconds), hi = Math.log(sorted.at(-1)!.durationSeconds)
  const x = (duration: number) => sorted.length === 1 ? 170 : 14 + (Math.log(duration)-lo)/(hi-lo)*312
  const y = (value: number) => 174 - value/ceiling*146
  const prior = selected.bestWattsValue
  const delta = prior == null ? null : selected.wattsValue-prior
  return <div className="w3-effort-curve">
    <div className="w3-effort-reading">
      <div><span>{selected.dur.toLowerCase()} · {selected.pr ? 'Neuer Bestwert' : 'Diese Fahrt'}</span><strong>{watts(selected.wattsValue)}<small>W</small></strong></div>
      {prior != null && <div><span>Bisher {watts(prior)} W</span><strong className={selected.pr ? 'is-record' : ''}>{delta! > 0 ? '+' : ''}{watts(delta!)}<small>W</small></strong></div>}
    </div>
    <svg viewBox="0 0 340 198" role="img" aria-label={`Leistungskurve ab null Watt. ${selected.dur}: ${watts(selected.wattsValue)} Watt gefahren${prior == null ? ', kein früherer Bestwert' : `, bisher ${watts(prior)} Watt`}`}>
      {[0,.5,1].map(f => <g key={f}><line x1="14" x2="326" y1={y(ceiling*f)} y2={y(ceiling*f)} stroke={T.rule}/><text x="14" y={y(ceiling*f)-7} fill={T.mid} fontSize="11">{Math.round(ceiling*f)} W</text></g>)}
      <path d={smoothCurve(sorted.map(r => r.bestWattsValue == null ? null : ({x:x(r.durationSeconds),y:y(r.bestWattsValue)})))} fill="none" stroke={T.mid} strokeWidth="1.5" strokeDasharray="4 5"/>
      <path d={smoothCurve(sorted.map(r => ({x:x(r.durationSeconds),y:y(r.wattsValue)})))} fill="none" stroke={T.acid} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1={x(selected.durationSeconds)} x2={x(selected.durationSeconds)} y1="20" y2="174" stroke={T.mid} opacity=".5"/>
      {prior != null && <circle cx={x(selected.durationSeconds)} cy={y(prior)} r="4" fill={T.bg} stroke={T.mid} strokeWidth="1.5"/>}
      {sorted.map(r => <circle key={r.durationSeconds} cx={x(r.durationSeconds)} cy={y(r.wattsValue)} r={r===selected?5:3} fill={T.acid} stroke={T.bg} strokeWidth="2"/>)}
    </svg>
    <div className="w3-effort-durations" role="group" aria-label="Leistungsdauer auswählen">{sorted.map(r => <button key={r.durationSeconds} type="button" aria-pressed={r===selected} onClick={()=>setChosen(r.durationSeconds)}>{r.dur.toLowerCase()}</button>)}</div>
    <div className="w3-effort-legend"><span><i/>Diese Fahrt</span><span><i/>Bisheriger Bestwert</span></div>
  </div>
}
