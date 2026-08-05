import { useCallback, useMemo, useState } from 'react'
import { useTodayModel } from '../data/useTodayModel'
import { useDayState } from '../state/useDayState'
import TodayView, { type DayStateControl } from './TodayView'

/**
 * Today, wired to live data. The layout itself lives in TodayView, which stays
 * a pure function of its props so a fixture can render it without a backend.
 *
 * This page owns the one piece of state the layout cannot: the day-state
 * override. The pen makes the DayRail's accent pill the only way in — tapping
 * it opens the sheet for the current state, and the sheet writes the override,
 * which `dayState` stores per local ISO date so it expires at the athlete's
 * own midnight rather than needing a cleanup job.
 */
export default function TodayPage() {
  const model = useTodayModel()
  const { state, setOverride } = useDayState()
  const [openSheet, setOpenSheet] = useState<'switch' | 'back' | null>(null)

  const closeSheet = useCallback(() => setOpenSheet(null), [])

  const control = useMemo<DayStateControl>(() => ({
    // Rest and Training swap with each other; Resting goes back to Trained.
    onSwapDayType: () => setOpenSheet(state === 'resting' ? 'back' : 'switch'),
    openSheet,
    onPickDayType: (next) => { setOverride(next); setOpenSheet(null) },
    onConfirmSessionDone: () => { setOverride('trained'); setOpenSheet(null) },
    onCloseSheet: closeSheet,
  }), [state, openSheet, setOverride, closeSheet])

  return <TodayView model={model} control={control} />
}
