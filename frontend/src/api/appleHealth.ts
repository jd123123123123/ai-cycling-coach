/**
 * Apple Health API — wrapper around the /apple-health/* endpoints.
 *
 * HealthKit can't push to a web app directly, so the honest path is the
 * "Auto Health Export" iOS companion app: getAppleHealthSetup() returns a
 * webhook URL + a long-lived bearer token that the athlete pastes into that
 * app's REST-API automation. Once configured, the app POSTs workouts + metrics
 * to /apple-health/sync on a schedule.
 *
 * See backend/app/api/apple_health.py.
 */
import { apiClient } from './client'

export interface AppleHealthSetup {
  webhook_url: string
  token: string
  how_to: string
}

/** GET /apple-health/setup — webhook URL + bearer token for Auto Health Export. */
export async function getAppleHealthSetup(): Promise<AppleHealthSetup> {
  const res = await apiClient.get<AppleHealthSetup>('/apple-health/setup')
  return res.data
}
