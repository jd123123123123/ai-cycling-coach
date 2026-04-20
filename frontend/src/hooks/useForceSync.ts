import { useMutation, useQueryClient } from '@tanstack/react-query'
import { forceGarminSync, type GarminSyncResponse } from '../api/garmin'

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
      qc.invalidateQueries({ queryKey: ['coach', 'brief'] })
      qc.invalidateQueries({ queryKey: ['intraday'] })
      qc.invalidateQueries({ queryKey: ['garmin', 'status'] })
    },
  })
}
