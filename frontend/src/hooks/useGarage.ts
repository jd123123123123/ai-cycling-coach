import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchDayScene, fetchGarage, fetchRideScene, renderAsset, renderDayScene, renderRideScene,
  type DayPose, type DayScene, type Garage, type GarageKind, type RideScene,
} from '../api/garage'

export const GARAGE_KEY = ['garage'] as const

/**
 * The rider's garage — their digitalised rider figure and bike.
 *
 * This is the surface that answers "does this rider have a bike?". It is read
 * by the Today hero, the ride hero, the top-bar avatar, the biker page, the
 * bike studio and the avatar gate — six call sites, ONE query. They all pass
 * this same module-level constant as the key, so react-query serves them from a
 * single cache entry and de-duplicates the in-flight request: the response is
 * fetched once per staleTime window no matter how many of them are on screen.
 *
 * That matters more here than anywhere else in the app, because the payload is
 * not JSON-shaped metadata — `/garage` inlines the rider and bike collectibles
 * as base64 WebP, roughly 43 KB each. Refetching it per component would put
 * ~90 KB on the wire for pixels the app is already holding.
 *
 * `gcTime` is pinned rather than left to the client default because the default
 * used to be SHORTER than this staleTime (5 min vs 10), which quietly defeated
 * the caching: with every observer unmounted the entry was evicted at 5 minutes
 * and the next screen re-downloaded both images despite the 10-minute promise.
 * A collectible only changes when the rider deliberately re-renders one, and
 * that path invalidates this key itself.
 */
export function useGarage() {
  return useQuery<Garage>({
    queryKey: GARAGE_KEY,
    queryFn: fetchGarage,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
}

/** Render a photo into a collectible and keep it. Slow (vision + image model);
 *  the caller owns the waiting choreography. */
export function useRenderAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, photoBase64 }: { kind: GarageKind; photoBase64: string }) =>
      renderAsset(kind, photoBase64),
    onSuccess: (result) => {
      // Only a saved render changes the garage — a gated one leaves the
      // rider's existing bike exactly where it was.
      if (result.saved) qc.invalidateQueries({ queryKey: GARAGE_KEY })
    },
  })
}

/**
 * A ride's composed hero, read from the cache only. Safe on every ride-screen
 * open: it never triggers a render, it just reports whether one exists and, if
 * not, why (`needs_rider` / `needs_bike` / `not_generated`).
 */
export function useRideScene(activityId: number | null | undefined) {
  return useQuery<RideScene>({
    queryKey: ['garage', 'scene', activityId],
    queryFn: () => fetchRideScene(activityId as number),
    enabled: activityId != null,
    // Same reasoning as the garage: this returns an inlined base64 hero, and a
    // gcTime shorter than the staleTime would have evicted it long before it
    // went stale, re-downloading the image on every reopen of the ride.
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
}

/** Compose the hero for one ride. Explicit intent only — this is a slow, paid
 *  image-model call. The result is written straight into the scene cache so the
 *  screen switches over without a refetch. */
export function useRenderRideScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (activityId: number) => renderRideScene(activityId),
    onSuccess: (scene) => {
      qc.setQueryData(['garage', 'scene', scene.activity_id], scene)
    },
  })
}

/**
 * Today's hero for the day's pose, read from the cache only — the same contract
 * as `useRideScene`: safe on every Today open, never triggers a render, and
 * reports why there isn't one (`needs_rider` / `needs_bike` / `not_generated`).
 *
 * The key carries the pose because the server's cache does: one composed image
 * per pose per rider. Crossing from a rest day into a training day therefore
 * asks a DIFFERENT question rather than invalidating an answer, and the rest
 * scene is still there, already paid for, tomorrow morning.
 */
export function useDayScene(pose: DayPose | null | undefined) {
  return useQuery<DayScene>({
    queryKey: ['garage', 'scene', 'today', pose],
    queryFn: () => fetchDayScene(pose as DayPose),
    enabled: pose != null,
    // Inlined base64 image, like the garage read — see that hook for why gcTime
    // is pinned at least as long as staleTime.
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
}

/** Compose today's hero for one pose. Explicit intent only (a tap), slow and
 *  paid; the composed scene lands straight in the cache for that pose. */
export function useRenderDayScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pose: DayPose) => renderDayScene(pose),
    onSuccess: (scene) => {
      qc.setQueryData(['garage', 'scene', 'today', scene.pose], scene)
    },
  })
}
