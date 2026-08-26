import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'

// API base. Precedence:
//   1. VITE_API_URL when set (explicit backend URL, e.g. local dev on :8042).
//   2. '' (same-origin, relative) in a production build — the backend serves
//      this SPA behind one public HTTPS origin, so /coach/brief etc. resolve to
//      the same host. Same-origin means cookies + auth "just work" (no CORS, no
//      Safari cross-site cookie blocking) — ideal for the iPhone PWA.
//   3. localhost:8042 as the dev fallback.
const BASE_URL =
  import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ''
    ? import.meta.env.VITE_API_URL
    : import.meta.env.PROD
      ? ''
      : 'http://localhost:8042'

/**
 * Canonical resolved API base — the SINGLE source of truth for every request
 * origin, axios or raw `fetch`. The streaming chat endpoints (/coach/chat)
 * bypass axios and must import THIS rather than re-deriving their own base:
 * a divergent fallback (the old `|| 'http://localhost:8000'`) resolves to a
 * dead port in a production build (VITE_API_URL unset) AND violates the strict
 * `connect-src 'self'` CSP — the fetch never lands and WebKit surfaces a bare
 * "Load failed". Same-origin '' in PROD is what makes cookies + CSP just work.
 */
export const API_BASE_URL: string = BASE_URL

// Access token stored in memory only — never in localStorage
let _accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  // A real token means the session is alive again — the refusal we remembered
  // is stale. Clearing the token (sign-out, a failed refresh) must NOT reset
  // it, or the latch would be lifted by the very failure that set it.
  if (token) _refreshFailed = false
  _accessToken = token
}

export function getAccessToken(): string | null {
  return _accessToken
}

// Callback to notify AuthContext that auth was cleared (e.g. refresh failed)
let _onAuthCleared: (() => void) | null = null

export function setAuthClearedCallback(cb: () => void): void {
  _onAuthCleared = cb
}

/**
 * How long any request may hang before it is called dead.
 *
 * There was no default at all — axios's own default is 0, meaning wait
 * forever. Individual slow calls set their own (the image renders ask for
 * 180 s), but everything else, `/auth/refresh` and `/auth/me` included, had no
 * bound. A request stalled by a phone changing networks never settled, and on
 * boot that is unrecoverable: `AuthProvider` awaits the refresh before it
 * clears `isLoading`, and `ProtectedRoute` shows the loading screen for the
 * whole of it — so a single stalled socket is a black screen that only a manual
 * reload escapes.
 *
 * 20 s is deliberately generous. It is not a latency budget; it is the line
 * past which waiting has stopped being waiting. Anything genuinely slower
 * overrides it per call, as those endpoints already do.
 */
const DEFAULT_TIMEOUT_MS = 20_000

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  withCredentials: true, // Required for httpOnly refresh token cookie
})

// Request interceptor: attach Authorization header if token exists
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (_accessToken) {
      config.headers.set('Authorization', `Bearer ${_accessToken}`)
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Track if refresh is already in progress to avoid parallel refresh calls
let _isRefreshing = false

// ── AND WHETHER IT HAS ALREADY DEFINITIVELY FAILED ─────────────────────────
// `_isRefreshing` only dedupes refreshes that OVERLAP. It says nothing about
// one that already came back 401, so every later read started its own full
// round-trip to a server that had just said no. Measured on production, a
// logged-out load spent four sequential requests on this (909, 1268, 1620,
// 1910 ms) — and that is the CHEAP case. A cold, logged-in start with an
// expired cookie fans out much wider: the room reads six endpoints and Today a
// dozen more, arriving in waves, each wave finding the flag back at false and
// paying for the same refusal again.
//
// A failed refresh is a fact about the SESSION, not about one request, so it is
// remembered until the session changes. `setAccessToken` clears it, which is
// the single choke point every successful login, register and refresh already
// goes through.
let _refreshFailed = false
let _failedQueue: Array<{
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null = null): void {
  _failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token)
    }
  })
  _failedQueue = []
}

// Response interceptor: on 401, try to refresh token, then retry original request
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Avoid infinite loop: don't retry refresh/login/register requests
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register')

    // A REFUSAL IS A REFUSAL, whoever asked. `AuthContext` calls `/auth/refresh`
    // directly to restore the session at boot, and that path is excluded from
    // the retry logic below — so without this, the very first and most certain
    // refusal of the load was the one nobody recorded, and the next read went
    // and asked again.
    if (error.response?.status === 401 && originalRequest?.url?.includes('/auth/refresh')) {
      _refreshFailed = true
    }

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      // The server has already refused to refresh this session. Asking again
      // for every read that follows cannot change the answer; it only spends
      // round-trips in front of a screen that is waiting to paint.
      if (_refreshFailed) {
        return Promise.reject(error)
      }

      if (_isRefreshing) {
        // Queue subsequent 401s while refresh is in progress
        return new Promise((resolve, reject) => {
          _failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`
          return apiClient(originalRequest)
        })
      }

      originalRequest._retry = true
      _isRefreshing = true

      try {
        const { data } = await apiClient.post('/auth/refresh')
        const newToken: string = data.access_token
        setAccessToken(newToken)
        processQueue(null, newToken)
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        _refreshFailed = true
        processQueue(refreshError, null)
        setAccessToken(null)
        _onAuthCleared?.()
        return Promise.reject(refreshError)
      } finally {
        _isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)
