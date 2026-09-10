import { usePMC } from '../../hooks/usePMC'
import { useTodaySession } from '../../hooks/useTodaySession'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { trainingImpact } from './w3TrainingImpact'

export function useW3FormData() {
  const { data: pmc } = usePMC(42)
  const session = useTodaySession()
  const { data: week } = useCurrentWeek()
  const entries = (pmc?.entries ?? []).map(p => ({ ...p, tss: p.tss ?? p.daily_tss ?? null }))
  const impact = trainingImpact({
    entries,
    today: session.decision?.date ?? session.weekToday?.date ?? null,
    state: session.decision?.state ?? (session.isRestDay ? 'planned_rest' : null),
    target: session.workout?.predicted_tss ?? session.decision?.tss_target ?? null,
    days: week?.days ?? [],
  })
  return { entries, impact }
}
