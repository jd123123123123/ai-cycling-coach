import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'

/**
 * Auto-open the post-ride celebration for a freshly-synced ride.
 *
 * The celebration screen (`/e/w3-ride-celebrate/:id`) exists but nothing fired
 * it — it was reachable only by direct URL. This hook, mounted on the W3 home
 * (Today), watches the athlete's recent cycling activities and, the first time a
 * NEW one appears (id not yet celebrated on this device) that is recent enough
 * to be a just-finished ride, navigates once to its celebration. Idempotent via
 * a localStorage high-water mark, so it never re-pops a ride the rider has seen.
 */
const KEY = 'w3_last_celebrated_ride'
const RECENT_HOURS = 36 // only celebrate a ride synced within ~1.5 days

function lastCelebrated(): number {
  try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 }
}
function markCelebrated(id: number) {
  try { localStorage.setItem(KEY, String(id)) } catch { /* best-effort */ }
}

export function useRideCelebration(enabled = true) {
  const navigate = useNavigate()
  const end = new Date()
  const start = new Date(end.getTime() - RECENT_HOURS * 3600_000)
  const { data } = useActivitiesRange(start, end)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!enabled || firedRef.current || !data?.activities?.length) return
    // Newest cycling ride in the window that actually earned load.
    const rides = data.activities
      .filter((a) => a.sport === 'cycling' && (a.tss ?? 0) > 0)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    const newest = rides[0]
    if (!newest) return

    const seen = lastCelebrated()
    // First run on a device with prior rides: seed the high-water mark so we
    // don't celebrate an old ride the very first time — only genuinely new ones.
    if (seen === 0) { markCelebrated(newest.id); return }

    if (newest.id > seen) {
      firedRef.current = true
      markCelebrated(newest.id)
      navigate(`/e/w3-ride-celebrate/${newest.id}`)
    }
  }, [enabled, data, navigate])
}
