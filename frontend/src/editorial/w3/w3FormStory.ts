import { nextDate, type FormPoint, type TrainingImpact } from './w3TrainingImpact'

export function formStory(history: FormPoint[], impact?: TrainingImpact): string {
  const now = history.at(-1)
  if (!now) return 'Mit deinen Fahrten entsteht dein Formverlauf.'
  const week = history.slice(-7)
  const contiguous = week.every((p, i) => i === 0 || (p.date && week[i - 1].date && nextDate(week[i - 1].date!) === p.date))
  const declining = week.length === 7 && contiguous && now.ctl < week[0].ctl - 0.5
  const state = now.tsb >= 0
    ? declining ? 'Wenig Ermüdung, zuletzt sinkende Fitness.' : 'Deine Fitness liegt über deiner Ermüdung.'
    : 'Deine letzten Trainings wirken noch nach.'
  if (!impact || impact.today !== now.date) return state
  if (impact.mode === 'rest') return `${state} Heute baut der Ruhetag weiter Ermüdung ab.`
  if (impact.mode === 'training' && impact.target != null) {
    const load = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(impact.target)
    return `${state} Die geplanten ${load} TSS setzen heute einen neuen Trainingsreiz.`
  }
  if (impact.mode === 'completed') return `${state} Dein heutiges Training ist bereits eingerechnet.`
  return state
}
