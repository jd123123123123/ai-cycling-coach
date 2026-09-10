import { useId, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, ArrowDownRight, ArrowRight, Info } from 'lucide-react'
import { useW3FormData } from './useW3FormData'
import { formStory } from './w3FormStory'
import { T, FONT, band, w3Mode } from './w3tokens'
import { lux, S, TNUM } from './w3surfaces'
import { DailyBars, TrainingImpactChart } from './W3TrainingImpactChart'
import { metricTrend, nextDate, validFormPoint } from './w3TrainingImpact'
import type { FormPoint, TrainingImpact } from './w3TrainingImpact'
export type { FormPoint } from './w3TrainingImpact'

const number = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n)
const signed = (n: number) => `${n > 0.049 ? '+' : ''}${number(Math.abs(n) < 0.05 ? 0 : n)}`
const dateText = (date?: string) => date ? new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`)) : 'Verlauf'
const explanations = {
  ctl: 'Fitness ist dein langfristiger Aufbau aus Trainingsbelastung. Sie reagiert langsam; ein Ruhetag gehört dazu.',
  atl: 'Ermüdung reagiert schneller auf Training und Pause. Mehr Belastung setzt einen Reiz, Erholung lässt sie sinken.',
  tsb: 'Form = Fitness − Ermüdung. Positiv bedeutet frischer, negativ stärker belastet. Höher ist nicht immer besser.',
  zone: 'Dein persönlicher Zielbereich ist noch nicht ermittelt. Er muss deine Trainingsbelastung, Erholung und Leistungsentwicklung verbinden. Die farbige Fläche zeigt hier den Abstand zwischen Fitness und Ermüdung – deine Form.',
  model: 'Die gestrichelten Linien zeigen deinen bestehenden Plan im 42/7-Modell. Die Rechnung endet, sobald für einen Tag eine Belastungsangabe fehlt. Modellwerte sind keine garantierte Leistungssteigerung.',
}
const resetButton = () => ({ border: 0, fontFamily: FONT, cursor: 'pointer', color: T.ink, background: 'transparent' } as const)

export function W3FormCardView({ entries, impact, embedded = false, expanded = true }: { entries: FormPoint[]; impact?: TrainingImpact; embedded?: boolean; expanded?: boolean }) {
  const history = entries.filter(validFormPoint).slice(-14)
  if (!history.length) return embedded ? <p style={{margin:0,fontSize:12,color:T.mid}}>Noch kein Verlauf</p> : null
  return <FormCard key={history.at(-1)?.date ?? history.length} history={history} impact={impact} embedded={embedded} expanded={expanded} />
}
function FormCard({ history, impact, embedded, expanded }: { history: FormPoint[]; impact?: TrainingImpact; embedded: boolean; expanded: boolean }) {
  const reduce = useReducedMotion()
  const [selection, setSelection] = useState<number | null>(null)
  const [explanation, setExplanation] = useState<keyof typeof explanations | null>(null)
  const explanationId = useId()
  const future = impact?.plan ?? []
  const all = [...history, ...future.slice(1)]
  const selected = Math.min(selection ?? history.length - 1, all.length - 1)
  const current = all[selected]
  const previous = selected > 0 ? all[selected - 1] : null
  const consecutive = previous && (!current.date || !previous.date || nextDate(previous.date) === current.date)
  const projected = selected >= history.length
  const explain = (key: keyof typeof explanations) => setExplanation(explanation === key ? null : key)
  const metrics = [
    { key: 'ctl' as const, label: 'Fitness', color: T.cool },
    { key: 'atl' as const, label: 'Ermüdung', color: T.orbit },
    { key: 'tsb' as const, label: 'Form', color: T.acid },
  ]
  return <section style={embedded ? { padding: 0 } : band(26)} aria-label="Form und Trainingswirkung" data-training-impact="w3-today-form-v3">
    <div style={{ ...lux(24), ...(embedded ? { boxShadow: 'none', padding: 0, background: 'transparent', border: 0 } : { padding: S.xl }), gap: S.lg, fontFamily: FONT }}>
      <div style={{ display: embedded ? 'none' : 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ display: embedded ? 'none' : undefined, margin: 0, color: T.ink, fontSize: 19, fontWeight: 650, letterSpacing: -0.6 }}>Deine Form</h2>
        <span style={{ fontSize: 11, color: T.mid }}>{projected ? 'Plan · ' : ''}{current.date === impact?.today ? 'Heute' : dateText(current.date)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: S.md }}>
        {metrics.map(({ key, label, color }) => {
          const delta = consecutive && previous ? current[key] - previous[key] : null
          const positive = delta != null && (key === 'ctl' ? delta > 0.049 : delta * (key === 'atl' ? -1 : 1) > 0.049)
          return <button key={key} type="button" aria-label={`${label} erklären`} aria-expanded={explanation === key} aria-controls={explanationId} onClick={() => explain(key)} style={{ ...resetButton(), textAlign: 'left', padding: 0, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.mid }}><i style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />{label}</span>
            <span style={{ ...TNUM, display: 'block', marginTop: 7, fontSize: 28, fontWeight: 600, letterSpacing: -1.3, lineHeight: 1 }}>{key === 'tsb' ? signed(current[key]) : number(current[key])}</span>
            <span style={{ ...TNUM, display: 'block', margin: '7px 0 6px', fontSize: 10, color: positive ? (w3Mode() === 'light' ? T.acid : T.training) : T.mid, whiteSpace: 'nowrap' }}>{delta == null ? null : <>{delta > 0.049 ? <ArrowUpRight size={10} aria-hidden style={{ display: 'inline' }} /> : delta < -0.049 ? <ArrowDownRight size={10} aria-hidden style={{ display: 'inline' }} /> : <ArrowRight size={10} aria-hidden style={{ display: 'inline' }} />} {signed(delta)} </>}<span style={{ color: T.mid }}>{metricTrend(key, delta)}</span></span>
            <DailyBars values={all.slice(Math.max(0, selected - 6), selected + 1).map(p => p[key])} color={color} />
          </button>
        })}
      </div>
      {explanation && (expanded || ['ctl', 'atl', 'tsb'].includes(explanation)) && <p id={explanationId} role="status" style={{ margin: '-4px 0 0', paddingLeft: 10, borderLeft: `2px solid ${T.rule}`, fontSize: 12, lineHeight: 1.5, color: T.mid }}>{explanations[explanation]}{explanation === 'model' && impact?.target != null ? ` Heute: ${number(impact.target)} TSS geplant.` : ''}{['ctl', 'atl', 'tsb'].includes(explanation) && current.tss != null ? ` ${dateText(current.date)}: ${number(current.tss)} TSS${projected ? ' geplant' : ' erfasst'}.` : ''}</p>}
      <motion.div initial={false} animate={{height:expanded?'auto':0,opacity:expanded?1:0,marginTop:expanded?0:-S.lg}} transition={{duration:reduce?0:.3}} aria-hidden={!expanded} inert={!expanded} style={{overflow:'hidden'}}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <button type="button" aria-expanded={explanation === 'zone'} onClick={() => explain('zone')} style={{ ...resetButton(), display: 'flex', alignItems: 'center', gap: 5, padding: '4px 0', fontSize: 10, color: T.mid }}>Persönlicher Zielbereich <Info size={11} aria-hidden /></button>
          {future.length > 0 && <button type="button" aria-expanded={explanation === 'model'} onClick={() => explain('model')} style={{ ...resetButton(), display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.mid, padding: '4px 0' }}>Dein Plan <Info size={11} aria-hidden /></button>}
        </div>
        <TrainingImpactChart history={history} impact={impact} selected={selected} onSelect={setSelection} />
        <p style={{ margin: '14px 0 0', fontSize: 14, color: T.mid, lineHeight: 1.45, letterSpacing: -0.15 }}>{formStory(history, impact)}</p>
      </motion.div>
    </div>
  </section>
}

export default function W3FormCard({ embedded = false, expanded = true }: { embedded?: boolean; expanded?: boolean }) {
  const { entries, impact } = useW3FormData()
  return <W3FormCardView entries={entries} impact={impact} embedded={embedded} expanded={expanded} />
}
