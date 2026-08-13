import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { fetchActivitiesRange } from '../../api/dashboard'

/**
 * W3 · Ride-celebration auto-trigger.
 *
 * A render-null watcher, mounted once inside the Router. When a NEW cycling ride
 * has synced it pops the celebration screen (pen `W3 · CELEBRATE 04 THE
 * SETTLE`, route `/e/w3-ride-celebrate/:id`) exactly once — then never again for
 * that ride (localStorage-deduped, so a hard refresh doesn't re-fire).
 *
 * Guards, so it can never hijack a session:
 *  - only inside the W3 experience (`/e/w3-*`), never mid-onboarding, mid-ride,
 *    or already on the celebrate/share screens;
 *  - only recent rides (synced within 24 h) — an old backlog ride never pops;
 *  - one navigation per ride id, recorded before navigating so a re-render or a
 *    second tab can't double-fire.
 *
 * Mount (in App.tsx, inside <BrowserRouter>, alongside the other always-on
 * providers):
 *   import W3RideCelebrationWatcher from './editorial/w3/W3RideCelebrationWatcher'
 *   … <W3RideCelebrationWatcher />
 */

const SEEN_KEY = 'w3.celebratedRideId'
const RECENT_HOURS = 24

// Routes where a celebration pop would be an interruption, not a reward.
const BLOCKED_PREFIXES = ['/e/w3-ride-celebrate', '/e/w3-onboard', '/e/w3-session', '/e/w3-share']

export default function W3RideCelebrationWatcher() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const firedRef = useRef(false)

  // Light poll of the last few days' rides — only while authenticated and only
  // inside the W3 experience, so logged-out / legacy screens never fetch.
  const inW3 = location.pathname.startsWith('/e/w3-')
  const { data } = useQuery({
    queryKey: ['w3-celebration-scan'],
    queryFn: () => {
      const from = new Date(); from.setDate(from.getDate() - 3)
      return fetchActivitiesRange(from, new Date())
    },
    enabled: !!user && inW3,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  })

  useEffect(() => {
    if (firedRef.current || !inW3) return
    if (BLOCKED_PREFIXES.some((p) => location.pathname.startsWith(p))) return
    const rides = (data?.activities ?? []).filter((a) => a.sport === 'cycling')
    if (rides.length === 0) return

    const newest = rides.reduce((m, a) => (new Date(a.started_at) > new Date(m.started_at) ? a : m), rides[0])
    const ageH = (Date.now() - new Date(newest.started_at).getTime()) / 3_600_000
    if (ageH > RECENT_HOURS) return

    let seen: string | null = null
    try { seen = localStorage.getItem(SEEN_KEY) } catch { /* private mode */ }
    if (seen === String(newest.id)) return

    // Record BEFORE navigating so a re-render / second tab can't double-fire.
    firedRef.current = true
    try { localStorage.setItem(SEEN_KEY, String(newest.id)) } catch { /* ignore */ }
    navigate(`/e/w3-ride-celebrate/${newest.id}`)
  }, [data, inW3, location.pathname, navigate])

  return null
}
