import { useId, useState } from 'react'
import { ArrowUpRight, ArrowDownRight, ArrowRight, Info } from 'lucide-react'
import { usePMC } from '../../hooks/usePMC'
import { useTodaySession } from '../../hooks/useTodaySession'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { T, FONT, band, w3Mode } from './w3tokens'
import { lux, S, TNUM } from './w3surfaces'
import { DailyBars, TrainingImpactChart } from './W3TrainingImpactChart'
import { metricTrend, nextDate, trainingImpact, validFormPoint } from './w3TrainingImpact'
import type { FormPoint, TrainingImpact } from './w3TrainingImpact'
export type { FormPoint } from './w3TrainingImpact'

const number = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n)
const signed = (n: number) => `${n > 0.049 ? '+' : ''}${number(Math.abs(n) < 0.05 ? 0 : n)}`
const dateText = (date?: string) => date ? new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`)) : 'Verlauf'
const explanations = {
  ctl: 'Fitness ist dein langfristiger Aufbau aus Trainingsbelastung. Sie reagiert langsam; ein Ruhetag gehört dazu.',
  atl: 'Ermüdung reagiert schneller auf Training und Pause. Mehr Belastung setzt einen Reiz, Erholung lässt sie sinken.',
  tsb: 'Form = Fitness − Ermüdung. Positiv bedeutet frischer, negativ stärker belastet. Höher ist nicht immer besser.',
  zone: 'Aufbaubereich im 42/7-Modell: Ermüdung bei 110–130 % der Fitness. Er wächst mit deiner Fitness. Eine Orientierung für Aufbauphasen, kein persönliches Optimum.',
  model: 'Die gestrichelten Linien zeigen deinen bestehenden Plan im 42/7-Modell. Die Rechnung endet, sobald für einen Tag eine Belastungsangabe fehlt. Modellwerte sind keine garantierte Leistungssteigerung.',
}
const resetButton = () => ({ border: 0, fontFamily: FONT, cursor: 'pointer', color: T.ink, background: 'transparent' } as const)

export function W3FormCardView({ entries, impact }: { entries: FormPoint[]; impact?: TrainingImpact }) {
  const history = entries.filter(validFormPoint).slice(-14)
  if (!history.length) return null
  return <FormCard key={history.at(-1)?.date ?? history.length} history={history} impact={impact} />
}
function FormCard({ history, impact }: { history: FormPoint[]; impact?: TrainingImpact }) {
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
  return <section style={band(26)} aria-label="Form und Trainingswirkung" data-training-impact="w3-today-form-v2">
    <div style={{ ...lux(24), padding: S.xl, gap: S.lg, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0, color: T.ink, fontSize: 19, fontWeight: 650, letterSpacing: -0.6 }}>Deine Form</h2>
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
      {explanation && <p id={explanationId} role="status" style={{ margin: '-4px 0 0', paddingLeft: 10, borderLeft: `2px solid ${T.rule}`, fontSize: 12, lineHeight: 1.5, color: T.mid }}>{explanations[explanation]}{explanation === 'model' && impact?.target != null ? ` Heute: ${number(impact.target)} TSS geplant.` : ''}{['ctl', 'atl', 'tsb'].includes(explanation) && current.tss != null ? ` ${dateText(current.date)}: ${number(current.tss)} TSS${projected ? ' geplant' : ' erfasst'}.` : ''}</p>}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <button type="button" aria-expanded={explanation === 'zone'} onClick={() => explain('zone')} style={{ ...resetButton(), display: 'flex', alignItems: 'center', gap: 5, padding: '4px 0', fontSize: 10, color: T.mid }}><i style={{ width: 9, height: 5, background: T.training, opacity: 0.6, borderRadius: 2 }} />Aufbaubereich <Info size={11} aria-hidden /></button>
          {future.length > 0 && <button type="button" aria-expanded={explanation === 'model'} onClick={() => explain('model')} style={{ ...resetButton(), display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.mid, padding: '4px 0' }}>Planrechnung <Info size={11} aria-hidden /></button>}
        </div>
        <TrainingImpactChart history={history} impact={impact} selected={selected} onSelect={setSelection} />
      </div>
    </div>
  </section>
}

export default function W3FormCard() {
  const { data: pmc } = usePMC(42)
  const session = useTodaySession()
  const { data: week } = useCurrentWeek()
  const entries = (pmc?.entries ?? []).map(entry => ({ ...entry, tss: entry.tss ?? entry.daily_tss ?? null }))
  const impact = trainingImpact({
    entries,
    today: session.decision?.date ?? session.weekToday?.date ?? null,
    state: session.decision?.state ?? (session.isRestDay ? 'planned_rest' : null),
    target: session.workout?.predicted_tss ?? session.decision?.tss_target ?? null,
    days: week?.days ?? [],
  })
  return <W3FormCardView entries={entries} impact={impact} />
}
