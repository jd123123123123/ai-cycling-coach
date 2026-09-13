import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchGarminStatus } from '../api/dashboard'
import { GARMIN_SYNC_KEY, invalidateGarminData, useForceSync } from './useForceSync'

const POLL_MS = 30_000
const RUNNING_POLL_MS = 5_000
const REOPEN_DEBOUNCE_MS = 30_000
const FALLBACK_SYNC_MS = 5 * 60_000
const STATUS_KEY = ['garmin', 'status'] as const

/** Authenticated app lifecycle. A sync on entry, then observe server syncs too.
 * Timers stop in the background; foreground/online/pageshow start a fresh check.
 * Failure backoff is finite, unlike the old once-per-day attempted-status set. */
export function useAutoGarminSync(userId: number) {
  const qc = useQueryClient()
  const { mutateAsync } = useForceSync()
  useEffect(() => {
    let alive = true
    let busy = false
    let pendingOpen = true
    let lastAttempt = 0
    let retryAt = 0
    let failures = 0
    let lastObserved: string | null | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const storageKey = `ridr.garmin.attempt.${userId}`
    const visible = () => !document.hidden && navigator.onLine !== false
    const recentAttempt = () => {
      try { return Math.max(lastAttempt, Number(localStorage.getItem(storageKey)) || 0) }
      catch { return lastAttempt }
    }
    const schedule = (ms: number) => {
      clearTimeout(timer)
      if (alive && visible()) timer = setTimeout(() => void check(), ms)
    }
    const freshStatus = () => qc.fetchQuery({ queryKey: STATUS_KEY, queryFn: fetchGarminStatus, staleTime: 0, retry: false })
    const observe = (stamp: string | null) => {
      // Even the initial response may be newer than the persisted dashboard.
      if (stamp && stamp !== lastObserved) invalidateGarminData(qc, false)
      lastObserved = stamp
    }
    async function check(open = false) {
      if (!alive || busy) return
      pendingOpen ||= open
      if (!visible()) return
      busy = true
      let delay = POLL_MS
      try {
        const status = await freshStatus()
        if (!alive) return
        observe(status.last_sync_at)
        if (!status.connected || status.sync_enabled === false || status.sync_status === 'auth_error') {
          pendingOpen = false
          return
        }
        if (status.sync_status === 'syncing' || qc.isMutating({ mutationKey: GARMIN_SYNC_KEY })) {
          // Adopt the existing job and refresh its results instead of duplicating it.
          pendingOpen = false
          delay = RUNNING_POLL_MS
          return
        }
        const now = Date.now()
        const synced = status.last_sync_at ? Date.parse(status.last_sync_at) : 0
        const fallbackDue = now - recentAttempt() >= FALLBACK_SYNC_MS && (!synced || now - synced >= 2 * 60_000)
        if ((!pendingOpen && !fallbackDue) || now < retryAt) return
        pendingOpen = false
        if (now - recentAttempt() < REOPEN_DEBOUNCE_MS) return
        const start = async () => {
          if (!alive || !visible() || Date.now() - recentAttempt() < REOPEN_DEBOUNCE_MS) return
          // Cross-tab locks + a fresh server status avoid sending simultaneous
          // foreground requests. The server still authenticates/owns every sync.
          const current = await freshStatus()
          if (!alive) return
          observe(current.last_sync_at)
          if (!current.connected || current.sync_enabled === false || current.sync_status === 'auth_error') return
          if (current.sync_status === 'syncing' || current.last_sync_at !== status.last_sync_at || qc.isMutating({ mutationKey: GARMIN_SYNC_KEY })) { delay = RUNNING_POLL_MS; return }
          lastAttempt = Date.now()
          try { localStorage.setItem(storageKey, String(lastAttempt)) } catch { /* optional cross-tab debounce */ }
          await mutateAsync()
          failures = 0
          retryAt = 0
          delay = RUNNING_POLL_MS
        }
        if (navigator.locks?.request) {
          await navigator.locks.request(`ridr.garmin.sync.${userId}`, { ifAvailable: true }, async lock => {
            if (lock) await start()
            else delay = RUNNING_POLL_MS
          })
        } else await start()
      } catch (error) {
        if (!alive) return
        const code = (error as { response?: { status?: number } }).response?.status
        if (code === 409) {
          delay = RUNNING_POLL_MS
        } else {
          failures++
          retryAt = Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** Math.min(failures - 1, 5))
          pendingOpen = true
        }
      } finally {
        busy = false
        schedule(delay)
      }
    }
    const resume = () => { if (visible()) void check(true); else clearTimeout(timer) }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    window.addEventListener('online', resume)
    window.addEventListener('offline', resume)
    void check(true)
    return () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', resume)
    }
  }, [qc, mutateAsync, userId])
}
