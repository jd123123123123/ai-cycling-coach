import type { PlanDaySession } from './W3PlanView'

export function tssDifference(planned: number | null, actual: number | null) {
  if (planned == null || actual == null || !Number.isFinite(planned) || !Number.isFinite(actual)) return null
  const delta = Math.round(actual - planned)
  return delta === 0 ? 'Belastung wie geplant' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} TSS zum Plan`
}

export function rideTime(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} h`
}

/** Load comparison, not an invented workout-quality or adherence score. */
export default function W3PlanDayComparison({ day }: { day: PlanDaySession }) {
  const planned = day.title ? Number.isFinite(Number(day.tss)) ? Number(day.tss) : null : 0
  const actual = day.actualTss ?? null
  const maximum = Math.max(1, planned ?? 0, actual ?? 0)
  const ridden = day.ridden || actual != null || day.actualDuration != null
  const state = day.actualKnown === false ? 'Fahrtdaten noch nicht verfügbar' : ridden ? tssDifference(planned, actual) ?? 'TSS nicht erfasst' : 'Keine Fahrt aufgezeichnet'
  return <div className="focus-day-comparison" aria-label="Empfohlen und gefahren">
    <div className="focus-day-compare-row" data-kind="plan">
      <div><span>Empfohlen</span><strong>{planned == null ? '—' : Math.round(planned)} <small>TSS</small><span>{day.dur ?? 'Ruhetag'}</span></strong></div>
      <div className="focus-day-compare-track" aria-hidden><i style={{ width: `${(planned ?? 0) / maximum * 100}%` }}/></div>
    </div>
    <div className="focus-day-compare-row" data-kind="actual">
      <div><span>Gefahren</span><strong>{actual == null ? '—' : Math.round(actual)} <small>TSS</small><span>{rideTime(day.actualDuration)}</span></strong></div>
      <div className="focus-day-compare-track" aria-hidden><i style={{ width: `${(actual ?? 0) / maximum * 100}%` }}/></div>
    </div>
    <p>{state}</p>
  </div>
}
