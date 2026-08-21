import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { GEAR_KEY } from '../../hooks/useGear'
import { WORKSHOP_KEY } from '../../hooks/useWorkshop'
import { fetchGear } from '../../api/gear'
import { fetchWorkshop } from '../../api/workshop'

/**
 * OPEN EVERY DOOR IN THE ROOM BEFORE ANYONE KNOCKS.
 *
 * Tapping GARAGE used to cost two waits stacked on each other: a network
 * round-trip for the screen's JavaScript, and then two more for its data — so
 * the panel arrived empty and filled in later, on a screen whose whole subject
 * is what the panel says. Both are avoidable, because we know exactly which
 * screens the rider can reach from here: they are the tabs.
 *
 * So the room warms its neighbours while it is idle. The chunks come down over
 * a connection that is doing nothing anyway, and the queries land in the same
 * cache the screens read from, which means the tap costs a render and nothing
 * else.
 *
 * ── WHY `requestIdleCallback` AND NOT AN EFFECT THAT JUST RUNS ───────────
 * The screen the rider is ON is still painting, still decoding a large bike
 * render, still animating in. Prefetching is by definition not urgent, and
 * work that steals frames from the current screen to speed up a screen nobody
 * asked for is a downgrade. Idle time is exactly the budget for this. Safari
 * has no `requestIdleCallback`, so it gets a timeout — late is fine here;
 * early is not.
 *
 * ── WHY prefetchQuery AND NOT A SECOND useQuery ──────────────────────────
 * `prefetchQuery` respects the same `staleTime` the screens declare and never
 * re-requests something already fresh, so warming is free when the rider comes
 * back. A mounted query would also subscribe this component to the data and
 * re-render the whole room whenever the workshop odometer moved.
 */

type Idle = (cb: () => void) => number

const onIdle: Idle = (cb) =>
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback(() => cb(), { timeout: 2500 })
    : (setTimeout(cb, 900) as unknown as number)

const cancelIdle = (id: number) => {
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id)
  else clearTimeout(id)
}

export function useWarmRoom() {
  const qc = useQueryClient()
  useEffect(() => {
    const id = onIdle(() => {
      // The garage's panel is made of these two, and nothing else.
      void qc.prefetchQuery({ queryKey: GEAR_KEY, queryFn: fetchGear, staleTime: 60 * 1000 })
      void qc.prefetchQuery({ queryKey: WORKSHOP_KEY, queryFn: fetchWorkshop, staleTime: 30 * 1000 })
    })
    return () => cancelIdle(id)
  }, [qc])
}
