import { useCallback, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTodayModel } from '../data/useTodayModel'
import { useDayState } from '../state/useDayState'
import TodayView, { type DayStateControl, type ProfileHeaderData } from './TodayView'

/**
 * Today, wired to live data. The layout itself lives in TodayView, which stays
 * a pure function of its props so a fixture can render it without a backend.
 *
 * This page owns the one piece of state the layout cannot: the day-state
 * override. The pen makes the DayRail's accent pill the only way in — tapping
 * it opens the sheet for the current state, and the sheet writes the override,
 * which `dayState` stores per local ISO date so it expires at the athlete's
 * own midnight rather than needing a cleanup job.
 *
 * `preview` (topbar task) is a SEPARATE, non-persisted piece of the same
 * `useDayState()` instance: tapping/swiping the Day Rail to browse another
 * state calls it, never `setOverride`. Both `useTodayModel` and this page
 * must read `state` from the SAME `useDayState()` call — see
 * `useTodayModel`'s own doc comment on `stateOverride` — otherwise the
 * preview set here would never reach the model the layout renders.
 *
 * The avatar (also topbar task) is real data — `useAuth().user.avatar_url` —
 * resolved here and passed down as a prop, the same pattern the day-state
 * control already follows: `components/` never reaches for a hook itself.
 */
export default function TodayPage() {
  const { state, derived, isPreviewing, setOverride, preview } = useDayState()
  const model = useTodayModel(state)
  const { user } = useAuth()
  const [openSheet, setOpenSheet] = useState<'switch' | 'back' | null>(null)

  const closeSheet = useCallback(() => setOpenSheet(null), [])

  const control = useMemo<DayStateControl>(() => ({
    // Rest and Training swap with each other; Resting goes back to Trained.
    onSwapDayType: () => setOpenSheet(state === 'resting' ? 'back' : 'switch'),
    openSheet,
    onPickDayType: (next) => { preview(null); setOverride(next); setOpenSheet(null) },
    onConfirmSessionDone: () => { preview(null); setOverride('trained'); setOpenSheet(null) },
    onCloseSheet: closeSheet,
    derived,
    isPreviewing,
    onPreview: preview,
  }), [state, derived, isPreviewing, openSheet, setOverride, preview, closeSheet])

  const profile: ProfileHeaderData = useMemo(() => ({
    avatarUrl: user?.avatar_url ?? null,
    initial: (user?.display_name || user?.email || '?').charAt(0).toUpperCase(),
  }), [user])

  return <TodayView model={model} control={control} profile={profile} />
}
