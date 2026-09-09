import type { DayPlan } from '../../api/weeks'
import type { DailyDecisionState } from '../../api/coach'

export interface FormPoint { ctl: number; atl: number; tsb: number; date?: string; tss?: number | null }
export interface ImpactDay extends FormPoint { date: string; tss: number }
export interface TrainingImpact {
  mode: 'training' | 'rest' | 'completed' | 'unavailable'
  today: string | null
  target: number | null
  plan: ImpactDay[]
}
const loadOK = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
export const validFormPoint = (p: FormPoint) => loadOK(p.ctl) && loadOK(p.atl) && Number.isFinite(p.tsb)
export function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
}
export function step(point: FormPoint, tss: number, date: string): ImpactDay {
  const ctl = point.ctl + (tss - point.ctl) / 42
  const atl = point.atl + (tss - point.atl) / 7
  return { date, ctl, atl, tsb: ctl - atl, tss }
}
/** A conditional 42/7 plan calculation, not the fitted performance forecast.
 * Today's PMC already includes today's decay and logged load. Only add the
 * unperformed prescription; never replay decay or subtract recorded activity.
 * After any recorded load, wait for the authoritative completed-day surface.
 */
export function trainingImpact({ entries, today, state, target, days }: {
  entries: FormPoint[]; today: string | null; state: DailyDecisionState | null
  target: number | null; days: DayPlan[]
}): TrainingImpact {
  const empty: TrainingImpact = { mode: 'unavailable', today, target, plan: [] }
  const last = entries.at(-1)
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(Date.parse(today)) || !last || !validFormPoint(last) || last.date !== today) return empty
  if (state === 'trained_already' || (loadOK(last.tss) && last.tss > 0)) return { ...empty, mode: 'completed' }
  if (state === 'sick' || state === 'injured' || state === 'break') return empty
  const rest = state === 'planned_rest'
  if (!rest && (!['recover', 'easy', 'quality', 'hard'].includes(state ?? '') || !loadOK(target) || target <= 0 || last.tss !== 0)) return empty
  const tss = rest ? 0 : target!
  const ctl = last.ctl + tss / 42
  const atl = last.atl + tss / 7
  const plan: ImpactDay[] = [{ date: today, ctl, atl, tsb: ctl - atl, tss }]
  let date = nextDate(today)
  for (let i = 0; i < 6; i++, date = nextDate(date)) {
    const d = days.find(p => p.date === date)
    // Missing or unquantified sessions are not silently treated as rest.
    if (!d || (d.category !== 'rest' && !loadOK(d.target_tss)) || (d.secondary_title && !loadOK(d.secondary_target_tss))) break
    const load = (d.category === 'rest' ? 0 : d.target_tss!) + (d.secondary_target_tss ?? 0)
    if (!loadOK(load)) break
    plan.push(step(plan.at(-1)!, load, date))
  }
  return { mode: rest ? 'rest' : 'training', today, target: tss, plan }
}
export function metricTrend(key: 'ctl' | 'atl' | 'tsb', delta: number | null): string {
  if (delta == null) return 'Verlauf wächst'
  if (Math.abs(delta) < 0.05) return 'Stabil'
  if (key === 'ctl') return delta > 0 ? 'Aufbau' : 'Entlastung'
  if (key === 'atl') return delta > 0 ? 'Trainingsreiz' : 'Erholung'
  return delta > 0 ? 'Frischer' : 'Im Aufbau'
}
