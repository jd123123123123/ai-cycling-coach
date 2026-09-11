import { useMutation, useQueryClient } from '@tanstack/react-query'
import { forceGarminSync, type GarminSyncResponse } from '../api/garmin'
import { COACH_BRIEF_KEY_ROOT } from './useCoachBrief'
import { WEEK_CURRENT_KEY_ROOT } from './useCurrentWeek'
import { MORNING_HEALTH_KEY } from './useMorningHealthCheck'

/**
 * Mutation wrapper around POST /garmin/sync.
 *
 * On success it invalidates every query that depends on Garmin-sourced data
 * so the dashboard re-renders with fresh numbers:
 *   - daily-metrics (HRV / body battery / sleep / resting HR / steps)
 *   - activities     (recent rides, PMC inputs)
 *   - pmc            (CTL / ATL / TSB series)
 *   - coach-brief    (the brief's evidence bundle changes when new
 *                     activities + metrics land)
 *   - intraday       (body-battery / stress / hrv / hr sample streams)
 *
 * The Garmin status query (['garmin','status']) is also invalidated so the
 * masthead's "synced at" footer refreshes — we don't hardcode this key here
 * because the SyncButton could wire it separately, but including it keeps
 * the signal single-source.
 */
export function useForceSync() {
  const qc = useQueryClient()
  return useMutation<GarminSyncResponse>({
    mutationFn: forceGarminSync,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-metrics'] })
      qc.invalidateQueries({ queryKey: ['activities'] })
      qc.invalidateQueries({ queryKey: ['pmc'] })
      qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
      qc.invalidateQueries({ queryKey: ['intraday'] })
      qc.invalidateQueries({ queryKey: ['garmin', 'status'] })
      qc.invalidateQueries({ queryKey: ['readiness', 'decision'] })
      qc.invalidateQueries({ queryKey: MORNING_HEALTH_KEY })
      // ── AND THE KEYS TODAY ACTUALLY READS ──────────────────────────────
      // The list above is the legacy dashboard's, and this hook was written
      // for it. Put the button on Today and it would have refreshed every
      // screen except the one it was standing on: a finished ride would land
      // in `activities` while the week strip above it still showed the day
      // empty, the streak still showed yesterday's number, and the chest that
      // the ride just filled never appeared.
      //
      // The rule for anything added here: if the sync can change it, it
      // belongs. A newly ingested ride moves the week's TSS, extends the
      // streak, awards RideCoin into the wallet, opens a chest, and changes
      // what the adaptive coach has to say.
      qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
      qc.invalidateQueries({ queryKey: ['athlete', 'streak'] })
      qc.invalidateQueries({ queryKey: ['rewards'] })
      qc.invalidateQueries({ queryKey: ['coach', 'adaptive'] })
    },
  })
}
