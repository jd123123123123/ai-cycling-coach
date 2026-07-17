/**
 * Wahoo API — wrappers around the /wahoo/* endpoints.
 *
 * OAuth2 authorization-code flow: getWahooConnectUrl() returns the Wahoo
 * authorize URL (built by the backend from its client id + a signed state);
 * the frontend opens it, the user consents, Wahoo redirects to
 * /wahoo/callback which stores the tokens and bounces back to /settings.
 *
 * See backend/app/api/wahoo.py.
 */
import { apiClient } from './client'

export interface WahooStatus {
  connected: boolean
  wahoo_user_id?: string | null
  last_sync?: string | null
}

export interface WahooSyncResponse {
  workouts_imported: number
  message: string
}

/** GET /wahoo/status — connection state for the current user. */
export async function fetchWahooStatus(): Promise<WahooStatus> {
  const res = await apiClient.get<WahooStatus>('/wahoo/status')
  return res.data
}

/**
 * GET /wahoo/connect — the Wahoo authorize URL to open.
 * Throws with response.status 409 when the integration isn't configured
 * on the server (no client id/secret) — callers should surface that state.
 */
export async function getWahooConnectUrl(): Promise<string> {
  const res = await apiClient.get<{ authorize_url: string }>('/wahoo/connect')
  return res.data.authorize_url
}

/** POST /wahoo/sync — pull new Wahoo workouts into activities. */
export async function syncWahoo(): Promise<WahooSyncResponse> {
  const res = await apiClient.post<WahooSyncResponse>('/wahoo/sync', undefined, {
    timeout: 30_000,
  })
  return res.data
}

/** DELETE /wahoo — disconnect the Wahoo account. */
export async function disconnectWahoo(): Promise<void> {
  await apiClient.delete('/wahoo')
}
