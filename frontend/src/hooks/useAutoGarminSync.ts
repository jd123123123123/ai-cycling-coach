import { useEffect } from 'react'
import { useGarminStatus } from './useGarminStatus'
import { useForceSync } from './useForceSync'

// One quiet attempt per stale status. A successful sync changes last_sync_at;
// a failed attempt is not retried on every render or navigation.
const attempted = new Set<string>()
const STALE_AFTER_MS = 45 * 60 * 1000

export function useAutoGarminSync() {
  const { data: status } = useGarminStatus()
  const sync = useForceSync()
  useEffect(() => {
    if (!status?.connected || status.sync_enabled === false || status.sync_status === 'syncing' || sync.isPending) return
    const last = status.last_sync_at ? Date.parse(status.last_sync_at) : 0
    if (last && Date.now() - last < STALE_AFTER_MS) return
    const key = `${new Date().toISOString().slice(0, 10)}:${status.last_sync_at ?? 'never'}`
    if (attempted.has(key)) return
    attempted.add(key)
    sync.mutate()
  }, [status, sync])
}
