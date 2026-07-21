/**
 * COROS API — wrappers around the /coros/* endpoints.
 *
 * OAuth2 authorization-code flow, mirroring Wahoo: getCorosConnectUrl() returns
 * the COROS authorize URL (built by the backend from its partner client id + a
 * signed state); the frontend opens it, the user consents, COROS redirects to
 * /coros/callback which stores the tokens and bounces back to /settings.
 *
 * COROS's official API is a PARTNER program — when the server has no partner
 * credentials, /coros/status reports configured=false so the UI shows an honest
 * "Bald verfügbar" state, and /coros/connect returns 409.
 *
 * See backend/app/api/coros.py.
 */
import { apiClient } from './client'

export interface CorosStatus {
  connected: boolean
  configured: boolean
  coros_user_id?: string | null
  last_sync?: string | null
}

export interface CorosSyncResponse {
  workouts_imported: number
  message: string
}

/** GET /coros/status — connection + server-configured state for the current user. */
export async function fetchCorosStatus(): Promise<CorosStatus> {
  const res = await apiClient.get<CorosStatus>('/coros/status')
  return res.data
}

/**
 * GET /coros/connect — the COROS authorize URL to open.
 * Throws with response.status 409 when the integration isn't configured
 * on the server (no partner client id/secret).
 */
export async function getCorosConnectUrl(): Promise<string> {
  const res = await apiClient.get<{ authorize_url: string }>('/coros/connect')
  return res.data.authorize_url
}

/** POST /coros/sync — pull new COROS activities into activities. */
export async function syncCoros(): Promise<CorosSyncResponse> {
  const res = await apiClient.post<CorosSyncResponse>('/coros/sync', undefined, {
    timeout: 30_000,
  })
  return res.data
}

/** DELETE /coros — disconnect the COROS account. */
export async function disconnectCoros(): Promise<void> {
  await apiClient.delete('/coros')
}
