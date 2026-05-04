/**
 * Garmin API — lightweight wrappers around the /garmin/* endpoints.
 *
 * We already have `fetchGarminStatus` living in api/dashboard.ts (for
 * backwards-compat with the existing useGarminStatus hook). New garmin-facing
 * actions live in this module so related code co-locates instead of piling
 * into dashboard.ts.
 */
import { apiClient } from './client'

export interface GarminSyncResponse {
  activities_synced: number
  metrics_days: number
  message: string
  /**
   * ISO date strings (YYYY-MM-DD) for every athlete-day the sync may have
   * changed (activity_start through today, inclusive). Used by the frontend
   * for targeted React Query invalidation. May be `[]` from older backends.
   */
  dates_touched?: string[]
}

/**
 * Triggers a manual incremental sync for the current user's Garmin account.
 *
 * Backend behaviours we rely on (see backend/app/api/garmin.py):
 *   - 404 if no Garmin account is connected
 *   - 409 if a sync is already running (hourly scheduler or another click)
 *   - 401 on bad credentials — the user needs to reconnect
 *   - 500 on transport errors, recovered by the hourly scheduler retry
 *
 * Sync calls take up to ~10-20s in the worst case (90-day backfill during
 * connect), incremental hourly sync is usually sub-5s. We use a generous
 * timeout so a slow-but-successful sync doesn't present as "failed".
 */
export async function forceGarminSync(): Promise<GarminSyncResponse> {
  const res = await apiClient.post<GarminSyncResponse>(
    '/garmin/sync',
    undefined,
    { timeout: 30_000 },
  )
  return res.data
}
