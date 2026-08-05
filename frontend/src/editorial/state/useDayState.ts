import { useCallback, useMemo, useState } from 'react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useTodaySession } from '../../hooks/useTodaySession'
import { clearOverride, deriveDayState, readOverride, writeOverride, type DayState } from './dayState'

/**
 * The state the day is actually in: an override if the athlete set one today,
 * otherwise the derivation. A dev override (the picker) previews a state
 * without touching stored state, so it is React state, not localStorage.
 */
export function useDayState(): {
  state: DayState
  derived: DayState
  setOverride: (s: DayState) => void
  clear: () => void
  preview: (s: DayState | null) => void
} {
  const now = useMemo(() => new Date(), [])
  const { isActiveTrainingDay } = useTodaySession()
  const { data: activities } = useActivitiesRange(now, now)
  const [previewState, setPreviewState] = useState<DayState | null>(null)
  const [tick, setTick] = useState(0)

  const derived = useMemo(() => deriveDayState({
    now,
    hasCyclingActivityToday: (activities?.activities ?? []).some((a) => a.sport === 'cycling'),
    hasPlannedSessionToday: isActiveTrainingDay,
    plannedSessionCompleted: false,
  }), [now, activities, isActiveTrainingDay])

  const stored = useMemo(() => { void tick; return readOverride(now) }, [now, tick])

  const setOverride = useCallback((s: DayState) => {
    writeOverride(s, new Date()); setTick((t) => t + 1)
  }, [])
  const clear = useCallback(() => { clearOverride(); setTick((t) => t + 1) }, [])

  return { state: previewState ?? stored ?? derived, derived, setOverride, clear, preview: setPreviewState }
}
