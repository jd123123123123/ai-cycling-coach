import { useId, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, Info, X } from 'lucide-react'
import type { DailyDecisionReadiness } from '../../api/coach'
import { T, FONT } from './w3tokens'
import './w3ReadinessExplanation.css'

const FACTORS: Record<string, { label: string; explanation: string }> = {
  hrv: { label: 'HRV', explanation: 'Dein Sieben-Tage-Trend im Verhältnis zur persönlichen Basis — einschließlich täglicher Schwankungen.' },
  tsb: { label: 'Form', explanation: 'Fitness minus Ermüdung: Hohe Ermüdung bremst. Sehr hohe positive Form kann auf wenig Trainingsreiz hindeuten; sie allein belegt kein Untertraining.' },
  sleep: { label: 'Schlaf', explanation: 'Die Qualität der letzten Nacht und dein durchschnittliches Schlafdefizit der letzten 14 Tage.' },
  rhr: { label: 'Ruhepuls', explanation: 'Dein Sieben-Tage-Trend im Verhältnis zum persönlichen Ruhepuls-Basiswert.' },
  body_battery: { label: 'Body Battery', explanation: 'Dein Wert beim Aufwachen ergänzt die anderen Erholungssignale.' },
}

export default function W3ReadinessExplanation({ report, score, action }: { report?: DailyDecisionReadiness | null; score: number | null; action?: string | null }) {
  const [selected, setSelected] = useState<string | null>(null)
  const reduce = useReducedMotion()
  const panelId = useId()
  const components = score != null && report?.score === score ? report.components ?? [] : []
  const available = components.filter(c => c.score != null && Number.isFinite(c.score) && Number.isFinite(c.weight) && c.weight > 0)
  const weight = available.reduce((sum,c) => sum+c.weight,0)
  const groups = [
    { label: 'Positive Effekte', color: T.acid, items: available.filter(c => c.score! >= 75) },
    { label: 'Bremsende Effekte', color: T.bad, items: available.filter(c => c.score! < 60) },
    { label: 'Ausgeglichen', color: T.mid, items: available.filter(c => c.score! >= 60 && c.score! < 75) },
  ]
  const factor = available.find(c => c.name === selected)
  const status = groups.find(group => group.items.some(c => c.name === selected))
  const showPanel = selected === 'method' || !!factor
  const vars = {'--re-bg':T.heroDock,'--re-ink':T.ink,'--re-mid':T.mid,'--re-surface':T.surface2,'--re-acid':T.acid,'--re-rule':T.rule,fontFamily:FONT} as CSSProperties
  const toggle = (key:string) => setSelected(current => current === key ? null : key)
  return <section className="w3-readiness-effects" style={vars} aria-label="Einflüsse auf deine Bereitschaft">
    <div className="w3-effects-heading"><h3>Deine Einflüsse</h3><button type="button" aria-label="Berechnung verstehen" aria-expanded={selected==='method'} aria-controls={panelId} onClick={()=>toggle('method')}><Info size={16}/></button></div>
    {available.length > 0 ? <div className="w3-effects-bubbles">{groups.filter(group => group.items.length > 0).map(group => <div key={group.label} aria-label={group.label} className="w3-effects-group">{group.items.map(c => <button key={c.name} type="button" className="w3-effect-bubble" style={{'--effect':group.color} as CSSProperties} aria-label={`${FACTORS[c.name]?.label ?? c.name}: ${group.label}`} aria-pressed={selected===c.name} aria-controls={panelId} onClick={()=>toggle(c.name)}>
      <i className="w3-effect-dot" aria-hidden="true"/>{FACTORS[c.name]?.label ?? c.name}
    </button>)}</div>)}</div> : <p className="w3-effects-empty">Noch keine aktuelle Aufschlüsselung.</p>}
    <AnimatePresence initial={false}>{showPanel && <motion.div key="explanation" id={panelId} className="w3-effect-panel" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduce?0:.18}}>
      <div className="w3-effect-panel-inner">
        <button className="w3-effect-close" type="button" aria-label="Erklärung schließen" onClick={()=>setSelected(null)}><X size={14}/></button>
        {factor ? <><div className="w3-effect-value" style={{color:status?.color}}><strong>{Math.round(factor.score!)}</strong><span>/100<small>{Math.round(factor.weight/weight*100)} % Gewicht</small></span></div><h4>{FACTORS[factor.name]?.label ?? factor.name} · {status?.label}</h4><p>{FACTORS[factor.name]?.explanation}</p></> : <><h4>So wird gewichtet</h4><p>Grün ab 75, Rot unter 60, dazwischen neutral. Die Punkte zeigen die Einordnung der Teilwerte, keine Veränderung zum Vortag. Fehlende Daten werden ausgelassen und die übrigen Gewichte angepasst.</p><p>Belastung zählt über Fitness und Ermüdung. Stress, Erholungszeit und VO₂max liefern Kontext, aber keine zusätzlichen Punkte. Modellwerte sind keine Diagnosen.</p></>}
      </div>
    </motion.div>}</AnimatePresence>
    {action && <div className="w3-effects-action" aria-label="Dein nächster Schritt"><ArrowUpRight size={17} aria-hidden="true"/><p>{action}</p></div>}
  </section>
}
