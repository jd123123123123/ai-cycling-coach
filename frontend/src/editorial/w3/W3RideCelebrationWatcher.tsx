import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { fetchActivitiesRange } from '../../api/dashboard'
import { CHEST_KEY } from '../../hooks/useWallet'
import W3SceneUnlockNudge from './W3SceneUnlockNudge'

/**
 * W3 · New-ride watcher.
 *
 * IT USED TO NAVIGATE, and that was the wrong instinct. A ride landing would
 * throw the rider onto the celebration screen wherever they happened to be —
 * mid-plan, mid-scroll — and a reward that interrupts is indistinguishable from
 * a notification. Worse, it spent the whole moment before the rider had asked
 * for it: the screen opened, the coins were already banked, and there was
 * nothing left to do but close it.
 *
 * Now the ride's coins wait in a sealed chest and Today wears the lock (see
 * `W3RideChest`). This watcher's only job is to make sure that lock APPEARS
 * without a reload: when a ride shows up that the chest query has not seen yet,
 * it invalidates the chest so the bar arrives on its own.
 *
 * Same guards as before — only while authenticated, only inside the W3
 * experience — because a poll on a logged-out screen is pure waste.
 */

const RECENT_HOURS = 24

export default function W3RideCelebrationWatcher() {
  const location = useLocation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const lastSeen = useRef<string | null>(null)

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
    if (!inW3) return
    const rides = (data?.activities ?? []).filter((a) => a.sport === 'cycling')
    if (rides.length === 0) return

    const newest = rides.reduce(
      (m, a) => (new Date(a.started_at) > new Date(m.started_at) ? a : m), rides[0],
    )
    const ageH = (Date.now() - new Date(newest.started_at).getTime()) / 3_600_000
    if (ageH > RECENT_HOURS) return

    const id = String(newest.id)
    if (lastSeen.current === id) return
    lastSeen.current = id
    // The chest, not the screen. The rider decides when to open it.
    qc.invalidateQueries({ queryKey: CHEST_KEY })
    qc.invalidateQueries({ queryKey: ['garage', 'gallery'] })
    qc.invalidateQueries({ queryKey: ['garage', 'ride-unlocks'] })
  }, [data, inW3, qc])

  return <W3SceneUnlockNudge/>
}
